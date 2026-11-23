import { useEffect, useState } from 'react';
import { get, post, ApiError } from '../api';
import { fmtDate } from '../pages/MemberArea';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function StaffFines() {
  const [fines, setFines] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      setFines(await get('/fines'));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { load(); }, []);

  const markPaid = async (id) => {
    try {
      await post(`/fines/${id}/pay`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark as paid.');
    }
  };

  if (!fines) return <p className="muted">{error || 'Loading fines…'}</p>;

  return (
    <div>
      <div className="card stat-card" style={{ '--accent': '#d97706' }}>
        <div className="muted">Open fines in this library</div>
        <div className="stat-value">{money(fines.total_open)}</div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <h3 className="section-title">Accruing (overdue, calculated live)</h3>
      {fines.accruing.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        fines.accruing.map((f) => (
          <div className="list-row" key={`a-${f.issue_id}`}>
            <span>{f.user_name} · {f.book_title}</span>
            <span>{f.days_charged} day(s) · <strong>{money(f.amount)}</strong></span>
          </div>
        ))
      )}

      <h3 className="section-title">Recorded</h3>
      {fines.recorded.length === 0 ? (
        <p className="muted">None.</p>
      ) : (
        fines.recorded.map((f) => (
          <div className="list-row" key={f.fine_id}>
            <span>{f.user_name} · {f.book_title} · {f.days_charged} day(s)</span>
            <span className="actions-inline">
              <strong>{money(f.amount)}</strong>
              {f.status === 'paid' ? (
                <span className="muted small">paid {fmtDate(f.paid_at)}</span>
              ) : (
                <button className="btn small" onClick={() => markPaid(f.fine_id)}>Mark paid</button>
              )}
            </span>
          </div>
        ))
      )}
    </div>
  );
}