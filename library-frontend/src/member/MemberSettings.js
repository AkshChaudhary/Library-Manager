import { useState } from 'react';
import { post, ApiError } from '../api';
import { useAuth } from '../auth/AuthContext';

export default function MemberSettings() {
  const { logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const changePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await post('/auth/change-password', { current_password: current, new_password: next });
      setMessage({ type: 'success', text: res.message });
      setCurrent('');
      setNext('');
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not change password.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="form-layout">
      <form className="card form" onSubmit={changePassword}>
        <h3>Change password</h3>
        {message && <div className={`alert ${message.type}`}>{message.text}</div>}
        <div className="field">
          <label htmlFor="cp-current">Current password</label>
          <input id="cp-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="cp-new">New password (at least 10 characters)</label>
          <input id="cp-new" type="password" value={next} onChange={(e) => setNext(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Change password'}</button>
      </form>

      <div className="card">
        <h3>Account</h3>
        <p className="muted small" style={{ margin: '10px 0 16px' }}>
          Changing your password signs you out on other devices. Signing out here ends this session.
        </p>
        <button className="btn danger" onClick={logout}>Sign out</button>
      </div>
    </div>
  );
}