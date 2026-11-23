const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { HttpError, parseId } = require('../utils/http');
const { getFineRules, calculateFine } = require('../services/fines');
const { recordAudit } = require('../services/audit');
const auth = require('../services/auth');
const { requireAuth, requireRole } = require('../middleware/auth');

const OWNER = requireRole('owner');
const STAFF = requireRole('owner', 'librarian');
const DAY_MS = 24 * 60 * 60 * 1000;

const RULE_LIMITS = {
  per_day_amount: { min: 0, max: 100 },
  grace_days: { min: 0, max: 365 },
  max_amount: { min: 0, max: 1000 },
};

router.use(requireAuth());

// GET /api/fines/rules  (everyone in the library can read the rules)
router.get('/rules', async (req, res, next) => {
  try {
    const rules = await getFineRules(query, req.user.library_id);
    res.json({ rules });
  } catch (error) {
    next(error);
  }
});

// PUT /api/fines/rules  (owner only; every change is logged with old and new values)
router.put('/rules', OWNER, async (req, res, next) => {
  try {
    const libraryId = req.user.library_id;
    const body = req.body || {};

    const updates = {};
    for (const [key, limit] of Object.entries(RULE_LIMITS)) {
      if (body[key] === undefined) continue;
      const value = Number(body[key]);
      if (Number.isNaN(value) || value < limit.min || value > limit.max) {
        throw new HttpError(400, `${key} must be between ${limit.min} and ${limit.max}`);
      }
      updates[key] = value;
    }
    if (Object.keys(updates).length === 0) throw new HttpError(400, 'No rule values provided');

    const result = await withTransaction(async (q) => {
      const before = await getFineRules(q, libraryId);

            const sets = [];
      const values = [];
      for (const [key, value] of Object.entries(updates)) {
        values.push(value);
        sets.push(`${key} = $${values.length}`);
      }

      // The two extra placeholders come right after the rule values.
      const updatedByPos = values.length + 1;
      const libraryPos = values.length + 2;
      values.push(req.user.user_id, libraryId);

      await q(
        `UPDATE fine_rules SET ${sets.join(', ')}, updated_at = NOW(),
                updated_by = $${updatedByPos}
         WHERE library_id = $${libraryPos}`,
        values
      );

      const after = await getFineRules(q, libraryId);

      const changed = {};
      for (const key of Object.keys(updates)) {
        changed[key] = { from: before[key], to: after[key] };
      }
      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: req.user.user_id,
        action: 'fine_rules_changed',
        entity: 'fine_rules',
        entity_id: libraryId,
        details: changed,
        ip: req.ip,
      });

      return after;
    });

    res.json({ rules: result });
  } catch (error) {
    next(error);
  }
});

// GET /api/fines
// recorded: fines saved at return time (staff see all; members see their own)
// accruing: fines on loans that are overdue right now, calculated live from the rules
router.get('/', async (req, res, next) => {
  try {
    const libraryId = req.user.library_id;
    const staff = auth.isStaff(req.user.role);
    const userFilter = staff ? '' : ' AND f.user_id = $2';
    const params = staff ? [libraryId] : [libraryId, req.user.user_id];

    const recorded = await query(
      `SELECT f.fine_id, f.issue_id, f.user_id, u.full_name AS user_name, b.title AS book_title,
              f.days_charged, f.amount::float AS amount, f.status, f.paid_at
       FROM fines f
       JOIN users u ON u.user_id = f.user_id
       JOIN issues i ON i.issue_id = f.issue_id
       JOIN books b ON b.book_id = i.book_id
       WHERE f.library_id = $1${userFilter}
       ORDER BY f.fine_id DESC`,
      params
    );

    const liveUserFilter = staff ? '' : ' AND i.user_id = $2';
    const overdue = await query(
      `SELECT i.issue_id, i.user_id, i.due_at, u.full_name AS user_name, b.title AS book_title
       FROM issues i
       JOIN users u ON u.user_id = i.user_id
       JOIN books b ON b.book_id = i.book_id
       WHERE i.library_id = $1 AND i.status IN ('pending', 'overdue') AND i.due_at < NOW()${liveUserFilter}
       ORDER BY i.due_at ASC`,
      params
    );

    const rules = await getFineRules(query, libraryId);
    const accruing = overdue.rows.map((row) => {
      const live = calculateFine(rules, row.due_at, new Date());
      return {
        issue_id: row.issue_id,
        user_id: row.user_id,
        user_name: row.user_name,
        book_title: row.book_title,
        due_at: row.due_at,
        days_charged: live.days_overdue,
        amount: live.fine_amount,
        status: 'accruing',
      };
    });

    const totalOpen = [
      ...recorded.rows.filter((f) => f.status === 'open').map((f) => f.amount),
      ...accruing.map((f) => f.amount),
    ].reduce((sum, n) => sum + n, 0);

    res.json({
      recorded: recorded.rows,
      accruing,
      total_open: Number(totalOpen.toFixed(2)),
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/fines/:fine_id/pay  (staff records that cash was received; the amount never changes)
router.post('/:fine_id/pay', STAFF, async (req, res, next) => {
  try {
    const fineId = parseId(req.params.fine_id, 'fine_id');
    const libraryId = req.user.library_id;

    const paid = await withTransaction(async (q) => {
      const current = await q('SELECT * FROM fines WHERE fine_id = $1 AND library_id = $2 FOR UPDATE', [
        fineId,
        libraryId,
      ]);
      if (current.rows.length === 0) throw new HttpError(404, 'Fine not found');
      if (current.rows[0].status === 'paid') throw new HttpError(400, 'This fine is already paid');

      const updated = await q(
        `UPDATE fines SET status = 'paid', paid_at = NOW(), paid_by = $2, updated_at = NOW()
         WHERE fine_id = $1 RETURNING fine_id, amount::float AS amount, status, paid_at`,
        [fineId, req.user.user_id]
      );

      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: req.user.user_id,
        action: 'fine_paid',
        entity: 'fine',
        entity_id: fineId,
        details: { amount: updated.rows[0].amount },
        ip: req.ip,
      });

      return updated.rows[0];
    });

    res.json({ fine: paid });
  } catch (error) {
    next(error);
  }
});

module.exports = router;