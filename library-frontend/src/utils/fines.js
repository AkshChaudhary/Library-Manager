import { FINE_PER_DAY } from '../config';

// Same rule as the backend, used for live previews only.
// The backend's value is the one saved in the database.
export function previewFine(dueAt, now = new Date()) {
  const diff = now.getTime() - new Date(dueAt).getTime();
  if (diff <= 0) return { days: 0, amount: 0 };
  const days = Math.ceil(diff / 86400000);
  return { days, amount: Number((days * FINE_PER_DAY).toFixed(2)) };
}

export function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

export function formatDate(value) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}