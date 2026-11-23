import { fmtDate, daysLeft } from '../pages/MemberArea';

export default function StaffLoans({ issues }) {
  const active = issues.filter((i) => i.status !== 'completed');
  if (active.length === 0) return <div className="card empty">No books are out right now.</div>;

  return (
    <div className="card">
      {active.map((i) => {
        const left = daysLeft(i.due_at);
        return (
          <div className="list-row" key={i.issue_id}>
            <span><strong>{i.book_title}</strong> · {i.user_name}</span>
            <span className={left < 0 || i.status === 'overdue' ? 'danger-text' : 'muted small'}>
              Due {fmtDate(i.due_at)} · {left < 0 ? `${Math.abs(left)} day(s) late` : `${left} day(s) left`}
            </span>
          </div>
        );
      })}
    </div>
  );
}