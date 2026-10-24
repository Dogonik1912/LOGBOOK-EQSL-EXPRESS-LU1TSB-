// Short-lived public eQSL share links. Supabase credentials stay server-side.
const clean = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;

async function db(path, init = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('EQSL_SHARE_NOT_CONFIGURED');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`EQSL_SHARE_DB_${response.status}: ${body.slice(0, 160)}`);
  return body ? JSON.parse(body) : [];
}

function validateCard(body) {
  const card = {
    from: clean(body?.from, 24).toUpperCase(),
    to: clean(body?.to, 24).toUpperCase(),
    date: clean(body?.date, 10),
    time: clean(body?.time, 5),
    band: clean(body?.band, 24),
    frequency: clean(body?.frequency, 16),
    mode: clean(body?.mode, 16),
    rstSent: clean(body?.rstSent || '59', 8),
    rstRcvd: clean(body?.rstRcvd || '59', 8),
    qth: clean(body?.qth, 80),
    grid: clean(body?.grid, 12),
  };
  if (!CALL_RE.test(card.from) || !CALL_RE.test(card.to) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(card.date) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(card.time) ||
      !card.band || !card.frequency || !card.mode) return null;
  return card;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.method === 'POST') {
      const card = validateCard(req.body || {});
      if (!card) return json(res, 400, { error: 'Datos de la eQSL incompletos o inválidos.' });
      const id = Array.from(crypto.getRandomValues(new Uint8Array(9)), b => b.toString(36).padStart(2, '0')).join('').slice(0, 12);
      const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
      await db('eqsl_shared_cards', {
        method: 'POST',
        body: JSON.stringify({ id, card, expires_at: expiresAt }),
      });
      return json(res, 201, { id, expiresAt });
    }
    if (req.method === 'GET') {
      const id = clean(req.query?.id, 24);
      if (!/^[a-z0-9]{6,24}$/i.test(id)) return json(res, 400, { error: 'Enlace eQSL inválido.' });
      const rows = await db(`eqsl_shared_cards?select=id,card,expires_at&id=eq.${encodeURIComponent(id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
      if (!rows.length) return json(res, 404, { error: 'La tarjeta no existe o el enlace ha caducado.' });
      return json(res, 200, { card: rows[0].card, expiresAt: rows[0].expires_at });
    }
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    const message = String(error?.message || '');
    const notConfigured = message.includes('EQSL_SHARE_NOT_CONFIGURED');
    return json(res, notConfigured ? 503 : 500, {
      error: notConfigured
        ? 'Los enlaces cortos eQSL necesitan configurar el almacenamiento del servidor.'
        : 'No se pudo crear o recuperar el enlace eQSL.',
    });
  }
}
