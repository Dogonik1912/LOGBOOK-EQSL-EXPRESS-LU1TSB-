import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';
import lookupHandler from './api/lookup';

export default defineConfig(() => ({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'qrz-api-dev-routes',
      configureServer(server) {
        // Use the same lookup implementation in development and in Vercel production.
        server.middlewares.use('/api/lookup', (req, res) => {
          void lookupHandler(req as any, res as any);
        });
        server.middlewares.use('/api/qrz', async (req, res) => {
          try {
            const url = new URL(req.url || '', 'http://' + (req.headers.host || 'localhost'));
            const target = 'https://xmldata.qrz.com/xml/current/' + url.search;
            const upstream = await fetch(target, {
              headers: { 'User-Agent': 'LogBook-eQSL-Express/1.0 (LU1TSB)' },
              signal: AbortSignal.timeout(10000),
            });
            res.statusCode = upstream.status;
            res.setHeader('Content-Type', 'application/xml; charset=utf-8');
            res.end(await upstream.text());
          } catch (error) {
            res.statusCode = 502;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(error instanceof Error ? error.message : 'Error consultando QRZ XML');
          }
        });
      },
    },
  ],
  resolve: { alias: { '@': path.resolve(process.cwd(), '.') } },
  server: {
    hmr: process.env.DISABLE_HMR !== 'true',
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
}));
