import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'qrz-proxy',
        configureServer(server) {
          server.middlewares.use('/api/qrz', async (req, res) => {
            try {
              const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
              const targetUrl = `https://xmldata.qrz.com/xml/current/${url.search}`;
              const upstreamRes = await fetch(targetUrl, {
                headers: {
                  'User-Agent': 'LogBook-eQSL-Express/1.0 (LU1TSB)',
                },
              });
              const text = await upstreamRes.text();
              res.setHeader('Content-Type', 'application/xml; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(text);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'text/plain');
              res.end(err?.message || 'Error fetching QRZ data');
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
