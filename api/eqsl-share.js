import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

// eQSL share objects are stored in the private Supabase Storage bucket.
const BUCKET = 'eqsl-private';
const clean = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const HAM_CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const CB_CALL_RE = /^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$/;
const is11mBand = (band) => /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(band || ''));
const stationType = (value) => CB_CALL_RE.test(String(value || '').trim().toUpperCase()) ? '11m' : HAM_CALL_RE.test(String(value || '').trim().toUpperCase()) ? 'ham' : '';
const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

function getStorage() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('EQSL_SHARE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(BUCKET);
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

function validateCard(body) {
  const llotaReference = clean(body?.llotaReference, 20).toUpperCase();
  const sotaReference = clean(body?.sotaReference, 24).toUpperCase();
  const iotaReference = clean(body?.iotaReference, 12).toUpperCase();
  if (llotaReference && !/^LL[A-Z]{2}-\d{4,5}$/.test(llotaReference)) return null;
  if (sotaReference && !/^[A-Z0-9]{1,5}(?:\/[A-Z0-9]{1,5})?-[A-Z0-9]{3,5}$/.test(sotaReference)) return null;
  if (iotaReference && !/^(?:AF|AN|AS|EU|NA|OC)-\d{3}$/.test(iotaReference)) return null;
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
    ...(llotaReference ? { llotaReference, llotaReferenceName: clean(body?.llotaReferenceName, 120) } : {}),
    ...(sotaReference ? { sotaReference, sotaReferenceName: clean(body?.sotaReferenceName, 120) } : {}),
    ...(iotaReference ? { iotaReference, iotaReferenceName: clean(body?.iotaReferenceName, 120) } : {}),
    imageDataUrl: typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '',
  };
  if (card.imageDataUrl && (
    card.imageDataUrl.length > 1800000 ||
    !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(card.imageDataUrl)
  )) return null;
  const isCB = is11mBand(card.band);
  const expectedType = isCB ? '11m' : 'ham';
  const numericFrequency = Number(String(card.frequency).replace(',', '.'));
  const is11mFrequency = Number.isFinite(numericFrequency) && numericFrequency >= 26.965 && numericFrequency <= 27.999;
  if (
    stationType(card.from) !== expectedType || stationType(card.to) !== expectedType ||
    is11mFrequency !== isCB ||
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
    const storage = getStorage();

    if (req.method === 'POST') {
      const card = validateCard(req.body || {});
      if (!card) return json(res, 400, { error: 'Datos de la eQSL incompletos o inválidos.' });

      const clientDeliveryId = clean(req.body?.clientDeliveryId, 100);
      const id = /^[a-zA-Z0-9_-]{8,100}$/.test(clientDeliveryId)
        ? createHash('sha256').update(clientDeliveryId).digest('hex').slice(0, 24)
        : randomBytes(9).toString('hex');
      const path = `eqsl-shares/${id}.json`;
      const existing = await readRecord(storage, path);
      if (existing?.card) {
        if (JSON.stringify(existing.card) !== JSON.stringify(card)) return json(res, 409, { error: 'El identificador de entrega ya está asociado a otra tarjeta.' });
        return json(res, 200, { id, expiresAt: existing.expiresAt, reused: true });
      }
      const expiresAt = new Date(Date.now() + LIFETIME_MS).toISOString();
      await writeRecord(storage, path, { id, card, expiresAt });
      return json(res, 201, { id, expiresAt });
    }

    if (req.method === 'GET') {
      const id = clean(req.query?.id, 24);
      if (!/^[a-z0-9_-]{6,24}$/i.test(id)) {
        return json(res, 400, { error: 'Enlace eQSL inválido.' });
      }
      const record = await readRecord(storage, `eqsl-shares/${id}.json`);
      if (!record?.expiresAt || Date.parse(record.expiresAt) <= Date.now() || !record.card) {
        return json(res, 404, { error: 'La tarjeta no existe o el enlace ha caducado.' });
      }
      const alreadyViewed = Boolean(record.firstViewedAt);
      if (!alreadyViewed) {
        record.firstViewedAt = new Date().toISOString();
        record.viewCount = 1;
      } else {
        record.viewCount = Number(record.viewCount || 1) + 1;
      }
      await writeRecord(storage, `eqsl-shares/${id}.json`, record);
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
        ? 'Los enlaces cortos eQSL necesitan configurar el almacenamiento privado del servidor.'
        : 'No se pudo recuperar la tarjeta eQSL. Pedile al colega que vuelva a compartirla.',
    });
  }
}
