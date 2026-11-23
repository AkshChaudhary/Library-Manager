import { useState } from 'react';
import { post, put } from '../api';
import { DEFAULT_HOLD_DAYS, MAX_HOLD_DAYS } from '../config';
import ReservationTimer from './ReservationTimer';

export default function ReserveForm({ users, books, reservations, memberId, notify, refresh }) {
  const [userId, setUserId] = useState('');
  const [bookId, setBookId] = useState('');
  const [days, setDays] = useState(DEFAULT_HOLD_DAYS);
  const [busy, setBusy] = useState(false);

  const effectiveUser = userId || memberId;
  const physical = books.filter((b) => b.format === 'physical');
  const myHolds = reservations.filter(
    (r) =>
      String(r.user_id) === String(effectiveUser) &&
      ['pending', 'waitlisted'].includes(r.status)
  );

  const submit = async (e) => {
    e.preventDefault();
    if (!effectiveUser || !bookId) {
      notify('error', 'Choose a member and a book.');
      return;
    }

    setBusy(true);
    try {
      const res = await post('/reservations', {
        user_id: Number(effectiveUser),
        book_id: Number(bookId),
        expire_days: Number(days),
      });

      if (res.reservation.status === 'waitlisted') {
        notify('warn', `This book is on loan. You are #${res.queue_position} on the waitlist.`);
      } else {
        notify('success', `Hold placed. Collect within ${days} day(s).`);
      }
      setBookId('');
      await refresh();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const cancelHold = async (reservationId) => {
    try {
      await put(`/reservations/${reservationId}`, { status: 'cancelled' });
      notify('success', 'Reservation cancelled.');
      await refresh();
    } catch (err) {
      notify('error', err.message);
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>🔖 Reserve</h2>
      </div>

      <div className="form-layout">
        <form className="card form" onSubmit={submit}>
          <div className="field">
            <label htmlFor="res-user">Member</label>
            <select id="res-user" value={effectiveUser} onChange={(e) => setUserId(e.target.value)}>
              {users.map((u) => (
                <option key={u.user_id} value={String(u.user_id)}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="res-book">Book</label>
            <select id="res-book" value={bookId} onChange={(e) => setBookId(e.target.value)}>
              <option value="">Choose a book</option>
              {physical.map((b) => (
                <option key={b.book_id} value={String(b.book_id)}>
                  {b.title}
                  {b.status !== 'available' ? ` (${b.status})` : ''}
                </option>
              ))}
            </select>
            <small className="muted">
              Books that are on loan add you to a waitlist. Digital books can't be reserved.
            </small>
          </div>

          <div className="field">
            <label htmlFor="res-days">Hold window (days, max {MAX_HOLD_DAYS})</label>
            <input
              id="res-days"
              type="number"
              min="1"
              max={MAX_HOLD_DAYS}
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </div>

          <button className="btn" disabled={busy}>
            {busy ? 'Placing…' : 'Place reservation'}
          </button>
        </form>

        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Holds for this member</h3>
          {myHolds.length === 0 ? (
            <p className="muted">No active holds or waitlist entries.</p>
          ) : (
            myHolds.map((r) => (
              <div className="hold-row" key={r.reservation_id}>
                <div>
                  <strong>{r.book_title}</strong>
                  <div className="small muted">
                    {r.status === 'waitlisted' ? 'Waiting in line' : 'Ready to collect'}
                  </div>
                  {r.status === 'pending' && <ReservationTimer expiresAt={r.expires_at} />}
                </div>
                <button className="btn ghost small" onClick={() => cancelHold(r.reservation_id)}>
                  Cancel
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}