const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { HttpError, parseId } = require('../utils/http');
const { getFineRules, calculateFine } = require('../services/fines');
const { releaseOrPromote } = require('../services/lifecycle');
const { recordAudit } = require('../services/audit');
const auth = require('../services/auth');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = requireRole('owner', 'librarian');
const same = (a, b) => String(a) === String(b);

const RETURN_SELECT = `
  SELECT r.return_id, r.issue_id, r.returned_by_user_id, r.returned_at, r.condition_notes,
         r.status, r.days_overdue, r.fine_amount::float AS fine_amount
  FROM returns r
  JOIN issues i ON i.issue_id = r.issue_id
`;

// Staff see every return in their library. Members see returns for their own loans.
function returnScope(req, offset = 0) {
  const lib = req.user.library_id;
  if (auth.isStaff(req.user.role)) {
    return { where: `r.library_id = $${offset + 1}`, params: [lib] };
  }
  return {
    where: `r.library_id = $${offset + 1} AND i.user_id = $${offset + 2}`,
    params: [lib, req.user.user_id],
  };
}

router.use(requireAuth());

// GET /api/returns
router.get('/', async (req, res, next) => {
  try {
    const scope = returnScope(req);
    const result = await query(`${RETURN_SELECT} WHERE ${scope.where} ORDER BY r.return_id ASC`, scope.params);
    res.json({ returns: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/returns/:return_id
router.get('/:return_id', async (req, res, next) => {
  try {
    const returnId = parseId(req.params.return_id, 'return_id');
    const scope = returnScope(req, 1);
    const result = await query(`${RETURN_SELECT} WHERE r.return_id = $1 AND ${scope.where}`, [
      returnId,
      ...scope.params,
    ]);
    if (result.rows.length === 0) throw new HttpError(404, 'Return record not found');
    res.json({ return: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/returns (staff only). The receiving librarian is the logged-in user.
router.post('/', STAFF, async (req, res, next) => {
  try {
    const { issue_id, condition_notes } = req.body || {};
    if (!issue_id) throw new HttpError(400, 'Missing required field: issue_id');

    const libraryId = req.user.library_id;
    const issueId = parseId(issue_id, 'issue_id');

    const outcome = await withTransaction(async (q) => {
      const issueRes = await q('SELECT * FROM issues WHERE issue_id = $1 AND library_id = $2 FOR UPDATE', [
        issueId,
        libraryId,
      ]);
      if (issueRes.rows.length === 0) throw new HttpError(400, 'Issue does not exist');

      const issue = issueRes.rows[0];
      if (issue.status === 'completed') throw new HttpError(400, 'Issue already completed');

      const returnedAt = new Date();
      const rules = await getFineRules(q, libraryId);
      const fine = calculateFine(rules, issue.due_at, returnedAt);

      const inserted = await q(
        `INSERT INTO returns (library_id, issue_id, returned_by_user_id, returned_at, condition_notes,
                              status, days_overdue, fine_amount)
         VALUES ($1, $2, $3, $4, $5, 'completed', $6, $7)
         RETURNING return_id, issue_id, returned_by_user_id, returned_at, condition_notes, status,
                   days_overdue, fine_amount::float AS fine_amount`,
        [libraryId, issueId, req.user.user_id, returnedAt, condition_notes || null, fine.days_overdue, fine.fine_amount]
      );
      
      if (fine.fine_amount > 0) {
        await q(
          `INSERT INTO fines (library_id, issue_id, user_id, days_charged, amount)
          VALUES ($1, $2, $3, $4, $5)`,
          [libraryId, issueId, issue.user_id, fine.days_overdue, fine.fine_amount]
        );
      }

      await q("UPDATE issues SET status = 'completed', returned_at = $2, updated_at = NOW() WHERE issue_id = $1", [
        issueId,
        returnedAt,
      ]);

      await q("UPDATE books SET status = 'available', updated_at = NOW() WHERE book_id = $1", [issue.book_id]);
      const nextHold = await releaseOrPromote(q, issue.book_id);

      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: req.user.user_id,
        action: 'return',
        entity: 'issue',
        entity_id: issueId,
        details: { days_overdue: fine.days_overdue, fine_amount: fine.fine_amount },
        ip: req.ip,
      });

      return { record: inserted.rows[0], nextHold };
    });

    res.status(201).json({
      return: outcome.record,
      fine: {
        days_overdue: outcome.record.days_overdue,
        fine_amount: outcome.record.fine_amount,
      },
      next_in_line: outcome.nextHold
        ? {
            reservation_id: outcome.nextHold.reservation_id,
            user_id: outcome.nextHold.user_id,
            expires_at: outcome.nextHold.expires_at,
          }
        : null,
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;