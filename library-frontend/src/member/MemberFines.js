import { fmtDate } from '../pages/MemberArea';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function MemberFines({ fines }) {
  if (!fines) return <p className="muted">Loading fines…</p>;

  const { recorded = [], accruing = [], total_open = 0 } = fines;

  return (
    <div>
      <div className="card stat-card" style={{ '--accent': '#d97706' }}>
        <div className="muted">Total you owe right now</div>
        <div className="stat-value">{money(total_open)}</div>
        <p className="muted small">Calculated from your library's current fine rules.</p>
      </div>

      <h3 className="section-title">Overdue books (amount grows daily)</h3>
      {accruing.length === 0 ? (
        <p className="muted">No overdue books. Nice work.</p>
      ) : (
        accruing.map((f) => (
          <div className="list-row" key={`acc-${f.issue_id}`}>
            <span>{f.book_title}</span>
            <span>
              {f.days_charged} day(s) · <strong>{money(f.amount)}</strong>
            </span>
          </div>
        ))
      )}

      <h3 className="section-title">Recorded fines</h3>
      {recorded.length === 0 ? (
        <p className="muted">No fines recorded.</p>
      ) : (
        recorded.map((f) => (
          <div className="list-row" key={f.fine_id}>
            <span>
              {f.book_title} · {f.days_charged} day(s) late
            </span>
            <span>
              <strong>{money(f.amount)}</strong>{' '}
              <span className={f.status === 'paid' ? 'muted small' : 'danger-text small'}>
                {f.status === 'paid' ? `paid ${fmtDate(f.paid_at)}` : 'unpaid'}
              </span>
            </span>
          </div>
        ))
      )}
    </div>
  );
}