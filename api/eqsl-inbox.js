import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';
import { sendEqslPush } from './push-subscription.js';

const clean = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const CALL_RE = /^[A-Z0-9][A-Z0-9/ _-]{2,39}$/;

function config() {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!token) throw new Error('EQSL_SHARE_NOT_CONFIGURED');
  if (!supabaseUrl || !supabaseKey) throw new Error('EQSL_INBOX_AUTH_NOT_CONFIGURED');
  return { token, supabaseUrl, supabaseKey };
}

async function resolveIdentity(identityToken, cfg) {
  if (!/^[0-9a-f-]{36}$/i.test(String(identityToken || ''))) return '';
  const response = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/resolve_community_callsign', {
    method: 'POST',
    headers: { apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_token: identityToken }),
  });
  if (!response.ok) return '';
  const value = await response.json();
  return typeof value === 'string' ? value.trim().toUpperCase() : '';
}

function inboxPath(callsign) {
  const key = createHash('sha256').update(callsign.trim().toUpperCase()).digest('hex');
  return 'eqsl-inboxes/' + key + '.json';
}

async function readInbox(callsign, cfg) {
  try {
    const stored = await get(inboxPath(callsign), { access: 'private', token: cfg.token });
    if (!stored || stored.statusCode !== 200 || !stored.stream) return [];
    const data = await new Response(stored.stream).json();
    return Array.isArray(data?.items) ? data.items : [];
  } catch { return []; }
}

async function writeInbox(callsign, items, cfg) {
  await put(inboxPath(callsign), JSON.stringify({ callsign, items: items.slice(0, 250) }), {
    access: 'private', token: cfg.token, contentType: 'application/json; charset=utf-8',
    addRandomSuffix: false, allowOverwrite: true,
  });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    const cfg = config();
    if (req.method === 'GET') {
      const identityToken = clean(req.headers['x-identity-token'], 64);
      const callsign = await resolveIdentity(identityToken, cfg);
      if (!callsign) return json(res, 401, { error: 'Verificá primero tu señal distintiva en este dispositivo.' });
      const items = await readInbox(callsign, cfg);
      const unread = items.filter(item => !item.readAt).length;
      const pendingReplies = unread;
      if (String(req.query?.count || '') === '1') return json(res, 200, { callsign, pendingReplies, unread });
      if (String(req.query?.peek || '') === '1') return json(res, 200, { callsign, items: items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), unread, pendingReplies });
      const marked = items.map(item => item.readAt ? item : { ...item, readAt: new Date().toISOString() });
      if (unread) await writeInbox(callsign, marked, cfg);
      return json(res, 200, { callsign, items: marked.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))), unread: 0, pendingReplies: 0 });
    }
    if (req.method === 'POST') {
      const sender = await resolveIdentity(clean(req.body?.token, 64), cfg);
      if (!sender || sender !== clean(req.body?.callsign, 40).toUpperCase()) {
        return json(res, 401, { error: 'La identidad de este dispositivo no pudo verificarse.' });
      }
      if (clean(req.body?.action, 32) === 'mark-answered') {
        const originalId = clean(req.body?.id, 24);
        const ownItems = await readInbox(sender, cfg);
        const original = ownItems.find(item => item.id === originalId && !item.isResponse);
        if (!original) return json(res, 404, { error: 'No se encontró la eQSL original en tu buzón.' });
        if (!original.answeredAt) {
          original.answeredAt = new Date().toISOString();
          await writeInbox(sender, ownItems, cfg);
        }
        return json(res, 200, { ok: true, pendingReplies: ownItems.filter(item => !item.isResponse && !item.answeredAt).length });
      }
      const recipient = clean(req.body?.to, 40).toUpperCase();
      const id = clean(req.body?.id, 24);
      if (!CALL_RE.test(recipient) || !/^[a-f0-9]{12,24}$/i.test(id)) return json(res, 400, { error: 'Destinatario o identificador eQSL inválido.' });
      const items = await readInbox(recipient, cfg);
      if (!items.some(item => item.id === id)) {
        items.unshift({
          id,
          from: /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(clean(req.body?.band, 24))
            ? (clean(req.body?.from, 40).toUpperCase() || sender)
            : sender,
          to: recipient,
          isResponse: Boolean(req.body?.isResponse),
          date: clean(req.body?.date, 10),
          band: clean(req.body?.band, 24),
          mode: clean(req.body?.mode, 16),
          createdAt: new Date().toISOString(),
          readAt: null,
        });
        await writeInbox(recipient, items, cfg);
        // Push delivery is best-effort: a push provider outage must not prevent eQSL delivery.
        try { await sendEqslPush(recipient, items[0]); } catch { /* No interrumpir la entrega de la eQSL si falla el push. */ }
      }
      return json(res, 201, { ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    const message = String(error?.message || '');
    const missingConfig = message.includes('NOT_CONFIGURED');
    return json(res, missingConfig ? 503 : 500, { error: missingConfig ? 'El buzón necesita configuración del almacenamiento y de la verificación de identidad.' : 'No se pudo consultar el buzón eQSL.' });
  }
}
