import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import legacy from '@vitejs/plugin-legacy';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // Amplía la compatibilidad con navegadores que siguen funcionando en equipos antiguos.
    // Chrome 109 incluye la última versión de Chrome disponible para Windows 7.
    legacy({ targets: ['Chrome >= 109', 'Firefox >= 115', 'Safari >= 15.1', 'Edge >= 109'] }),
  ],
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
