import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { toast } from '../utils/toast';

const AuthContext = createContext(null);
const isBypassEnabled =
  !import.meta.env.PROD &&
  String(import.meta.env.VITE_AUTH_BYPASS || '').toLowerCase() === 'true';
const BYPASS_USER = { id: 0, username: 'admin', role: 'admin', display_name: 'Administrator' };

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      try {
        await api.get('/health', { skipToast: true });
        if (isBypassEnabled) {
          setUser(BYPASS_USER);
          return;
        }
        const me = await api.get('/auth/me', { skipToast: true });
        setUser(me?.data?.user || null);
      } catch (e) {
        const status = e?.response?.status;
        if (status !== 401) {
          const message = e?.response?.data?.message || 'Database tidak terkoneksi.';
          toast.error(message);
        }
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = async (username, password) => {
    if (isBypassEnabled) {
      setUser(BYPASS_USER);
      toast.success('Login bypass aktif.');
      return { data: { success: true, user: BYPASS_USER } };
    }
    const res = await api.post('/auth/login', { username, password }, { skipToast: true });
    setUser(res?.data?.user || null);
    toast.success(res?.data?.message || 'Login berhasil.');
    return res;
  };

  const logout = async () => {
    if (!isBypassEnabled) {
      await api.post('/auth/logout', {}, { skipToast: true });
    }
    setUser(null);
    toast.success('Logout berhasil.');
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
