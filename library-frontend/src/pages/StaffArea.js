import { useCallback, useEffect, useState } from 'react';
import { get } from '../api';
import { useAuth } from '../auth/AuthContext';
import StaffDashboard from '../staff/StaffDashboard';
import StaffCatalog from '../staff/StaffCatalog';
import StaffCheckout from '../staff/StaffCheckout';
import StaffReturns from '../staff/StaffReturns';
import StaffLoans from '../staff/StaffLoans';
import StaffFines from '../staff/StaffFines';
import StaffFineRules from '../staff/StaffFineRules';
import StaffMembers from '../staff/StaffMembers';

export default function StaffArea({ user }) {
  const { logout } = useAuth();
  const isOwner = user.role === 'owner';
  const [tab, setTab] = useState('dashboard');
  const [data, setData] = useState({ books: [], users: [], issues: [], categories: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const tabs = [
    { key: 'dashboard', label: '📊 Overview' },
    { key: 'catalog', label: '📚 Catalog' },
    { key: 'checkout', label: '📤 Checkout' },
    { key: 'return', label: '📥 Return' },
    { key: 'loans', label: '🔁 Loans' },
    { key: 'fines', label: '💵 Fines' },
    { key: 'members', label: '👥 Members' },
    ...(isOwner ? [{ key: 'rules', label: '⚖️ Fine rules' }] : []),
  ];

  const load = useCallback(async () => {
    try {
      const [books, users, issues, categories] = await Promise.all([
        get('/books'),
        get('/users'),
        get('/issues'),
        get('/categories'),
      ]);
      setData({
        books: books.books,
        users: users.users,
        issues: issues.issues,
        categories: categories.categories,
      });
      setError('');
    } catch (err) {
      setError(err.message || 'Could not load data.');
      if (err.status === 401) logout();
    } finally {
      setLoading(false);
    }
  }, [logout]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  return (
    <section>
      <div className="page-header">
        <h2>{isOwner ? 'Owner' : 'Librarian'} console</h2>
      </div>

      {error && <div className="alert error">{error}</div>}

      <nav className="chip-group member-tabs" aria-label="Staff sections">
        {tabs.map((t) => (
          <button key={t.key} className={`chip ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="member-panel">
        {loading && tab !== 'rules' ? (
          <p className="muted">Loading…</p>
        ) : tab === 'dashboard' ? (
          <StaffDashboard data={data} />
        ) : tab === 'catalog' ? (
          <StaffCatalog books={data.books} categories={data.categories} onChanged={load} />
        ) : tab === 'checkout' ? (
          <StaffCheckout users={data.users} books={data.books} onChanged={load} />
        ) : tab === 'return' ? (
          <StaffReturns issues={data.issues} onChanged={load} />
        ) : tab === 'loans' ? (
          <StaffLoans issues={data.issues} />
        ) : tab === 'fines' ? (
          <StaffFines />
        ) : tab === 'members' ? (
          <StaffMembers users={data.users} canEditOwners={isOwner} onChanged={load} />
        ) : isOwner ? (
          <StaffFineRules />
        ) : null}
      </div>
    </section>
  );
}