import axios from 'axios';
import { toast } from './utils/toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  withCredentials: true
});

api.interceptors.response.use(
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

export default api;
