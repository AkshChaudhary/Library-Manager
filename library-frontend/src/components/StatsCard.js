export default function StatsCard({ icon, label, value, accent }) {
  return (
    <div className="card stat-card" style={{ '--accent': accent }}>
      <div className="stat-icon">{icon}</div>
      <div className="stat-value">{value}</div>
      <div className="muted">{label}</div>
    </div>
  );
}