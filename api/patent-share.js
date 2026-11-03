import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const BUCKET = 'eqsl-private';
const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const json = (res, status, body) => res.status(status).json(body);

function getStorage() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('PATENT_SHARE_NOT_CONFIGURED');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage.from(BUCKET);
}

async function readRecord(storage, path) {
  const { data, error } = await storage.download(path);
  if (error || !data) return null;
  return JSON.parse(await data.text());
}

async function writeRecord(storage, path, record) {
  const { error } = await storage.upload(path, JSON.stringify(record), {
    contentType: 'application/json',
    upsert: true,
  });
  if (error) throw error;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  try {
    const storage = getStorage();

    if (req.method === 'POST') {
      const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
      if (
        imageDataUrl.length > 3600000 ||
        !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)
      ) {
        return json(res, 400, { error: 'La imagen de la patente no es válida o es demasiado grande.' });
      }

      const id = randomBytes(10).toString('hex');
      const expiresAt = new Date(Date.now() + LIFETIME_MS).toISOString();
      await writeRecord(storage, `patent-shares/${id}.json`, { id, imageDataUrl, expiresAt });
      return json(res, 201, { id, expiresAt });
    }

    if (req.method === 'GET') {
      const id = String(req.query?.id || '').trim();
      if (!/^[a-f0-9]{20}$/i.test(id)) {
        return json(res, 400, { error: 'Enlace de patente inválido.' });
      }

      const record = await readRecord(storage, `patent-shares/${id}.json`);
      if (
        record?.id !== id ||
        !record?.expiresAt ||
        Date.parse(record.expiresAt) <= Date.now() ||
        typeof record.imageDataUrl !== 'string'
      ) {
        return json(res, 404, { error: 'La patente no existe o el enlace venció.' });
      }

      return json(res, 200, {
        imageDataUrl: record.imageDataUrl,
        expiresAt: record.expiresAt,
      });
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    const message = String(error?.message || '');
    console.error('[patent-share] storage operation failed:', message);
    const notConfigured = message.includes('PATENT_SHARE_NOT_CONFIGURED');
    return json(res, notConfigured ? 503 : 500, {
      error: notConfigured
        ? 'Los enlaces de patente necesitan configurar el almacenamiento privado del servidor.'
        : 'No se pudo guardar o recuperar la patente. Volvé a intentarlo.',
    });
  }
}
