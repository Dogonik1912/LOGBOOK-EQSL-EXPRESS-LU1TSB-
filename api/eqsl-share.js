import { createHash, randomBytes } from 'node:crypto';
import { get, list, put } from '@vercel/blob';
import { createClient } from '@supabase/supabase-js';

// Shared eQSL cards live in private Vercel Blob storage.
const clean = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const LIFETIME_MS = 180 * 24 * 60 * 60 * 1000;

function mailboxKey(callsign) {
  return createHash('sha256').update(String(callsign).trim().toUpperCase()).digest('hex');
}

async function verifyCommunityIdentity(callsign, identityToken) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey || !identityToken) return false;
  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.rpc('resolve_community_callsign', { p_token: identityToken });
  return !error && typeof data === 'string' && data.trim().toUpperCase() === callsign;
}

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

      const id = randomBytes(9).toString('hex'); // Solo caracteres hexadecimales para evitar problemas en enlaces compartidos.
      const expiresAt = new Date(Date.now() + LIFETIME_MS).toISOString();
      const pathname = `eqsl-shares/${id}.json`;
      const record = { id, card, expiresAt, createdAt: new Date().toISOString() };
      await put(pathname, JSON.stringify(record), {
        access: 'private',
        token,
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
      });
      // Entregar una copia al buzón del destinatario. El contenido se mantiene privado en Blob.
      const inboxPath = `eqsl-inbox/${mailboxKey(card.to)}/${id}.json`;
      await put(inboxPath, JSON.stringify(record), {
        access: 'private',
        token,
        contentType: 'application/json; charset=utf-8',
        addRandomSuffix: false,
      });
      return json(res, 201, { id, expiresAt, deliveredToPost: true });
    }

    if (req.method === 'GET') {
      const requestedInbox = clean(req.query?.inbox, 40).toUpperCase();
      if (requestedInbox) {
        if (!/^[A-Z0-9][A-Z0-9 /_-]{1,39}$/.test(requestedInbox)) {
          return json(res, 400, { error: 'Indicativo inválido para consultar el buzón POST.' });
        }
        const identityToken = clean(req.query?.token, 64);
        if (!/^[0-9a-f-]{36}$/i.test(identityToken) || !(await verifyCommunityIdentity(requestedInbox, identityToken))) {
          return json(res, 403, { error: 'El buzón POST requiere la señal distintiva registrada en este dispositivo.' });
        }
        const inboxPrefix = `eqsl-inbox/${mailboxKey(requestedInbox)}/`;
        const found = await list({ prefix: inboxPrefix, limit: 100, token });
        const cards = [];
        for (const item of found.blobs || []) {
          try {
            const inboxBlob = await get(item.pathname, { access: 'private', token });
            if (!inboxBlob || inboxBlob.statusCode !== 200 || !inboxBlob.stream) continue;
            const inboxRecord = await new Response(inboxBlob.stream).json();
            if (!inboxRecord?.card || !inboxRecord?.expiresAt || Date.parse(inboxRecord.expiresAt) <= Date.now()) continue;
            if (String(inboxRecord.card.to || '').trim().toUpperCase() !== requestedInbox) continue;
            const cardPreview = { ...inboxRecord.card };
            delete cardPreview.imageDataUrl;
            cards.push({ id: inboxRecord.id, card: cardPreview, receivedAt: inboxRecord.createdAt || inboxRecord.expiresAt, expiresAt: inboxRecord.expiresAt });
          } catch (readError) {
            console.warn('[eqsl-share] skipping unreadable inbox item');
          }
        }
        cards.sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt));
        return json(res, 200, { callsign: requestedInbox, cards });
      }

      const id = clean(req.query?.id, 24);
      if (!/^[a-z0-9_-]{6,24}$/i.test(id)) {
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
