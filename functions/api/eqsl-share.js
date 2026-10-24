// Cloudflare Pages Function counterpart of api/eqsl-share.js.
// Required Pages secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
const clean = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
  },
});
const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;

function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '').slice(0, 12);
}

async function db(env, path, init = {}) {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
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
    imageDataUrl: typeof body?.imageDataUrl === 'string' ? body.imageDataUrl : '',
  };
  if (card.imageDataUrl && (card.imageDataUrl.length > 1800000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(card.imageDataUrl))) return null;
  if (!CALL_RE.test(card.from) || !CALL_RE.test(card.to) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(card.date) ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(card.time) ||
      !card.band || !card.frequency || !card.mode) return null;
  return card;
}

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);
    if (request.method === 'POST') {
      let body;
      try { body = await request.json(); } catch { return json({ error: 'JSON inválido.' }, 400); }
      const card = validateCard(body || {});
      if (!card) return json({ error: 'Datos de la eQSL incompletos o inválidos.' }, 400);
      const id = newId();
      const expiresAt = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString();
      await db(env, 'eqsl_shared_cards', {
        method: 'POST',
        body: JSON.stringify({ id, card, expires_at: expiresAt }),
      });
      return json({ id, expiresAt }, 201);
    }
    if (request.method === 'GET') {
      const id = clean(url.searchParams.get('id'), 24);
      if (!/^[a-z0-9]{6,24}$/i.test(id)) return json({ error: 'Enlace eQSL inválido.' }, 400);
      const rows = await db(env, `eqsl_shared_cards?select=id,card,expires_at&id=eq.${encodeURIComponent(id)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&limit=1`);
      if (!rows.length) return json({ error: 'La tarjeta no existe o el enlace ha caducado.' }, 404);
      return json({ card: rows[0].card, expiresAt: rows[0].expires_at });
    }
    return new Response(JSON.stringify({ error: 'Método no permitido.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'Allow': 'GET, POST', 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const notConfigured = String(error?.message || '').includes('EQSL_SHARE_NOT_CONFIGURED');
    return json({
      error: notConfigured
        ? 'Los enlaces cortos eQSL necesitan configurar el almacenamiento del servidor.'
        : 'No se pudo crear o recuperar el enlace eQSL.',
    }, notConfigured ? 503 : 500);
  }
}
