import axios from 'axios';
import { toast } from './utils/toast';

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

const baseURL = import.meta.env.VITE_CORE_API_BASE_URL || import.meta.env.VITE_API_BASE_URL || '/api';

const api = attachInterceptors(axios.create({ baseURL, withCredentials: true }));

export const academicApi = api;
export const financeApi = api;
export const adminApi = api;

export default api;
