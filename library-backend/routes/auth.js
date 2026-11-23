const express = require('express');
const rateLimit = require('express-rate-limit');
const { query, withTransaction } = require('../db');
const { HttpError } = require('../utils/http');
const auth = require('../services/auth');
const { recordAudit } = require('../services/audit');
const { sendMail } = require('../services/mailer');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const APP_URL = process.env.APP_URL || 'http://localhost:3001';

// Max 20 auth attempts per IP every 15 minutes (login, signup, reset, verify).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait 15 minutes and try again.', status: 429 },
});

const INVALID_LOGIN = 'Invalid email or password.';
const SIGNUP_SENT = 'Thanks for signing up. Check your email for a verification link.';
const RESET_SENT = 'If an account exists for that email, a reset link has been sent.';

// POST /api/auth/signup  { library_slug, full_name, email, password }
router.post('/signup', authLimiter, async (req, res, next) => {
  try {
    const librarySlug = String(req.body?.library_slug || '').trim().toLowerCase();
    const fullName = String(req.body?.full_name || '').trim();
    const email = auth.normalizeEmail(req.body?.email);
    const password = req.body?.password;

    if (!librarySlug || !fullName || !email || !password) {
      throw new HttpError(400, 'All fields are required');
    }
    if (fullName.length > 150) throw new HttpError(400, 'Name is too long');
    if (!auth.isValidEmail(email)) throw new HttpError(400, 'Email is not valid');
    auth.validatePassword(password);

    const library = (await query('SELECT library_id FROM libraries WHERE slug = $1', [librarySlug])).rows[0];
    if (!library) throw new HttpError(404, 'Library not found. Check the link you were given.');

    const passwordHash = await auth.hashPassword(password);

    await withTransaction(async (q) => {
      const exists = await q('SELECT 1 FROM users WHERE email = $1', [email]);
      // Same reply either way, so people can't use this form to check which emails have accounts.
      if (exists.rows.length > 0) return;

      const created = await q(
        `INSERT INTO users (library_id, full_name, email, password_hash, role)
         VALUES ($1, $2, $3, $4, 'member')
         RETURNING user_id`,
        [library.library_id, fullName, email, passwordHash]
      );
      const userId = created.rows[0].user_id;

      const token = await auth.issueToken(q, userId, 'verify_email', auth.VERIFY_TOKEN_MS);
      await sendMail({
        to: email,
        subject: 'Verify your library account',
        text: `Verify your email by opening this link:\n${APP_URL}/verify-email?token=${token}\n\nThe link expires in 24 hours.`,
      });

      await recordAudit(q, {
        library_id: library.library_id,
        actor_user_id: userId,
        action: 'signup',
        entity: 'user',
        entity_id: userId,
        ip: req.ip,
      });
    });

    res.status(201).json({ message: SIGNUP_SENT });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/verify-email  { token }
router.post('/verify-email', authLimiter, async (req, res, next) => {
  try {
    await withTransaction(async (q) => {
      const userId = await auth.consumeToken(q, req.body?.token, 'verify_email');
      const libraryId = await auth.libraryOf(q, userId);
      await q(
        'UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW() WHERE user_id = $1',
        [userId]
      );
      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: userId,
        action: 'email_verified',
        entity: 'user',
        entity_id: userId,
      });
    });
    res.json({ message: 'Email verified. You can log in now.' });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login  { email, password }
router.post('/login', authLimiter, async (req, res, next) => {
  try {
    const email = auth.normalizeEmail(req.body?.email);
    const password = String(req.body?.password || '');
    if (!email || !password) throw new HttpError(400, 'Email and password are required');

    const found = await query(
      `SELECT user_id, library_id, role, full_name, email, password_hash, is_active,
              email_verified_at, failed_login_count, locked_until
       FROM users WHERE email = $1`,
      [email]
    );
    const user = found.rows[0];

    // Always run one bcrypt check, so response time doesn't reveal whether the email exists.
    const passwordOk = await auth.verifyPassword(password, (user && user.password_hash) || auth.DUMMY_HASH);

    if (!user || !user.password_hash) throw new HttpError(401, INVALID_LOGIN);

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      throw new HttpError(423, `Too many failed attempts. Try again in ${auth.LOCK_MINUTES} minutes.`);
    }

    if (!passwordOk) {
      // Counts the failure. After 5 failures the account locks for 15 minutes.
      await query(
        `UPDATE users SET
           failed_login_count = CASE WHEN failed_login_count + 1 >= $2 THEN 0 ELSE failed_login_count + 1 END,
           locked_until = CASE WHEN failed_login_count + 1 >= $2
                               THEN NOW() + ($3::int * INTERVAL '1 minute')
                               ELSE locked_until END
         WHERE user_id = $1`,
        [user.user_id, auth.MAX_FAILED_LOGINS, auth.LOCK_MINUTES]
      );
      await recordAudit(query, {
        library_id: user.library_id,
        actor_user_id: user.user_id,
        action: 'login_failed',
        entity: 'user',
        entity_id: user.user_id,
        ip: req.ip,
      });
      throw new HttpError(401, INVALID_LOGIN);
    }

    if (!user.is_active) {
      throw new HttpError(403, 'This account has been disabled. Contact your library.');
    }
    if (!user.email_verified_at) {
      throw new HttpError(403, 'Please verify your email before logging in. Check your inbox.');
    }

    const session = await withTransaction(async (q) => {
      await q(
        'UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = NOW() WHERE user_id = $1',
        [user.user_id]
      );
      const started = await auth.startSession(q, user, req);
      await recordAudit(q, {
        library_id: user.library_id,
        actor_user_id: user.user_id,
        action: 'login',
        entity: 'user',
        entity_id: user.user_id,
        ip: req.ip,
      });
      return started;
    });

    auth.setSessionCookie(res, session.token, user.role);
    res.json({ user: auth.publicUser(user), session: session.description });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/logout  (no body)
router.post('/logout', async (req, res, next) => {
  try {
    await auth.revokeSessionByToken(query, req.cookies ? req.cookies[auth.SESSION_COOKIE] : null);
    auth.clearSessionCookie(res);
    res.json({ message: 'Logged out' });
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me
router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

// GET /api/auth/session  (the timer endpoint; does NOT count as activity)
router.get('/session', requireAuth({ touch: false }), (req, res) => {
  res.json({
    user: req.user,
    session: auth.describeSession(req.user.role, req.authSession.expires_at, req.authSession.last_seen_at),
  });
});

// POST /api/auth/extend  ("Stay signed in": new token, full length, old token revoked)
router.post('/extend', requireAuth(), async (req, res, next) => {
  try {
    const oldToken = req.cookies ? req.cookies[auth.SESSION_COOKIE] : null;
    const session = await withTransaction(async (q) => {
      await auth.revokeSessionByToken(q, oldToken);
      return auth.startSession(q, req.user, req);
    });
    auth.setSessionCookie(res, session.token, req.user.role);
    res.json({ message: 'Session extended', session: session.description });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/change-password  { current_password, new_password }
router.post('/change-password', requireAuth(), async (req, res, next) => {
  try {
    const currentPassword = String(req.body?.current_password || '');
    const newPassword = req.body?.new_password;

    const row = (await query('SELECT password_hash FROM users WHERE user_id = $1', [req.user.user_id])).rows[0];
    const ok = await auth.verifyPassword(currentPassword, (row && row.password_hash) || auth.DUMMY_HASH);
    if (!ok) throw new HttpError(400, 'Current password is incorrect');

    auth.validatePassword(newPassword);
    if (newPassword === currentPassword) {
      throw new HttpError(400, 'New password must be different from the current one');
    }

    const passwordHash = await auth.hashPassword(newPassword);

    const session = await withTransaction(async (q) => {
      await q('UPDATE users SET password_hash = $2, updated_at = NOW() WHERE user_id = $1', [
        req.user.user_id,
        passwordHash,
      ]);
      // Logs out every other device, then starts a fresh session on this one.
      await auth.revokeAllSessions(q, req.user.user_id);
      const started = await auth.startSession(q, req.user, req);
      await recordAudit(q, {
        library_id: req.user.library_id,
        actor_user_id: req.user.user_id,
        action: 'password_changed',
        entity: 'user',
        entity_id: req.user.user_id,
        ip: req.ip,
      });
      return started;
    });

    auth.setSessionCookie(res, session.token, req.user.role);
    res.json({
      message: 'Password changed. You were logged out on other devices.',
      session: session.description,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/forgot-password  { email }
router.post('/forgot-password', authLimiter, async (req, res, next) => {
  try {
    const email = auth.normalizeEmail(req.body?.email);
    const found = email
      ? (await query('SELECT user_id, library_id FROM users WHERE email = $1 AND is_active = TRUE', [email])).rows[0]
      : null;

    if (found) {
      await withTransaction(async (q) => {
        const token = await auth.issueToken(q, found.user_id, 'reset_password', auth.RESET_TOKEN_MS);
        await sendMail({
          to: email,
          subject: 'Reset your password',
          text: `Reset your password by opening this link:\n${APP_URL}/reset-password?token=${token}\n\nThe link expires in 30 minutes. If you did not ask for this, you can ignore this email.`,
        });
        await recordAudit(q, {
          library_id: found.library_id,
          actor_user_id: found.user_id,
          action: 'password_reset_requested',
          entity: 'user',
          entity_id: found.user_id,
          ip: req.ip,
        });
      });
    }

    // Same reply whether or not the account exists.
    res.json({ message: RESET_SENT });
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/reset-password  { token, password }
router.post('/reset-password', authLimiter, async (req, res, next) => {
  try {
    const password = req.body?.password;
    auth.validatePassword(password);
    const passwordHash = await auth.hashPassword(password);

    await withTransaction(async (q) => {
      const userId = await auth.consumeToken(q, req.body?.token, 'reset_password');
      const libraryId = await auth.libraryOf(q, userId);

      // Using the emailed link also proves the inbox belongs to this person.
      await q(
        `UPDATE users SET password_hash = $2, failed_login_count = 0, locked_until = NULL,
                email_verified_at = COALESCE(email_verified_at, NOW()), updated_at = NOW()
         WHERE user_id = $1`,
        [userId, passwordHash]
      );
      await auth.revokeAllSessions(q, userId);
      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: userId,
        action: 'password_reset',
        entity: 'user',
        entity_id: userId,
        ip: req.ip,
      });
    });

    res.json({ message: 'Password updated. Please log in with your new password.' });
  } catch (error) {
    next(error);
  }
});

module.exports = router;