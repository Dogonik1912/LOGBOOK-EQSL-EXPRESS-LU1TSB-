import { randomBytes } from 'node:crypto';
import { get, put } from '@vercel/blob';

// Shared eQSL cards live in private Vercel Blob storage.
const clean = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

function getToken() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error('EQSL_SHARE_NOT_CONFIGURED');
  return token;
}

function validateCard(body) {
  const card = {
    from: clean(body?.from, 40).toUpperCase(),
    to: clean(body?.to, 40).toUpperCase(),
    isResponse: Boolean(body?.isResponse),
    date: clean(body?.date, 10),
    time: clean(body?.time, 5),
    band: clean(body?.band, 24),
    frequency: clean(body?.frequency, 16),
    mode: clean(body?.mode, 16),
    rstSent: clean(body?.rstSent || '59', 8),
    rstRcvd: clean(body?.rstRcvd || '59', 8),
    qth: clean(body?.qth, 80),
    grid: clean(body?.grid, 12),
    imageDataUrl: typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '',
  };
  if (card.imageDataUrl && (
    card.imageDataUrl.length > 1800000 ||
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(card.imageDataUrl)
  )) return null;
  const isCB = /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(card.band);
  const validStation = (value) => isCB
    ? /^[A-Z0-9][A-Z0-9 /_-]{0,39}$/.test(value)
    : CALL_RE.test(value);
  if (
    !validStation(card.from) || !validStation(card.to) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(card.date) ||
    !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(card.time) ||
    !card.band || !card.frequency || !card.mode
  ) return null;
  return card;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const token = getToken();

    if (req.method === 'POST') {
      const card = validateCard(req.body || {});
      if (!card) return json(res, 400, { error: 'Datos de la eQSL incompletos o inválidos.' });

      const id = randomBytes(16).toString('hex'); // Token portador de 128 bits para dificultar la adivinación de enlaces.
      const expiresAt = new Date(Date.now() + LIFETIME_MS).toISOString();
      const pathname = `eqsl-shares/${id}.json`;
      await put(pathname, JSON.stringify({ id, card, expiresAt }), {
        access: 'private',
        token,
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
      });
      return json(res, 201, { id, expiresAt });
    }

    if (req.method === 'GET') {
      const id = clean(req.query?.id, 32);
      if (!/^[a-z0-9_-]{6,32}$/i.test(id)) {
        return json(res, 400, { error: 'Enlace eQSL inválido.' });
      }
      const stored = await get(`eqsl-shares/${id}.json`, { access: 'private', token });
      if (!stored || stored.statusCode !== 200 || !stored.stream) {
        return json(res, 404, { error: 'La tarjeta no existe o el enlace ha caducado.' });
      }
      const record = await new Response(stored.stream).json();
      if (!record?.expiresAt || Date.parse(record.expiresAt) <= Date.now() || !record.card) {
        return json(res, 404, { error: 'La tarjeta no existe o el enlace ha caducado.' });
      }
      const alreadyViewed = Boolean(record.firstViewedAt);
      if (!alreadyViewed) {
        record.firstViewedAt = new Date().toISOString();
        record.viewCount = 1;
        await put(`eqsl-shares/${id}.json`, JSON.stringify(record), {
          access: 'private',
          token,
          contentType: 'application/json; charset=utf-8',
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      } else {
        record.viewCount = Number(record.viewCount || 1) + 1;
        await put(`eqsl-shares/${id}.json`, JSON.stringify(record), {
          access: 'private',
          token,
          contentType: 'application/json; charset=utf-8',
          addRandomSuffix: false,
          allowOverwrite: true,
        });
      }
      return json(res, 200, { card: record.card, expiresAt: record.expiresAt, alreadyViewed });
    }

    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    const message = String(error?.message || '');
    console.error('[eqsl-share] storage operation failed:', message);
    const notConfigured = message.includes('EQSL_SHARE_NOT_CONFIGURED');
    return json(res, notConfigured ? 503 : 500, {
      error: notConfigured
        ? 'Los enlaces cortos eQSL necesitan configurar el almacenamiento del servidor.'
        : 'No se pudo recuperar la tarjeta eQSL. Pedile al colega que vuelva a compartirla.',
    });
  }
}
