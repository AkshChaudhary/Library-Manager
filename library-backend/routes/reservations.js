const express = require('express');
const router = express.Router();
const { query, withTransaction } = require('../db');
const { HttpError, parseId } = require('../utils/http');
const { releaseOrPromote, expireStaleReservations } = require('../services/lifecycle');
const { recordAudit } = require('../services/audit');
const auth = require('../services/auth');
const { requireAuth, requireRole } = require('../middleware/auth');

const STAFF = requireRole('owner', 'librarian');
const MAX_HOLD_DAYS = 60;
const same = (a, b) => String(a) === String(b);

const RESERVATION_SELECT = `
  SELECT r.reservation_id, r.user_id, r.book_id, r.status, r.reserved_at,
         r.expires_at, r.notified_at,
         u.full_name AS user_name, b.title AS book_title
  FROM reservations r
  JOIN users u ON u.user_id = r.user_id
  JOIN books b ON b.book_id = r.book_id
`;

// Staff see every hold in their library. Members see only their own.
function reservationScope(req, offset = 0) {
  const lib = req.user.library_id;
  if (auth.isStaff(req.user.role)) {
    return { where: `r.library_id = $${offset + 1}`, params: [lib] };
  }
  return {
    where: `r.library_id = $${offset + 1} AND r.user_id = $${offset + 2}`,
    params: [lib, req.user.user_id],
  };
}

router.use(requireAuth());

// GET /api/reservations
router.get('/', async (req, res, next) => {
  try {
    await expireStaleReservations();
    const scope = reservationScope(req);
    const result = await query(
      `${RESERVATION_SELECT} WHERE ${scope.where} ORDER BY r.reservation_id ASC`,
      scope.params
    );
    res.json({ reservations: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/reservations/user/:user_id
router.get('/user/:user_id', async (req, res, next) => {
  try {
    await expireStaleReservations();
    const userId = parseId(req.params.user_id, 'user_id');
    if (!auth.isStaff(req.user.role) && !same(userId, req.user.user_id)) {
      throw new HttpError(403, 'You do not have permission to do this');
    }
    const scope = reservationScope(req, 1);
    const result = await query(
      `${RESERVATION_SELECT} WHERE r.user_id = $1 AND ${scope.where} ORDER BY r.reservation_id ASC`,
      [userId, ...scope.params]
    );
    res.json({ reservations: result.rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/reservations/book/:book_id (staff only, shows the waiting list)
router.get('/book/:book_id', STAFF, async (req, res, next) => {
  try {
    await expireStaleReservations();
    const bookId = parseId(req.params.book_id, 'book_id');
    const result = await query(
      `${RESERVATION_SELECT}
       WHERE r.book_id = $1 AND r.library_id = $2 AND r.status IN ('pending', 'waitlisted')
       ORDER BY r.reserved_at ASC`,
      [bookId, req.user.library_id]
    );
    res.json({ reservations: result.rows });
  } catch (error) {
    next(error);
  }
});

// POST /api/reservations
// Members reserve for themselves. Staff can reserve for any member in their library.
router.post('/', async (req, res, next) => {
  try {
    const { user_id, book_id, expire_days } = req.body || {};
    const libraryId = req.user.library_id;
    const staff = auth.isStaff(req.user.role);

    if (staff && !user_id) throw new HttpError(400, 'Missing required field: user_id');
    if (!book_id) throw new HttpError(400, 'Missing required field: book_id');
    if (!expire_days) throw new HttpError(400, 'Missing required field: expire_days');

    const userId = staff ? parseId(user_id, 'user_id') : req.user.user_id;
    const bookId = parseId(book_id, 'book_id');
    const days = parseId(expire_days, 'expire_days');
    if (days > MAX_HOLD_DAYS) throw new HttpError(400, `expire_days must be between 1 and ${MAX_HOLD_DAYS}`);

    await expireStaleReservations();

    const result = await withTransaction(async (q) => {
      const user = await q('SELECT is_active, role FROM users WHERE user_id = $1 AND library_id = $2', [
        userId,
        libraryId,
      ]);
      if (user.rows.length === 0) throw new HttpError(400, 'User does not exist');
      if (user.rows[0].role !== 'member') throw new HttpError(400, 'Only members can reserve books');
      if (!user.rows[0].is_active) throw new HttpError(400, 'User account is inactive');

      const bookRes = await q(
        'SELECT book_id, status, format FROM books WHERE book_id = $1 AND library_id = $2 FOR UPDATE',
        [bookId, libraryId]
      );
      if (bookRes.rows.length === 0) throw new HttpError(400, 'Book does not exist');

      const book = bookRes.rows[0];
      if (book.format === 'ebook') throw new HttpError(400, 'E-books cannot be reserved');

      const duplicate = await q(
        "SELECT 1 FROM reservations WHERE user_id = $1 AND book_id = $2 AND status IN ('pending', 'waitlisted')",
        [userId, bookId]
      );
      if (duplicate.rows.length > 0) throw new HttpError(400, 'Duplicate active reservation');

      const pendingExists = await q("SELECT 1 FROM reservations WHERE book_id = $1 AND status = 'pending'", [bookId]);
      const joinWaitlist = book.status === 'issued' || pendingExists.rows.length > 0;
      const status = joinWaitlist ? 'waitlisted' : 'pending';

      const inserted = await q(
        `INSERT INTO reservations (library_id, user_id, book_id, reserved_at, expires_at, status)
         VALUES ($1, $2, $3, NOW(), NOW() + ($4::int * INTERVAL '1 day'), $5)
         RETURNING *`,
        [libraryId, userId, bookId, days, status]
      );

      if (!joinWaitlist) {
        await q("UPDATE books SET status = 'reserved', updated_at = NOW() WHERE book_id = $1", [bookId]);
      }

      let queuePosition = 0;
      if (joinWaitlist) {
        const position = await q(
          "SELECT COUNT(*)::int AS n FROM reservations WHERE book_id = $1 AND status = 'waitlisted' AND reserved_at <= $2",
          [bookId, inserted.rows[0].reserved_at]
        );
        queuePosition = position.rows[0].n;
      }

      await recordAudit(q, {
        library_id: libraryId,
        actor_user_id: req.user.user_id,
        action: 'reservation_created',
        entity: 'reservation',
        entity_id: inserted.rows[0].reservation_id,
        details: { user_id: userId, book_id: bookId, status },
        ip: req.ip,
      });

      return { reservation: inserted.rows[0], queue_position: queuePosition };
    });

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// PUT /api/reservations/:reservation_id
// Members can cancel their own hold. Staff can set cancelled, expired, or fulfilled.
router.put('/:reservation_id', async (req, res, next) => {
  try {
    const reservationId = parseId(req.params.reservation_id, 'reservation_id');
    const { status } = req.body || {};
    const staff = auth.isStaff(req.user.role);

    if (!status) throw new HttpError(400, 'Missing required field: status');
    if (!['cancelled', 'expired', 'fulfilled'].includes(status)) {
      throw new HttpError(400, 'status must be cancelled, expired, or fulfilled');
    }
    if (!staff && status !== 'cancelled') throw new HttpError(403, 'Members can only cancel a hold');

    const updated = await withTransaction(async (q) => {
      const currentRes = await q(
        'SELECT * FROM reservations WHERE reservation_id = $1 AND library_id = $2 FOR UPDATE',
        [reservationId, req.user.library_id]
      );
      if (currentRes.rows.length === 0) throw new HttpError(404, 'Reservation not found');

      const current = currentRes.rows[0];
      // Members get "not found" for other people's holds, so they can't probe for them.
      if (!staff && !same(current.user_id, req.user.user_id)) throw new HttpError(404, 'Reservation not found');

      const changed = await q(
        'UPDATE reservations SET status = $1, updated_at = NOW() WHERE reservation_id = $2 RETURNING *',
        [status, reservationId]
      );

      if (current.status === 'pending' && (status === 'cancelled' || status === 'expired')) {
        await releaseOrPromote(q, current.book_id);
      }

      await recordAudit(q, {
        library_id: req.user.library_id,
        actor_user_id: req.user.user_id,
        action: 'reservation_updated',
        entity: 'reservation',
        entity_id: reservationId,
        details: { from: current.status, to: status },
        ip: req.ip,
      });

      return changed.rows[0];
    });

    res.json({ reservation: updated });
  } catch (error) {
    next(error);
  }
});

module.exports = router;