const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { HttpError, parseId } = require('../utils/http');
const auth = require('../services/auth');
const { recordAudit } = require('../services/audit');
const { sendMail } = require('../services/mailer');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = requireRole('owner', 'librarian');
const APP_URL = process.env.APP_URL || 'http://localhost:3001';
const PUBLIC_COLUMNS = `user_id, full_name, email, role, phone, is_active, library_id,
                        email_verified_at, last_login_at`;

const same = (a, b) => String(a) === String(b);

// Who may change another account. Librarians manage members only; the owner manages everyone else.
function canManage(actor, target) {
  if (same(actor.user_id, target.user_id)) return true;
  if (actor.role === 'owner') return target.role !== 'owner';
  if (actor.role === 'librarian') return target.role === 'member';
  return false;
}

router.use(requireAuth());

// GET /api/users (staff only, own library)
router.get('/', STAFF, async (req, res, next) => {
  try {
    const result = await query(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE library_id = $1 ORDER BY user_id ASC`,
      [req.user.library_id]
    );
    res.json({ users: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/users/:user_id (staff, or the member themselves)
router.get('/:user_id', async (req, res, next) => {
  try {
    const userId = parseId(req.params.user_id, 'user_id');
    if (!same(userId, req.user.user_id) && !auth.isStaff(req.user.role)) {
      throw new HttpError(403, 'You do not have permission to do this');
    }

    const result = await query(
      `SELECT ${PUBLIC_COLUMNS} FROM users WHERE user_id = $1 AND library_id = $2`,
      [userId, req.user.library_id]
    );
    if (result.rows.length === 0) throw new HttpError(404, 'User not found');
    res.json({ user: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/users (staff adds a member; the member gets a link to set their password)
router.post('/', STAFF, async (req, res, next) => {
  try {
    const libraryId = req.user.library_id;
    const fullName = String(req.body?.full_name || '').trim();
    const email = auth.normalizeEmail(req.body?.email);
    const phone = req.body?.phone ? String(req.body.phone).trim().slice(0, 30) : null;

    if (!fullName) throw new HttpError(400, 'Missing required field: full_name');
    if (fullName.length > 150) throw new HttpError(400, 'Name is too long');
    if (!email) throw new HttpError(400, 'Missing required field: email');
    if (!auth.isValidEmail(email)) throw new HttpError(400, 'Email is not valid');

    const taken = await query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (taken.rows.length > 0) throw new HttpError(400, 'That email already has an account');

    const user = await withTransaction(async (q) => {
      const created = await q(
        `INSERT INTO users (library_id, full_name, email, role, phone)
         VALUES ($1, $2, $3, 'member', $4)
         RETURNING user_id`,
        [libraryId, fullName, email, phone]
      );
      const userId = created.rows[0].user_id;

      const token = await auth.issueToken(q, userId, 'reset_password', auth.RESET_TOKEN_MS);
      await sendMail({
        to: email,
        subject: 'Your library account is ready',
        text: `A library account was created for you.\nSet your password by opening this link:\n${APP_URL}/reset-password?token=${token}\n\nThe link expires in 30 minutes. If it expires, use "Forgot password" on the login page.`,
      });

      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: req.user.user_id,
        action: 'member_created',
        entity: 'user',
        entity_id: userId,
        ip: req.ip,
      });

      const row = await q(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE user_id = $1`, [userId]);
      return row.rows[0];
    });

    res.status(201).json({ user });
  } catch (error) {
    next(error);
  }
});

// PUT /api/users/:user_id
router.put('/:user_id', async (req, res, next) => {
  try {
    const libraryId = req.user.library_id;
    const userId = parseId(req.params.user_id, 'user_id');
    const body = req.body || {};

    const target = (
      await query('SELECT user_id, role, is_active FROM users WHERE user_id = $1 AND library_id = $2', [
        userId,
        libraryId,
      ])
    ).rows[0];
    if (!target) throw new HttpError(404, 'User not found');

    if (!canManage(req.user, target)) {
      throw new HttpError(403, 'You do not have permission to change this account');
    }

    const self = same(target.user_id, req.user.user_id);
    const sets = [];
    const values = [];
    const add = (column, value) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };

    if (body.full_name !== undefined) {
      const name = String(body.full_name).trim();
      if (!name || name.length > 150) throw new HttpError(400, 'Name must be 1 to 150 characters');
      add('full_name', name);
    }

    if (body.phone !== undefined) {
      add('phone', body.phone ? String(body.phone).trim().slice(0, 30) : null);
    }

    if (body.is_active !== undefined) {
      if (self) throw new HttpError(400, 'You cannot deactivate your own account');
      add('is_active', Boolean(body.is_active));
    }

    if (sets.length === 0) throw new HttpError(400, 'No valid fields provided to update');

    values.push(userId, libraryId);
    const updated = await query(
      `UPDATE users SET ${sets.join(', ')}, updated_at = NOW()
       WHERE user_id = $${values.length - 1} AND library_id = $${values.length}
       RETURNING ${PUBLIC_COLUMNS}`,
      values
    );

    await recordAudit(query, {
      library_id: libraryId,
      actor_user_id: req.user.user_id,
      action: 'user_updated',
      entity: 'user',
      entity_id: userId,
      details: { fields: Object.keys(body).filter((k) => ['full_name', 'phone', 'is_active'].includes(k)) },
      ip: req.ip,
    });

    res.json({ user: updated.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;