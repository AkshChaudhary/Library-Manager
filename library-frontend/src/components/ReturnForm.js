import { useState } from 'react';
import { post } from '../api';
import { formatDate, formatMoney, previewFine } from '../utils/fines';

export default function ReturnForm({ issues, users, notify, refresh }) {
  const [issueId, setIssueId] = useState('');
  const [librarianId, setLibrarianId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const active = issues.filter((i) => i.status !== 'completed');
  const librarians = users.filter((u) => u.role === 'librarian');
  const selected = active.find((i) => String(i.issue_id) === issueId);
  const preview = selected ? previewFine(selected.due_at) : null;

  const submit = async (e) => {
    e.preventDefault();
    if (!issueId || !librarianId) {
      notify('error', 'Choose a loan and the librarian receiving the book.');
      return;
    }

    setBusy(true);
    try {
      const res = await post('/returns', {
        issue_id: Number(issueId),
        returned_by_user_id: Number(librarianId),
        condition_notes: notes || null,
      });

      const hasFine = res.fine.fine_amount > 0;
      const fineText = hasFine
        ? `Late return: fine ${formatMoney(res.fine.fine_amount)} (${res.fine.days_overdue} day(s)).`
        : 'Returned on time. No fine.';
      const nextText = res.next_in_line ? ' The next member in line has been notified.' : '';

      notify(hasFine ? 'warn' : 'success', fineText + nextText);
      setIssueId('');
      setNotes('');
      await refresh();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section>
      <div className="page-header">
        <h2>📥 Return</h2>
      </div>

      <form className="card form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="ret-issue">Loan</label>
          <select id="ret-issue" value={issueId} onChange={(e) => setIssueId(e.target.value)}>
            <option value="">Choose a loan</option>
            {active.map((i) => (
              <option key={i.issue_id} value={String(i.issue_id)}>
                #{i.issue_id} · {i.book_title} · {i.user_name}
                {i.status === 'overdue' ? ' (OVERDUE)' : ''}
              </option>
            ))}
          </select>
        </div>

        {selected && (
          <div className={`preview-box ${preview.days > 0 ? 'late' : ''}`}>
            Due {formatDate(selected.due_at)}.{' '}
            {preview.days > 0
              ? `If returned now: ${preview.days} day(s) late, fine ${formatMoney(preview.amount)}.`
              : 'Not overdue. No fine.'}
          </div>
        )}

        <div className="field">
          <label htmlFor="ret-lib">Received by (librarian)</label>
          <select id="ret-lib" value={librarianId} onChange={(e) => setLibrarianId(e.target.value)}>
            <option value="">Choose a librarian</option>
            {librarians.map((u) => (
              <option key={u.user_id} value={String(u.user_id)}>
                {u.full_name}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="ret-notes">Condition notes</label>
          <textarea
            id="ret-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. minor cover wear"
          />
        </div>

        <button className="btn" disabled={busy}>
          {busy ? 'Processing…' : 'Process return'}
        </button>
      </form>
    </section>
  );
}