const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { HttpError, parseId } = require('../utils/http');
const { releaseOrPromote, expireStaleReservations, markOverdueIssues } = require('../services/lifecycle');
const { recordAudit } = require('../services/audit');
const auth = require('../services/auth');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = requireRole('owner', 'librarian');
const MAX_ACTIVE_LOANS = 5;
const MAX_LOAN_DAYS = 90;
const VALID_ISSUE_STATUS = ['pending', 'overdue'];
const same = (a, b) => String(a) === String(b);

const ISSUE_SELECT = `
  SELECT i.issue_id, i.user_id, i.book_id, i.issued_at, i.due_at, i.returned_at, i.status,
         u.full_name AS user_name, b.title AS book_title, b.isbn AS book_isbn, b.shelf_location
  FROM issues i
  JOIN users u ON u.user_id = i.user_id
  JOIN books b ON b.book_id = i.book_id
`;

// Staff see every loan in their library. Members see only their own loans.
// offset lets the caller add its own placeholders before this clause.
function issueScope(req, offset = 0) {
  const lib = req.user.library_id;
  if (auth.isStaff(req.user.role)) {
    return { where: `i.library_id = $${offset + 1}`, params: [lib] };
  }
  return {
    where: `i.library_id = $${offset + 1} AND i.user_id = $${offset + 2}`,
    params: [lib, req.user.user_id],
  };
}

router.use(requireAuth());

// GET /api/issues
router.get('/', async (req, res, next) => {
  try {
    await markOverdueIssues();
    const scope = issueScope(req);
    const result = await query(`${ISSUE_SELECT} WHERE ${scope.where} ORDER BY i.issue_id ASC`, scope.params);
    res.json({ issues: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/issues/user/:user_id
router.get('/user/:user_id', async (req, res, next) => {
  try {
    await markOverdueIssues();
    const userId = parseId(req.params.user_id, 'user_id');
    if (!auth.isStaff(req.user.role) && !same(userId, req.user.user_id)) {
      throw new HttpError(403, 'You do not have permission to do this');
    }
    const scope = issueScope(req, 1);
    const result = await query(
      `${ISSUE_SELECT} WHERE i.user_id = $1 AND ${scope.where} ORDER BY i.issue_id ASC`,
      [userId, ...scope.params]
    );
    res.json({ issues: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/issues/:issue_id
router.get('/:issue_id', async (req, res, next) => {
  try {
    const issueId = parseId(req.params.issue_id, 'issue_id');
    const scope = issueScope(req, 1);
    const result = await query(`${ISSUE_SELECT} WHERE i.issue_id = $1 AND ${scope.where}`, [
      issueId,
      ...scope.params,
    ]);
    if (result.rows.length === 0) throw new HttpError(404, 'Issue not found');
    res.json({ issue: result.rows[0] });
  } catch (error) {
    next(error);
  }
});

// POST /api/issues (checkout, staff only)
router.post('/', STAFF, async (req, res, next) => {
  try {
    const { user_id, book_id, due_days } = req.body || {};
    if (!user_id) throw new HttpError(400, 'Missing required field: user_id');
    if (!book_id) throw new HttpError(400, 'Missing required field: book_id');
    if (!due_days) throw new HttpError(400, 'Missing required field: due_days');

    const libraryId = req.user.library_id;
    const userId = parseId(user_id, 'user_id');
    const bookId = parseId(book_id, 'book_id');
    const days = parseId(due_days, 'due_days');
    if (days > MAX_LOAN_DAYS) throw new HttpError(400, `due_days must be between 1 and ${MAX_LOAN_DAYS}`);

    await expireStaleReservations();

    const issueId = await withTransaction(async (q) => {
      const user = await q('SELECT user_id, is_active, role FROM users WHERE user_id = $1 AND library_id = $2', [
        userId,
        libraryId,
      ]);
      if (user.rows.length === 0) throw new HttpError(400, 'User does not exist');
      if (user.rows[0].role !== 'member') throw new HttpError(400, 'Only members can borrow books');
      if (!user.rows[0].is_active) throw new HttpError(400, 'User account is inactive');

      const active = await q(
        "SELECT COUNT(*)::int AS n FROM issues WHERE user_id = $1 AND status IN ('pending', 'overdue')",
        [userId]
      );
      if (active.rows[0].n >= MAX_ACTIVE_LOANS) {
        throw new HttpError(400, `Loan limit reached (${MAX_ACTIVE_LOANS} active books)`);
      }

      const bookRes = await q(
        'SELECT book_id, status, format FROM books WHERE book_id = $1 AND library_id = $2 FOR UPDATE',
        [bookId, libraryId]
      );
      if (bookRes.rows.length === 0) throw new HttpError(400, 'Book does not exist');

      const book = bookRes.rows[0];
      if (book.format === 'ebook') throw new HttpError(400, 'E-books cannot be checked out');
      if (book.status === 'issued') throw new HttpError(400, 'Book is not available');

      if (book.status === 'reserved') {
        const hold = await q(
          "SELECT reservation_id FROM reservations WHERE user_id = $1 AND book_id = $2 AND status = 'pending' FOR UPDATE",
          [userId, bookId]
        );
        if (hold.rows.length === 0) throw new HttpError(400, 'Book is reserved for another member');

        await q("UPDATE reservations SET status = 'fulfilled', updated_at = NOW() WHERE reservation_id = $1", [
          hold.rows[0].reservation_id,
        ]);
      }

      const inserted = await q(
        `INSERT INTO issues (library_id, user_id, book_id, issued_at, due_at, status)
         VALUES ($1, $2, $3, NOW(), NOW() + ($4::int * INTERVAL '1 day'), 'pending')
         RETURNING issue_id`,
        [libraryId, userId, bookId, days]
      );

      await q("UPDATE books SET status = 'issued', updated_at = NOW() WHERE book_id = $1", [bookId]);

      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: req.user.user_id,
        action: 'checkout',
        entity: 'issue',
        entity_id: inserted.rows[0].issue_id,
        details: { user_id: userId, book_id: bookId, due_days: days },
        ip: req.ip,
      });

      return inserted.rows[0].issue_id;
    });

    const created = await query(`${ISSUE_SELECT} WHERE i.issue_id = $1`, [issueId]);
    res.status(201).json({ issue: created.rows[0] });
  } catch (error) {
    next(error);
  }
});

// PUT /api/issues/:issue_id (staff only, own library)
router.put('/:issue_id', STAFF, async (req, res, next) => {
  try {
    const issueId = parseId(req.params.issue_id, 'issue_id');
    const { status } = req.body || {};

    if (!status) throw new HttpError(400, 'Missing required field: status');
    if (status === 'completed') throw new HttpError(400, 'Use POST /api/returns to complete an issue');
    if (!VALID_ISSUE_STATUS.includes(status)) throw new HttpError(400, 'status must be pending or overdue');

    const updated = await query(
      `UPDATE issues SET status = $1, updated_at = NOW()
       WHERE issue_id = $2 AND library_id = $3
       RETURNING issue_id`,
      [status, issueId, req.user.library_id]
    );
    if (updated.rows.length === 0) throw new HttpError(404, 'Issue not found');

    const row = await query(`${ISSUE_SELECT} WHERE i.issue_id = $1`, [issueId]);
    res.json({ issue: row.rows[0] });
  } catch (error) {
    next(error);
  }
});

module.exports = router;