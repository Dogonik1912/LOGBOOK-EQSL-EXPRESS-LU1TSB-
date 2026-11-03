import { randomBytes } from 'node:crypto';
import { get, put } from '@vercel/blob';

const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;
const json = (res, status, body) => res.status(status).json(body);

function getToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('PATENT_SHARE_NOT_CONFIGURED');
  return token;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const token = getToken();
    if (req.method === 'POST') {
      const imageDataUrl = typeof req.body?.imageDataUrl === 'string' ? req.body.imageDataUrl : '';
      if (imageDataUrl.length > 3600000 || !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(imageDataUrl)) {
        return json(res, 400, { error: 'La imagen de la patente no es válida o es demasiado grande.' });
      }
      const id = randomBytes(10).toString('hex');
      const expiresAt = new Date(Date.now() + LIFETIME_MS).toISOString();
      await put(`patent-shares/${id}.json`, JSON.stringify({ id, imageDataUrl, expiresAt }), {
        access: 'private',
        token,
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
      });
      return json(res, 201, { id, expiresAt });
    }
    if (req.method === 'GET') {
      const id = String(req.query?.id || '').trim();
      if (!/^[a-f0-9]{20}$/i.test(id)) return json(res, 400, { error: 'Enlace de patente inválido.' });
      const stored = await get(`patent-shares/${id}.json`, { access: 'private', token });
      if (!stored || stored.statusCode !== 200 || !stored.stream) return json(res, 404, { error: 'La patente no existe o el enlace venció.' });
      const record = await new Response(stored.stream).json();
      if (!record?.expiresAt || Date.parse(record.expiresAt) <= Date.now() || typeof record.imageDataUrl !== 'string') {
        return json(res, 404, { error: 'La patente no existe o el enlace venció.' });
      }
      return json(res, 200, { imageDataUrl: record.imageDataUrl, expiresAt: record.expiresAt });
    }
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    const message = String(error?.message || '');
    console.error('[patent-share] storage operation failed:', message);
    return json(res, message.includes('PATENT_SHARE_NOT_CONFIGURED') ? 503 : 500, {
      error: message.includes('PATENT_SHARE_NOT_CONFIGURED')
        ? 'Los enlaces de patente necesitan configurar el almacenamiento del servidor.'
        : 'No se pudo guardar o recuperar la patente. Volvé a intentarlo.',
    });
  }
}
