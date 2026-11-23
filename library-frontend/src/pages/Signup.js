import { useState } from 'react';
import { post, ApiError } from '../api';

export default function Signup({ goTo }) {
  const [form, setForm] = useState({ library_slug: '', full_name: '', email: '', password: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await post('/auth/signup', form);
      setMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-up failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  if (message) {
    return (
      <div className="auth-page">
        <div className="card auth-card">
          <h2>Check your email</h2>
          <p>{message}</p>
          <button className="btn" onClick={() => goTo('login')}>Back to sign in</button>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h2>Create an account</h2>
        <p className="muted small">You need the library code your library gave you.</p>

        {error && <div className="alert error">{error}</div>}

        <div className="field">
          <label htmlFor="su-lib">Library code</label>
          <input id="su-lib" value={form.library_slug} onChange={update('library_slug')} required />
        </div>
        <div className="field">
          <label htmlFor="su-name">Full name</label>
          <input id="su-name" value={form.full_name} onChange={update('full_name')} required />
        </div>
        <div className="field">
          <label htmlFor="su-email">Email</label>
          <input id="su-email" type="email" value={form.email} onChange={update('email')} required />
        </div>
        <div className="field">
          <label htmlFor="su-pass">Password (at least 10 characters)</label>
          <input id="su-pass" type="password" value={form.password} onChange={update('password')} required />
        </div>

        <button className="btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
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