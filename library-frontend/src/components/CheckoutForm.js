import { useState } from 'react';
import { post } from '../api';
import { DEFAULT_LOAN_DAYS, MAX_ACTIVE_LOANS, MAX_LOAN_DAYS } from '../config';
import { formatDate } from '../utils/fines';
import QrScannerModal from './QrScannerModal';

export default function CheckoutForm({ users, books, issues, notify, refresh }) {
  const [userId, setUserId] = useState('');
  const [bookId, setBookId] = useState('');
  const [days, setDays] = useState(DEFAULT_LOAN_DAYS);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  const members = users.filter((u) => u.role === 'patron');
  const lendable = books.filter((b) => b.format === 'physical' && b.status !== 'issued');
  const sampleIsbns = books
    .filter((b) => b.format === 'physical' && b.status === 'available')
    .map((b) => b.isbn);
  const activeLoans = issues.filter(
    (i) => String(i.user_id) === userId && i.status !== 'completed'
  ).length;
  const dueDate = new Date(Date.now() + Number(days || 0) * 86400000);

  const submit = async (e) => {
    e.preventDefault();
    if (!userId || !bookId) {
      notify('error', 'Choose a member and a book first.');
      return;
    }

    setBusy(true);
    try {
      const res = await post('/issues', {
        user_id: Number(userId),
        book_id: Number(bookId),
        due_days: Number(days),
      });
      notify('success', `Checked out "${res.issue.book_title}" to ${res.issue.user_name}. Due ${formatDate(res.issue.due_at)}.`);
      setBookId('');
      await refresh();
    } catch (err) {
      notify('error', err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleScan = (isbn) => {
    setScanOpen(false);
    const match = books.find((b) => b.isbn === isbn && b.format === 'physical');
    if (!match) {
      notify('error', `No physical book with ISBN ${isbn} in the catalog.`);
      return;
    }
    if (match.status === 'issued') {
      notify('error', `"${match.title}" is already checked out.`);
      return;
    }
    setBookId(String(match.book_id));
    notify('success', `Scanned "${match.title}". Confirm to check out.`);
  };

  return (
    <section>
      <div className="page-header">
        <h2>📤 Checkout</h2>
        <button className="btn ghost" onClick={() => setScanOpen(true)}>
          📷 Scan book
        </button>
      </div>

      <form className="card form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="co-user">Member</label>
          <select id="co-user" value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">Choose a member</option>
            {members.map((u) => (
              <option key={u.user_id} value={String(u.user_id)}>
                {u.full_name}
              </option>
            ))}
          </select>
          {userId && (
            <small className="muted">
              Active loans: {activeLoans} / {MAX_ACTIVE_LOANS}
            </small>
          )}
        </div>

        <div className="field">
          <label htmlFor="co-book">Book</label>
          <select id="co-book" value={bookId} onChange={(e) => setBookId(e.target.value)}>
            <option value="">Choose a book</option>
            {lendable.map((b) => (
              <option key={b.book_id} value={String(b.book_id)}>
                {b.title}
                {b.status === 'reserved' ? ' (reserved)' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="co-days">Loan period (days)</label>
          <input
            id="co-days"
            type="number"
            min="1"
            max={MAX_LOAN_DAYS}
            value={days}
            onChange={(e) => setDays(e.target.value)}
          />
          <small className="muted">
            Due on {Number(days) > 0 ? formatDate(dueDate) : '—'}
          </small>
        </div>

        <button
          className="btn"
          disabled={busy || (userId !== '' && activeLoans >= MAX_ACTIVE_LOANS)}
        >
          {busy ? 'Processing…' : 'Confirm checkout'}
        </button>
      </form>

      {scanOpen && (
        <QrScannerModal
          sampleIsbns={sampleIsbns}
          onScan={handleScan}
          onClose={() => setScanOpen(false)}
        />
      )}
    </section>
  );
}