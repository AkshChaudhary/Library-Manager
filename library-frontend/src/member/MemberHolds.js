import { useState } from 'react';
import { put } from '../api';
import ReservationTimer from '../components/ReservationTimer';

export default function MemberHolds({ reservations, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');

  const holds = reservations.filter((r) => ['pending', 'waitlisted'].includes(r.status));

  const cancel = async (id) => {
    setBusy(id);
    setError('');
    try {
      await put(`/reservations/${id}`, { status: 'cancelled' });
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  if (holds.length === 0) {
    return <div className="card empty">You have no holds. Reserve a book from the catalog.</div>;
  }

  return (
    <div className="card">
      {error && <div className="alert error">{error}</div>}
      {holds.map((r) => (
        <div className="hold-row" key={r.reservation_id}>
          <div>
            <strong>{r.book_title}</strong>
            <div className="small muted">
              {r.status === 'waitlisted' ? 'Waiting in line. You will be notified when it is ready.' : 'Ready to collect'}
            </div>
            {r.status === 'pending' && <ReservationTimer expiresAt={r.expires_at} />}
          </div>
          <button className="btn ghost small" disabled={busy === r.reservation_id} onClick={() => cancel(r.reservation_id)}>
            {busy === r.reservation_id ? 'Cancelling…' : 'Cancel hold'}
          </button>
        </div>
      ))}
    </div>
  );
}