import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/pdmada/',
  plugins: [react()],
  server: {
    host: true,
    allowedHosts: ['.ngrok-free.app'],
    port: 3002
  }
});
