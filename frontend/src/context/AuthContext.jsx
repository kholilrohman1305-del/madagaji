import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { toast } from '../utils/toast';
import { loginBiometric } from '../utils/biometric';

const AuthContext = createContext(null);
const isBypassEnabled =
  !import.meta.env.PROD &&
  String(import.meta.env.VITE_AUTH_BYPASS || '').toLowerCase() === 'true';
const BYPASS_USER = { id: 0, username: 'admin', role: 'admin', display_name: 'Administrator' };

const getMymadaDashboardUrl = () => {
  const fallback = typeof window !== 'undefined' ? `${window.location.origin}/pdmada` : '/pdmada';
  const rawValue = String(import.meta.env.VITE_PDMADA_URL || '').trim();
  if (!rawValue) return fallback;
  if (typeof window === 'undefined') return rawValue;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(rawValue)) return fallback;
  return rawValue;
};

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

  const loginWithBiometric = async () => {
    const data = await loginBiometric();
    setUser(data?.user || null);
    toast.success(data?.message || 'Login berhasil.');
    return data;
  };

  const logout = async () => {
    try {
      if (!isBypassEnabled) {
        await api.post('/auth/logout', {}, { skipToast: true });
      }
    } finally {
      setUser(null);
      window.location.assign(getMymadaDashboardUrl());
    }
  };

  const value = useMemo(() => ({
    user,
    loading,
    login,
    loginWithBiometric,
    logout
  }), [user, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
