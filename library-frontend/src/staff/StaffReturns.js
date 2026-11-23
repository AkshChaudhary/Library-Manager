import { useState } from 'react';
import { post, ApiError } from '../api';
import { fmtDate, daysLeft } from '../pages/MemberArea';

const money = (n) => `$${Number(n || 0).toFixed(2)}`;

export default function StaffReturns({ issues, onChanged }) {
  const [issueId, setIssueId] = useState('');
  const [notes, setNotes] = useState('');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const active = issues.filter((i) => i.status !== 'completed');
  const selected = active.find((i) => String(i.issue_id) === issueId);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await post('/returns', { issue_id: Number(issueId), condition_notes: notes || null });
      const f = res.fine;
      setMessage({
        type: f.fine_amount > 0 ? 'warn-alert' : 'success',
        text: f.fine_amount > 0
          ? `Returned late by ${f.days_overdue} day(s). Fine recorded: ${money(f.fine_amount)}.`
          : 'Returned on time. No fine.',
      });
      setIssueId('');
      setNotes('');
      await onChanged();
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Return failed.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card form" onSubmit={submit}>
      <h3>Return</h3>
      {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      <div className="field">
        <label>Loan</label>
        <select value={issueId} onChange={(e) => setIssueId(e.target.value)} required>
          <option value="">Choose a loan</option>
          {active.map((i) => (
            <option key={i.issue_id} value={i.issue_id}>
              {i.book_title} · {i.user_name}{i.status === 'overdue' ? ' (OVERDUE)' : ''}
            </option>
          ))}
        </select>
      </div>
      {selected && (
        <div className="preview-box">
          Due {fmtDate(selected.due_at)} ·{' '}
          {daysLeft(selected.due_at) < 0
            ? `${Math.abs(daysLeft(selected.due_at))} day(s) late`
            : `${daysLeft(selected.due_at)} day(s) left`}
        </div>
      )}
      <div className="field">
        <label>Condition notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. minor cover wear" />
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Processing…' : 'Process return'}</button>
    </form>
  );
}