const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { query } = require('../db');
const { HttpError } = require('../utils/http');

const SESSION_COOKIE = 'lh_session';
const BCRYPT_ROUNDS = 12;

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// Session rules (approved)
const MEMBER_SESSION_MS = 7 * DAY;
const STAFF_SESSION_MS = 12 * HOUR;
const MEMBER_WARN_BEFORE_MS = DAY;        // banner 24h before expiry
const MEMBER_FINAL_WARN_BEFORE_MS = HOUR; // final warning 1h before expiry
const STAFF_WARN_BEFORE_MS = HOUR;        // banner 1h before expiry
const STAFF_FINAL_WARN_BEFORE_MS = 5 * MINUTE;
const STAFF_IDLE_MS = 30 * MINUTE;        // staff logged out after 30 min inactivity
const STAFF_IDLE_WARN_BEFORE_MS = 5 * MINUTE;

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const RESET_TOKEN_MS = 30 * MINUTE;
const VERIFY_TOKEN_MS = 24 * HOUR;

// Used when an email has no account, so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), BCRYPT_ROUNDS);

function isStaff(role) {
  return role === 'owner' || role === 'librarian';
}

function sessionLengthMs(role) {
  return isStaff(role) ? STAFF_SESSION_MS : MEMBER_SESSION_MS;
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

// Only the hash of a token is stored, so a database leak doesn't expose live sessions.
function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmail(value) {
  return value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validatePassword(password) {
  if (typeof password !== 'string' || password.length < 10) {
    throw new HttpError(400, 'Password must be at least 10 characters');
  }
  // bcrypt only uses the first 72 bytes, so longer passwords would be silently cut.
  if (Buffer.byteLength(password, 'utf8') > 72) {
    throw new HttpError(400, 'Password is too long (maximum 72 bytes)');
  }
}

function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

const iso = (ms) => new Date(ms).toISOString();

// Tells the frontend when to warn and when to log out.
// Member:  warn_at = 24h before expiry, final_warn_at = 1h before, logout_at = expiry.
// Staff:   warn_at = 1h before expiry or 5 min before idle logout (whichever is first),
//          final_warn_at = 5 min before expiry, logout_at = expiry or idle logout.
function describeSession(role, expiresAt, lastSeenAt) {
  const now = Date.now();
  const expires = new Date(expiresAt).getTime();

  if (!isStaff(role)) {
    return {
      staff: false,
      expires_at: iso(expires),
      idle_timeout_at: null,
      logout_at: iso(expires),
      warn_at: iso(expires - MEMBER_WARN_BEFORE_MS),
      final_warn_at: iso(expires - MEMBER_FINAL_WARN_BEFORE_MS),
      server_time: iso(now),
    };
  }

  const idle = new Date(lastSeenAt).getTime() + STAFF_IDLE_MS;
  return {
    staff: true,
    expires_at: iso(expires),
    idle_timeout_at: iso(idle),
    logout_at: iso(Math.min(expires, idle)),
    warn_at: iso(Math.min(expires - STAFF_WARN_BEFORE_MS, idle - STAFF_IDLE_WARN_BEFORE_MS)),
    final_warn_at: iso(expires - STAFF_FINAL_WARN_BEFORE_MS),
    server_time: iso(now),
  };
}

function publicUser(row) {
  return {
    user_id: row.user_id,
    full_name: row.full_name,
    email: row.email,
    role: row.role,
    library_id: row.library_id,
  };
}

// Creates a session row. q is either query() or a transaction query function.
async function startSession(q, user, req) {
  const token = newToken();
  const expiresAt = new Date(Date.now() + sessionLengthMs(user.role));
  const userAgent = (req.get('user-agent') || '').slice(0, 300) || null;

  const inserted = await q(
    `INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at, last_seen_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     RETURNING last_seen_at`,
    [user.user_id, hashToken(token), userAgent, req.ip || null, expiresAt]
  );

  return {
    token,
    description: describeSession(user.role, expiresAt, inserted.rows[0].last_seen_at),
  };
}

async function revokeSessionByToken(q, token) {
  if (!token) return;
  await q('UPDATE sessions SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [
    hashToken(token),
  ]);
}

async function revokeAllSessions(q, userId) {
  await q('UPDATE sessions SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}

// One-time tokens for email verification and password reset.
async function issueToken(q, userId, purpose, ttlMs) {
  // Any older unused link for this purpose stops working.
  await q('UPDATE auth_tokens SET used_at = NOW() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL', [
    userId,
    purpose,
  ]);

  const token = newToken();
  await q(
    'INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [userId, purpose, hashToken(token), new Date(Date.now() + ttlMs)]
  );
  return token;
}

// Must run inside a transaction, because it locks the row.
async function consumeToken(q, token, purpose) {
  const invalid = new HttpError(400, 'This link is invalid or has expired. Please request a new one.');
  if (typeof token !== 'string' || !token) throw invalid;

  const found = await q(
    `SELECT token_id, user_id FROM auth_tokens
     WHERE token_hash = $1 AND purpose = $2 AND used_at IS NULL AND expires_at > NOW()
     FOR UPDATE`,
    [hashToken(token), purpose]
  );
  if (found.rows.length === 0) throw invalid;

  await q('UPDATE auth_tokens SET used_at = NOW() WHERE token_id = $1', [found.rows[0].token_id]);
  return found.rows[0].user_id;
}

async function libraryOf(q, userId) {
  const r = await q('SELECT library_id FROM users WHERE user_id = $1', [userId]);
  return r.rows[0] ? r.rows[0].library_id : null;
}

function setSessionCookie(res, token, role) {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    maxAge: sessionLengthMs(role),
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.COOKIE_SECURE === 'true',
    path: '/',
  });
}

module.exports = {
  SESSION_COOKIE,
  MAX_FAILED_LOGINS,
  LOCK_MINUTES,
  RESET_TOKEN_MS,
  VERIFY_TOKEN_MS,
  STAFF_IDLE_MS,
  DUMMY_HASH,
  isStaff,
  hashToken,
  normalizeEmail,
  isValidEmail,
  validatePassword,
  hashPassword,
  verifyPassword,
  describeSession,
  publicUser,
  startSession,
  revokeSessionByToken,
  revokeAllSessions,
  issueToken,
  consumeToken,
  libraryOf,
  setSessionCookie,
  clearSessionCookie,
};