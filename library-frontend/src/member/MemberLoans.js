import { daysLeft, fmtDate } from '../pages/MemberArea';

export default function MemberLoans({ issues }) {
  const active = issues.filter((i) => i.status !== 'completed');
  const past = issues.filter((i) => i.status === 'completed');

  if (issues.length === 0) return <div className="card empty">You have no loans yet.</div>;

  return (
    <div>
      <h3 className="section-title">Current loans</h3>
      {active.length === 0 ? (
        <div className="card empty">No books are out right now.</div>
      ) : (
        <div className="grid">
          {active.map((i) => {
            const left = daysLeft(i.due_at);
            const overdue = i.status === 'overdue' || left < 0;
            return (
              <div className="card" key={i.issue_id}>
                <h3>{i.book_title}</h3>
                <p className="muted small">Shelf {i.shelf_location || 'to be assigned'}</p>
                <p>Due: <strong>{fmtDate(i.due_at)}</strong></p>
                <p className={overdue ? 'danger-text' : 'muted'}>
                  {overdue
                    ? `Overdue by ${Math.abs(left) || 1} day(s)`
                    : `${left} day(s) left`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <h3 className="section-title">History</h3>
      {past.length === 0 ? (
        <p className="muted">No returned books yet.</p>
      ) : (
        past.map((i) => (
          <div className="list-row" key={i.issue_id}>
            <span>{i.book_title}</span>
            <span className="muted small">Returned {fmtDate(i.returned_at)}</span>
          </div>
        ))
      )}
    </div>
  );
}