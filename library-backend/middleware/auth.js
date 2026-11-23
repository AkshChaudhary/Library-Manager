const { query } = require('../db');
const { HttpError } = require('../utils/http');
const { SESSION_COOKIE, hashToken, isStaff, STAFF_IDLE_MS } = require('../services/auth');

// requireAuth()            : checks the login and counts this request as activity.
// requireAuth({ touch: false }) : checks the login but does not reset the inactivity timer.
//                            The session-status endpoint uses this, so a page that only
//                            polls the timer doesn't keep a staff member logged in.
function requireAuth({ touch = true } = {}) {
  return async (req, res, next) => {
    try {
      const token = req.cookies ? req.cookies[SESSION_COOKIE] : null;
      if (!token) throw new HttpError(401, 'Please log in');

      const found = await query(
        `SELECT s.session_id, s.expires_at, s.last_seen_at,
                u.user_id, u.library_id, u.role, u.full_name, u.email,
                u.is_active, u.email_verified_at
         FROM sessions s
         JOIN users u ON u.user_id = s.user_id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > NOW()`,
        [hashToken(token)]
      );
      const row = found.rows[0];
      if (!row) throw new HttpError(401, 'Your session has ended. Please log in again.');

      if (!row.is_active || !row.email_verified_at) {
        await query('UPDATE sessions SET revoked_at = NOW() WHERE session_id = $1', [row.session_id]);
        throw new HttpError(401, 'This account cannot be used. Please log in again.');
      }

      if (isStaff(row.role)) {
        const idleAt = new Date(row.last_seen_at).getTime() + STAFF_IDLE_MS;
        if (Date.now() >= idleAt) {
          await query('UPDATE sessions SET revoked_at = NOW() WHERE session_id = $1', [row.session_id]);
          throw new HttpError(401, 'You were logged out after 30 minutes of inactivity.');
        }
      }

      if (touch) {
        await query('UPDATE sessions SET last_seen_at = NOW() WHERE session_id = $1', [row.session_id]);
      }

      req.user = {
        user_id: row.user_id,
        library_id: row.library_id,
        role: row.role,
        full_name: row.full_name,
        email: row.email,
      };
      req.authSession = {
        session_id: row.session_id,
        expires_at: row.expires_at,
        last_seen_at: row.last_seen_at,
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

// Use after requireAuth(). Example: requireRole('owner', 'librarian')
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new HttpError(403, 'You do not have permission to do this'));
    }
    return next();
  };
}

module.exports = { requireAuth, requireRole };