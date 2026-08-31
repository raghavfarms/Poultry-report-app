import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('poultry_user')); } catch { return null; }
  });
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('poultry_token')));

  const logout = () => {
    localStorage.removeItem('poultry_token');
    localStorage.removeItem('poultry_user');
    setUser(null);
  };


  const acceptSession = ({ token, user: nextUser }) => {
    localStorage.setItem('poultry_token', token);
    localStorage.setItem('poultry_user', JSON.stringify(nextUser));
    setUser(nextUser);
  };

  useEffect(() => {
    const onExpired = () => logout();
    window.addEventListener('auth-expired', onExpired);
    if (localStorage.getItem('poultry_token')) {
      api('/auth/me').then(({ user: current }) => {
        localStorage.setItem('poultry_user', JSON.stringify(current));
        setUser(current);
      }).catch(logout).finally(() => setLoading(false));
    } else setLoading(false);
    return () => window.removeEventListener('auth-expired', onExpired);
  }, []);

  const value = useMemo(() => ({ user, loading, acceptSession, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

