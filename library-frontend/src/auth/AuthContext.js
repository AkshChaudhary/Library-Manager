import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { get, post } from '../api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);

  const loadSession = useCallback(async () => {
    try {
      const data = await get('/auth/session');
      setUser(data.user);
      setSession(data.session);
    } catch {
      setUser(null);
      setSession(null);
    }
  }, []);

  useEffect(() => {
    loadSession().finally(() => setChecking(false));
  }, [loadSession]);

  // Keep the timer in step with the server.
  useEffect(() => {
    if (!user) return undefined;
    const timer = setInterval(loadSession, 30000);
    return () => clearInterval(timer);
  }, [user, loadSession]);

  const login = async (email, password) => {
    const data = await post('/auth/login', { email, password });
    setUser(data.user);
    setSession(data.session);
    return data.user;
  };

  const logout = async () => {
    try {
      await post('/auth/logout');
    } finally {
      setUser(null);
      setSession(null);
    }
  };

  const extend = async () => {
    const data = await post('/auth/extend');
    setSession(data.session);
  };

  // Called when the server says the session has ended.
  const expire = useCallback(() => {
    setUser(null);
    setSession(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, session, checking, login, logout, extend, expire, refreshSession: loadSession }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}