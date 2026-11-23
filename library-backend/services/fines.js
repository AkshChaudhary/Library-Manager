const DAY_MS = 24 * 60 * 60 * 1000;

// Used only if a library has no rules row yet.
const DEFAULT_RULES = { per_day_amount: 0.5, grace_days: 0, max_amount: 20 };

async function getFineRules(q, libraryId) {
  const r = await q(
    `SELECT per_day_amount::float AS per_day_amount, grace_days,
            max_amount::float AS max_amount
     FROM fine_rules WHERE library_id = $1`,
    [libraryId]
  );
  return r.rows[0] || DEFAULT_RULES;
}

// Pure calculation: no database access, so it's easy to test.
function calculateFine(rules, dueAt, returnedAt) {
  const diff = new Date(returnedAt).getTime() - new Date(dueAt).getTime();
  if (diff <= 0) return { days_overdue: 0, fine_amount: 0 };

  const daysLate = Math.ceil(diff / DAY_MS);
  const chargeable = Math.max(0, daysLate - Number(rules.grace_days || 0));
  const raw = chargeable * Number(rules.per_day_amount);
  const amount = Math.min(raw, Number(rules.max_amount));

  return { days_overdue: daysLate, fine_amount: Number(amount.toFixed(2)) };
}

module.exports = { getFineRules, calculateFine };