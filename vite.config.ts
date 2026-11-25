import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  // Emit JavaScript and CSS compatible with the last Chrome release for Windows 7.
  build: {
    target: ['chrome109'],
    cssTarget: 'chrome109',
  },
  plugins: [
    react(),
  ],
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
