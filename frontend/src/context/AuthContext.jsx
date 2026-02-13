import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { toast } from '../utils/toast';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadMe = async () => {
    try {
      const res = await api.get('/auth/me', { skipToast: true });
      setUser(res.data?.user || null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkHealth = async () => {
      try {
        await api.get('/health', { skipToast: true });
      } catch (e) {
        const message = e?.response?.data?.message || 'Database tidak terkoneksi.';
        toast.error(message);
      }
    };
    checkHealth();
    loadMe();
  }, []);

  const login = async (username, password) => {
    const res = await api.post('/auth/login', { username, password });
    setUser(res.data?.user || null);
    return res;
  };

  const logout = async () => {
    await api.post('/auth/logout', {}, { skipToast: true });
    setUser(null);
  };

  const value = useMemo(() => ({
    user,
    loading,
    login,
    logout
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
