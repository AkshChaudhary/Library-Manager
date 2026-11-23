import { useState } from 'react';
import { post, ApiError } from '../api';
import { DEFAULT_LOAN_DAYS } from '../config';
import { fmtDate } from '../pages/MemberArea';

export default function StaffCheckout({ users, books, onChanged }) {
  const [userId, setUserId] = useState('');
  const [bookId, setBookId] = useState('');
  const [days, setDays] = useState(DEFAULT_LOAN_DAYS);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const members = users.filter((u) => u.role === 'member');
  const lendable = books.filter((b) => b.format === 'physical' && b.status !== 'issued');

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await post('/issues', { user_id: Number(userId), book_id: Number(bookId), due_days: Number(days) });
      setMessage({ type: 'success', text: `Checked out. Due ${fmtDate(res.issue.due_at)}.` });
      setBookId('');
      await onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Checkout failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h3>Checkout</h3>
      {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      <div className="field">
        <label>Member</label>
        <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
          <option value="">Choose a member</option>
          {members.map((u) => <option key={u.user_id} value={u.user_id}>{u.full_name}</option>)}
        </select>
      </div>
      <div className="field">
        <label>Book</label>
        <select value={bookId} onChange={(e) => setBookId(e.target.value)} required>
          <option value="">Choose a book</option>
          {lendable.map((b) => (
            <option key={b.book_id} value={b.book_id}>{b.title}{b.status === 'reserved' ? ' (reserved)' : ''}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Loan period (days, max 90)</label>
        <input type="number" min="1" max="90" value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Processing…' : 'Confirm checkout'}</button>
    </form>
  );
}