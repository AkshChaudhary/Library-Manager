import { useState } from 'react';
import './App.css';
import { AuthProvider, useAuth } from './auth/AuthContext';
import SessionBanner from './components/SessionBanner';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import MemberArea from './pages/MemberArea';
import StaffArea from './pages/StaffArea';

// Maps each address path to a screen. Plain path changes, no router package.
const PAGE_PATHS = {
  login: '/login',
  signup: '/signup',
  forgot: '/forgot-password',
  reset: '/reset-password',
};

function pageFromPath() {
  const path = window.location.pathname;
  if (path.startsWith('/reset-password')) return 'reset';
  if (path.startsWith('/signup')) return 'signup';
  if (path.startsWith('/forgot-password')) return 'forgot';
  return 'login';
}

function Shell() {
  const { user, checking, logout } = useAuth();
  const [page, setPage] = useState(pageFromPath);

  const goTo = (name) => {
    window.history.pushState({}, '', PAGE_PATHS[name] || '/login');
    setPage(name);
  };

  if (checking) {
    return <div className="auth-page"><p className="muted">Loading…</p></div>;
  }

  if (!user) {
    const token = new URLSearchParams(window.location.search).get('token');
    if (page === 'signup') return <Signup goTo={goTo} />;
    if (page === 'forgot') return <ForgotPassword goTo={goTo} />;
    if (page === 'reset') return <ResetPassword token={token} goTo={goTo} />;
    return <Login goTo={goTo} />;
  }

  const isStaff = user.role === 'owner' || user.role === 'librarian';

  return (
    <div className="app">
      <header className="navbar glass">
        <div className="navbar-inner">
          <div className="brand">📚 LibraryHub</div>
          <div className="nav-tools">
            <span className="muted small">
              {user.full_name} · {user.role}
            </span>
            <button className="btn ghost small" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>

      <main className="container">
        <SessionBanner />
        {isStaff ? <StaffArea user={user} /> : <MemberArea user={user} />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}