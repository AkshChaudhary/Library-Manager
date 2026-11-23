import { useCallback, useEffect, useState } from 'react';
import { get } from '../api';
import { useAuth } from '../auth/AuthContext';
import MemberLoans from '../member/MemberLoans';
import MemberFines from '../member/MemberFines';
import MemberHolds from '../member/MemberHolds';
import MemberCatalog from '../member/MemberCatalog';
import MemberSettings from '../member/MemberSettings';

const TABS = [
  { key: 'loans', label: '📖 My loans' },
  { key: 'holds', label: '🔖 My holds' },
  { key: 'fines', label: '💵 Fines' },
  { key: 'catalog', label: '🔍 Catalog' },
  { key: 'settings', label: '⚙️ Settings' },
];

export default function MemberArea({ user }) {
  const { logout } = useAuth();
  const [tab, setTab] = useState('loans');
  const [data, setData] = useState({ issues: [], reservations: [], fines: null, books: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [issues, reservations, fines, books] = await Promise.all([
        get('/issues'),
        get('/reservations'),
        get('/fines'),
        get('/books'),
      ]);
      setData({
        issues: issues.issues,
        reservations: reservations.reservations,
        fines,
        books: books.books,
      });
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load your data.');
      if (err.status === 401) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000);
    return () => clearInterval(timer);
  }, [load]);

  const notes = buildNotes(data);

  return (
    <section>
      <div className="card hero">
        <h2>Hello, {user.full_name.split(' ')[0]}</h2>
        <p className="muted">Your library account at a glance.</p>
      </div>

      {error && <div className="alert error">{error}</div>}

      {notes.length > 0 && (
        <div className="notes">
          {notes.map((n) => (
            <div key={n.id} className={`bell-item ${n.level}`}>{n.text}</div>
          ))}
        </div>
      )}

      <nav className="chip-group member-tabs" aria-label="Member sections">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`chip ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <div className="member-panel">
        {loading ? (
          <p className="muted">Loading your details…</p>
        ) : tab === 'loans' ? (
          <MemberLoans issues={data.issues} />
        ) : tab === 'holds' ? (
          <MemberHolds reservations={data.reservations} onChanged={load} />
        ) : tab === 'fines' ? (
          <MemberFines fines={data.fines} />
        ) : tab === 'catalog' ? (
          <MemberCatalog books={data.books} />
        ) : (
          <MemberSettings />
        )}
      </div>
    </section>
  );
}

// Builds the notes shown above the tabs, from the data already loaded.
function buildNotes(data) {
  const notes = [];
  const active = data.issues.filter((i) => i.status !== 'completed');

  active.forEach((i) => {
    const due = new Date(i.due_at).getTime();
    const daysLeft = Math.ceil((due - Date.now()) / 86400000);
    if (i.status === 'overdue' || due < Date.now()) {
      notes.push({ id: `od-${i.issue_id}`, level: 'danger', text: `"${i.book_title}" is overdue. Please return it.` });
    } else if (daysLeft <= 2) {
      notes.push({ id: `due-${i.issue_id}`, level: 'warn', text: `"${i.book_title}" is due in ${daysLeft} day(s).` });
    }
  });

  data.reservations
    .filter((r) => r.status === 'pending' && r.notified_at)
    .forEach((r) =>
      notes.push({ id: `ready-${r.reservation_id}`, level: 'success', text: `"${r.book_title}" is ready to collect.` })
    );

  return notes;
}

// Shared date helpers for the member screens.
export function fmtDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function daysLeft(dueAt) {
  return Math.ceil((new Date(dueAt).getTime() - Date.now()) / 86400000);
}