import { useState } from 'react';
import { post, ApiError } from '../api';

export default function ResetPassword({ token, goTo }) {
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await post('/auth/reset-password', { token, password });
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Reset failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h2>Invalid link</h2>
          <p>This reset link is missing its token. Request a new one.</p>
          <button className="btn" onClick={() => goTo('forgot')}>Request new link</button>
        </div>
      </div>
    );
  }

  if (message) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h2>Password updated</h2>
          <p>{message}</p>
          <button className="btn" onClick={() => goTo('login')}>Sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Set a new password</h2>
        {error && <div className="alert error">{error}</div>}
        <div className="field">
          <label htmlFor="rp-pass">New password (at least 10 characters)</label>
          <input id="rp-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </div>
        <button className="btn" disabled={busy}>
          {busy ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </div>
  );
}