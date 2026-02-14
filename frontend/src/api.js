import axios from 'axios';
import { toast } from './utils/toast';

function resolveBaseUrl(envName, prodDefault, devFallback) {
  const fromEnv = import.meta.env[envName];
  if (fromEnv) return fromEnv;
  if (import.meta.env.PROD) return prodDefault;
  return devFallback;
}

function attachInterceptors(instance) {
  instance.interceptors.response.use(
    (response) => {
      const method = (response?.config?.method || 'get').toLowerCase();
      const skipToast = response?.config?.skipToast;
      if (!skipToast && method !== 'get') {
        const message = response?.data?.message || 'Perubahan berhasil disimpan.';
        toast.success(message);
      }
      return response;
    },
    (error) => {
      const skipToast = error?.config?.skipToast;
      if (!skipToast) {
        const message = error?.response?.data?.message || error?.message || 'Terjadi kesalahan.';
        toast.error(message);
      }
      return Promise.reject(error);
    }
  );
  return instance;
}

const coreBaseURL = resolveBaseUrl('VITE_CORE_API_BASE_URL', '/api', import.meta.env.VITE_API_BASE_URL || '/api');
const academicBaseURL = resolveBaseUrl('VITE_ACADEMIC_API_BASE_URL', '/academic/api', '/academic/api');
const financeBaseURL = resolveBaseUrl('VITE_FINANCE_API_BASE_URL', '/finance/api', '/finance/api');
const adminBaseURL = resolveBaseUrl('VITE_ADMIN_API_BASE_URL', '/admin/api', '/admin/api');

const api = attachInterceptors(axios.create({ baseURL: coreBaseURL, withCredentials: true }));
export const academicApi = attachInterceptors(axios.create({ baseURL: academicBaseURL, withCredentials: true }));
export const financeApi = attachInterceptors(axios.create({ baseURL: financeBaseURL, withCredentials: true }));
export const adminApi = attachInterceptors(axios.create({ baseURL: adminBaseURL, withCredentials: true }));

function pickBaseUrl(url = '') {
  if (url.startsWith('/schedule') || url.startsWith('/attendance')) return academicBaseURL;
  if (url.startsWith('/payroll/expenses')) return financeBaseURL;
  if (url.startsWith('/letters') || url.startsWith('/inventory') || url.startsWith('/borrowing')) return adminBaseURL;
  return coreBaseURL;
}

api.interceptors.request.use((config) => {
  if (config?.baseURL) return config;
  const next = { ...config };
  next.baseURL = pickBaseUrl(String(config?.url || ''));
  return next;
});

export default api;
