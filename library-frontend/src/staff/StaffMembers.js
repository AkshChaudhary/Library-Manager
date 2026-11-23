import { useState } from 'react';
import { post, put, ApiError } from '../api';

export default function StaffMembers({ users, canEditOwners, onChanged }) {
  const [form, setForm] = useState({ full_name: '', email: '', phone: '' });
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const addMember = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await post('/users', form);
      setMessage({ type: 'success', text: 'Member added. They received an email to set their password.' });
      setForm({ full_name: '', email: '', phone: '' });
      await onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not add member.' });
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u) => {
    try {
      await put(`/users/${u.user_id}`, { is_active: !u.is_active });
      await onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="form-layout">
      <form className="card form" onSubmit={addMember}>
        <h3>Add a member</h3>
        {message && <div className={`alert ${message.type}`}>{message.text}</div>}
        <div className="field"><label>Full name *</label><input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} required /></div>
        <div className="field"><label>Email *</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
        <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <button className="btn" disabled={busy}>{busy ? 'Adding…' : 'Add member'}</button>
      </form>

      <div className="card">
        <h3>People in this library</h3>
        {users.map((u) => {
          const locked = u.role === 'owner' || (u.role === 'librarian' && !canEditOwners && false);
          return (
            <div className="list-row" key={u.user_id}>
              <span>{u.full_name} <span className="muted small">· {u.role}</span></span>
              <span>
                {u.is_active ? (
                  <button className="btn ghost small" disabled={locked} onClick={() => toggleActive(u)}>Deactivate</button>
                ) : (
                  <button className="btn small" onClick={() => toggleActive(u)}>Reactivate</button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}