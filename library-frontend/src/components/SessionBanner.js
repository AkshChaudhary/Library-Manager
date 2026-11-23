import { useEffect, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError, post } from '../api';

export default function SessionBanner() {
  const { session, extend, logout, expire } = useAuth();
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // When the logout time passes, end the session in the browser too.
  useEffect(() => {
    if (!session) return;
    const ms = new Date(session.logout_at).getTime() - Date.now();
    if (ms <= 0) {
      expire();
      return;
    }
    const timer = setTimeout(expire, ms + 1000);
    return () => clearTimeout(timer);
  }, [session, expire]);

  if (!session) return null;

  const logoutAt = new Date(session.logout_at).getTime();
  const finalAt = new Date(session.final_warn_at).getTime();
  const warnAt = new Date(session.warn_at).getTime();
  const remaining = logoutAt - now;

  let banner = null;
  if (now >= finalAt && remaining > 0) {
    banner = {
      level: 'danger',
      text: `Your session ends in ${formatRemaining(remaining)}. Stay signed in to keep working.`,
    };
  } else if (now >= warnAt && remaining > 0) {
    banner = {
      level: 'warn',
      text: session.staff
        ? `Your session ends in ${formatRemaining(remaining)}. Staff sessions end after 12 hours or 30 minutes of inactivity.`
        : `Your session ends in ${formatRemaining(remaining)}. Stay signed in?`,
    };
  }

  if (!banner) return null;

  const stay = async () => {
    setBusy(true);
    setError('');
    try {
      await extend();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not extend the session.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    await logout();
  };

  return (
    <div className={`session-banner ${banner.level}`} role="status">
      <span>{banner.text}</span>
      <div className="session-actions">
        <button className="btn small" onClick={stay} disabled={busy}>
          {busy ? 'Extending…' : 'Stay signed in'}
        </button>
        <button className="btn ghost small" onClick={signOut}>
          Sign out
        </button>
      </div>
      {error && <span className="session-error">{error}</span>}
    </div>
  );
}

function formatRemaining(ms) {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)} day(s)`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes} minute(s)`;
}

// Unused import guard for linters
void post;