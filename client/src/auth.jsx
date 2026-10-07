import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api';

const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function refresh() {
    setLoading(true);
    setError('');
    try {
      const data = await api('/auth/me', { ignoreAuth: true });
      setUser(data.user);
    } catch (err) {
      if (err.status !== 401) setError(err.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let active = true;
    api('/auth/me', { ignoreAuth: true })
      .then((data) => {
        if (active) setUser(data.user);
      })
      .catch((err) => {
        if (active && err.status !== 401) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    const expired = () => setUser(null);
    window.addEventListener('hms:session-expired', expired);
    return () => {
      active = false;
      window.removeEventListener('hms:session-expired', expired);
    };
  }, []);
  async function login(values) {
    const data = await api('/auth/login', { method: 'POST', body: values, ignoreAuth: true });
    setError('');
    setUser(data.user);
  }
  async function register(values) {
    const data = await api('/auth/register', { method: 'POST', body: values, ignoreAuth: true });
    setError('');
    setUser(data.user);
  }
  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch (err) {
      if (err.status !== 401) throw err;
    }
    setUser(null);
  }
  return (
    <AuthContext.Provider
      value={{ user, setUser, loading, error, refresh, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
// Kept together with the provider so the session contract stays in one place.
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
