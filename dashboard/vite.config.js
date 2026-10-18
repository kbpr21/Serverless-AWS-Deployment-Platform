import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Generates relative asset paths for flexible hosting
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.VITE_API_ENDPOINT || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
