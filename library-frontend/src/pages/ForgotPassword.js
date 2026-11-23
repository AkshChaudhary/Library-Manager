import { useState } from 'react';
import { post } from '../api';

export default function ForgotPassword({ goTo }) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await post('/auth/forgot-password', { email });
      setMessage(res.message);
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Forgot password</h2>
        <p className="muted small">Enter your email and we will send a reset link.</p>

        {message && <div className="alert success">{message}</div>}

        <div className="field">
          <label htmlFor="fp-email">Email</label>
          <input id="fp-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>

        <button className="btn" disabled={busy}>
          {busy ? 'Sending…' : 'Send reset link'}
        </button>
        <div className="auth-links">
          <button type="button" className="link-btn" onClick={() => goTo('login')}>
            Back to sign in
          </button>
        </div>
      </form>
    </div>
  );
}