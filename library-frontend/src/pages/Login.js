import { useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { ApiError } from '../api';

export default function Login({ goTo }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await login(email.trim(), password);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Sign in</h2>
        <p className="muted small">Members and library staff sign in here.</p>

        {error && <div className="alert error">{error}</div>}

        <div className="field">
          <label htmlFor="login-email">Email</label>
          <input id="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        <button className="btn" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>

        <div className="auth-links">
          <button type="button" className="link-btn" onClick={() => goTo('forgot')}>
            Forgot password?
          </button>
          <button type="button" className="link-btn" onClick={() => goTo('signup')}>
            Create an account
          </button>
        </div>
      </form>
    </div>
  );
}