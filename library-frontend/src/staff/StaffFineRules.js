import { useEffect, useState } from 'react';
import { get, put, ApiError } from '../api';

export default function StaffFineRules() {
  const [rules, setRules] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get('/fines/rules').then((r) => setRules(r.rules)).catch((e) => setMessage({ type: 'error', text: e.message }));
  }, []);

  const set = (key) => (e) => setRules({ ...rules, [key]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await put('/fines/rules', {
        per_day_amount: Number(rules.per_day_amount),
        grace_days: Number(rules.grace_days),
        max_amount: Number(rules.max_amount),
      });
      setRules(res.rules);
      setMessage({ type: 'success', text: 'Fine rules saved. This change is logged.' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'Could not save rules.' });
    } finally {
      setBusy(false);
    }
  };

  if (!rules) return <p className="muted">{message?.text || 'Loading rules…'}</p>;

  return (
    <form className="card form" onSubmit={save}>
      <h3>Fine rules (owner only)</h3>
      <p className="muted small">The system calculates every fine from these rules. Staff cannot change amounts.</p>
      {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      <div className="field">
        <label>Amount per overdue day ($)</label>
        <input type="number" step="0.01" min="0" max="100" value={rules.per_day_amount} onChange={set('per_day_amount')} />
      </div>
      <div className="field">
        <label>Grace days before fines start</label>
        <input type="number" min="0" max="365" value={rules.grace_days} onChange={set('grace_days')} />
      </div>
      <div className="field">
        <label>Maximum fine per loan ($)</label>
        <input type="number" step="0.01" min="0" max="1000" value={rules.max_amount} onChange={set('max_amount')} />
      </div>
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save rules'}</button>
    </form>
  );
}