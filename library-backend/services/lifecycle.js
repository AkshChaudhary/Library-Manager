const { query } = require('../db');

const HOLD_HOURS = 48; // time a member has to collect a book after it is released

// Decides what a book's status should be after it is released.
// If someone is waiting, the first person in line gets a 48-hour hold.
// q is either the normal query function or a transaction query function.
async function releaseOrPromote(q, bookId) {
  const bookRes = await q('SELECT status FROM books WHERE book_id = $1', [bookId]);
  if (bookRes.rows.length === 0) return null;
  if (bookRes.rows[0].status === 'issued') return null;

  const pending = await q(
    "SELECT * FROM reservations WHERE book_id = $1 AND status = 'pending' ORDER BY reserved_at ASC LIMIT 1",
    [bookId]
  );
  if (pending.rows.length > 0) {
    await q("UPDATE books SET status = 'reserved', updated_at = NOW() WHERE book_id = $1", [bookId]);
    return pending.rows[0];
  }

  const promoted = await q(
    `
      UPDATE reservations
      SET status = 'pending',
          notified_at = NOW(),
          expires_at = NOW() + ($2::int * INTERVAL '1 hour'),
          updated_at = NOW()
      WHERE reservation_id = (
        SELECT reservation_id FROM reservations
        WHERE book_id = $1 AND status = 'waitlisted'
        ORDER BY reserved_at ASC
        LIMIT 1
      )
      RETURNING *
    `,
    [bookId, HOLD_HOURS]
  );

  if (promoted.rows.length > 0) {
    await q("UPDATE books SET status = 'reserved', updated_at = NOW() WHERE book_id = $1", [bookId]);
    return promoted.rows[0];
  }

  await q("UPDATE books SET status = 'available', updated_at = NOW() WHERE book_id = $1", [bookId]);
  return null;
}

// Marks reservations past their expiry date as expired, then updates their books.
async function expireStaleReservations() {
  const expired = await query(
    `
      UPDATE reservations
      SET status = 'expired', updated_at = NOW()
      WHERE status IN ('pending', 'waitlisted') AND expires_at < NOW()
      RETURNING book_id
    `
  );

  const bookIds = [...new Set(expired.rows.map((row) => row.book_id))];
  for (const bookId of bookIds) {
    await releaseOrPromote(query, bookId);
  }
}

// Marks loans past their due date as overdue.
async function markOverdueIssues() {
  await query(
    "UPDATE issues SET status = 'overdue', updated_at = NOW() WHERE status = 'pending' AND due_at < NOW()"
  );
}

module.exports = {
  HOLD_HOURS,
  releaseOrPromote,
  expireStaleReservations,
  markOverdueIssues,
};