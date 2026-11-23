import { useCallback, useEffect, useState } from 'react';
import { get } from '../api';
import { CACHE_KEY } from '../config';

const EMPTY = { books: [], users: [], issues: [], reservations: [], categories: [], returns: [] };

function readCache() {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY)) || null;
  } catch {
    return null;
  }
}

// Loads everything the UI needs. Shows the last saved copy instantly,
// refreshes every 30 seconds, and keeps the cache when the backend is down.
export default function useLibraryData() {
  const cached = readCache();
  const [data, setData] = useState(cached?.data || EMPTY);
  const [loading, setLoading] = useState(!cached);
  const [offline, setOffline] = useState(false);
  const [lastSynced, setLastSynced] = useState(cached?.savedAt || null);

  const refresh = useCallback(async () => {
    try {
      const [books, users, issues, reservations, categories, returns] = await Promise.all([
        get('/books'),
        get('/users'),
        get('/issues'),
        get('/reservations'),
        get('/categories'),
        get('/returns'),
      ]);

      const next = {
        books: books.books,
        users: users.users,
        issues: issues.issues,
        reservations: reservations.reservations,
        categories: categories.categories,
        returns: returns.returns,
      };
      const savedAt = new Date().toISOString();

      setData(next);
      setLastSynced(savedAt);
      setOffline(false);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: next, savedAt }));
    } catch {
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { data, loading, offline, lastSynced, refresh };
}