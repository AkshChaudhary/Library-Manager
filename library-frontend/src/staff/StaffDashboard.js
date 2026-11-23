import StatsCard from '../components/StatsCard';

export default function StaffDashboard({ data }) {
  const active = data.issues.filter((i) => i.status !== 'completed');
  const overdue = active.filter((i) => i.status === 'overdue');
  const stats = [
    { icon: '📚', label: 'Titles', value: data.books.length, accent: '#6366f1' },
    { icon: '✅', label: 'Available', value: data.books.filter((b) => b.status === 'available').length, accent: '#16a34a' },
    { icon: '📤', label: 'On loan', value: data.books.filter((b) => b.status === 'issued').length, accent: '#d97706' },
    { icon: '🔁', label: 'Active loans', value: active.length, accent: '#0ea5e9' },
    { icon: '⚠️', label: 'Overdue', value: overdue.length, accent: '#dc2626' },
    { icon: '👥', label: 'Members & staff', value: data.users.length, accent: '#8b5cf6' },
  ];

  return (
    <div>
      <div className="stats">
        {stats.map((s) => (
          <StatsCard key={s.label} {...s} />
        ))}
      </div>
      <h3 className="section-title">Overdue loans</h3>
      {overdue.length === 0 ? (
        <p className="muted">No overdue loans.</p>
      ) : (
        overdue.map((i) => (
          <div className="list-row" key={i.issue_id}>
            <span><strong>{i.book_title}</strong> · {i.user_name}</span>
            <span className="muted small">Due {new Date(i.due_at).toLocaleDateString()}</span>
          </div>
        ))
      )}
    </div>
  );
}