import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const mainBackend = process.env.VITE_MAIN_BACKEND_URL || 'http://localhost:4000';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['.ngrok-free.app'],
    port: 5173,
    proxy: {
      '/api': {
        target: mainBackend,
        changeOrigin: true
      },
      '/sks': {
        target: mainBackend,
        changeOrigin: true
      },
      '/pdmada': {
        target: mainBackend,
        changeOrigin: true
      },
      '/pdmada-api': {
        target: mainBackend,
        changeOrigin: true
      }
    }
  }
});
