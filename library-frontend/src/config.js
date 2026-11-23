export const API_URL = process.env.REACT_APP_API_URL || '/api';

// Keep these in sync with the backend rules.
export const FINE_PER_DAY = 0.5;      // backend/services/fines.js
export const HOLD_HOURS = 48;         // backend/services/lifecycle.js
export const MAX_ACTIVE_LOANS = 5;    // backend/routes/issues.js
export const MAX_LOAN_DAYS = 90;
export const MAX_HOLD_DAYS = 60;
export const DEFAULT_LOAN_DAYS = 14;
export const DEFAULT_HOLD_DAYS = 7;

export const CACHE_KEY = 'libraryhub:cache:v2';

export const ALL_TABS = ['dashboard', 'catalog', 'checkout', 'return', 'reserve', 'admin'];
export const MEMBER_TABS = ['dashboard', 'catalog', 'reserve'];

export const TAB_LABELS = {
  dashboard: 'Dashboard',
  catalog: 'Catalog',
  checkout: 'Checkout',
  return: 'Return',
  reserve: 'Reserve',
  admin: 'Admin',
};