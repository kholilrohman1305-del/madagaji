import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import api from '../api';
import { toast } from '../utils/toast';

const AuthContext = createContext(null);
const BYPASS_USER = {
  id: 0,
  username: 'admin',
  role: 'admin',
  display_name: 'Administrator'
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(BYPASS_USER);
  const [loading] = useState(false);

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
  }, []);

  const login = async (username, password) => {
    setUser(BYPASS_USER);
    return { data: { success: true, message: 'Login dilewati.', user: BYPASS_USER } };
  };

  const logout = async () => {
    setUser(BYPASS_USER);
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
