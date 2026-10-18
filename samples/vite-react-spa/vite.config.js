import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // CodeBuild injects --base=/projects/<projectId>/live/ during automated build
  base: process.env.VITE_BASE_PATH || './',
});
