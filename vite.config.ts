import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import lookupHandler from './api/lookup.js';
import qrzHandler from './api/qrz.js';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'qrz-api-dev-routes',
      configureServer(server) {
        // Keep local development API behavior aligned with the Vercel handlers.
        server.middlewares.use('/api/lookup', (req, res) => {
          void lookupHandler(req as any, res as any);
        });
        server.middlewares.use('/api/qrz', (req, res) => {
          void qrzHandler(req as any, res as any);
        });
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
