import { createHash } from 'node:crypto';
import { get, put } from '@vercel/blob';

const clean = (v, max = 80) => String(v ?? '').trim().slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const config = () => {
  const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!blobToken) throw new Error('PUSH_BLOB_NOT_CONFIGURED');
  if (!supabaseUrl || !supabaseKey) throw new Error('PUSH_IDENTITY_NOT_CONFIGURED');
  return { blobToken, supabaseUrl, supabaseKey };
};
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
const pathFor = (callsign) => 'eqsl-push/' + createHash('sha256').update(callsign.toUpperCase()).digest('hex') + '.json';
async function readSubscriptions(callsign, cfg) {
  try {
    const result = await get(pathFor(callsign), { access: 'private', token: cfg.blobToken });
    if (!result || result.statusCode !== 200 || !result.stream) return [];
    const value = await new Response(result.stream).json();
    return Array.isArray(value.subscriptions) ? value.subscriptions : [];
  } catch { return []; }
}
async function writeSubscriptions(callsign, subscriptions, cfg) {
  await put(pathFor(callsign), JSON.stringify({ callsign, subscriptions: subscriptions.slice(-10) }), {
    access: 'private', token: cfg.blobToken, contentType: 'application/json; charset=utf-8',
    addRandomSuffix: false, allowOverwrite: true,
  });
}
export async function sendEqslPush(callsign, item = {}) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  let webpush;
  try { webpush = (await import('web-push')).default; } catch { return; }
  let cfg;
  try { cfg = config(); } catch { return; }
  const subscriptions = await readSubscriptions(callsign, cfg);
  const active = subscriptions.filter(s => s && s.alertsEnabled !== false && s.subscription?.endpoint);
  if (!active.length) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:lu1tsb.4rc978@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const payload = JSON.stringify({
    title: 'LogBook eQSL EXPRESS',
    body: item.isResponse ? 'Has recibido una respuesta a tu eQSL.' : 'Has recibido una nueva eQSL.',
    tag: 'eqsl-' + clean(item.id, 24),
    url: '/?open_eqsl_inbox=1',
    silent: false,
  });
  const failed = new Set();
  await Promise.all(active.map(async (entry) => {
    try {
      await webpush.sendNotification(entry.subscription, payload, { TTL: 60 * 60 * 24 });
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) failed.add(entry.subscription.endpoint);
    }
  }));
  if (failed.size) await writeSubscriptions(callsign, subscriptions.filter(s => !failed.has(s.subscription?.endpoint)), cfg);
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const cfg = config();
    if (req.method !== 'POST') return json(res, 405, { error: 'Método no permitido.' });
    const token = clean(req.body?.token, 64);
    const callsign = await resolveIdentity(token, cfg);
    if (!callsign || callsign !== clean(req.body?.callsign, 40).toUpperCase()) {
      return json(res, 401, { error: 'No se pudo verificar la señal distintiva de este dispositivo.' });
    }
    const subscriptions = await readSubscriptions(callsign, cfg);
    const action = clean(req.body?.action, 24);
    if (action === 'subscribe') {
      const subscription = req.body?.subscription;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json(res, 400, { error: 'La suscripción push no es válida.' });
      }
      const next = subscriptions.filter(s => s.subscription?.endpoint !== subscription.endpoint);
      next.push({ subscription, alertsEnabled: req.body?.alertsEnabled !== false, updatedAt: new Date().toISOString() });
      await writeSubscriptions(callsign, next, cfg);
      return json(res, 200, { ok: true });
    }
    if (action === 'settings') {
      const enabled = req.body?.alertsEnabled !== false;
      await writeSubscriptions(callsign, subscriptions.map(s => ({ ...s, alertsEnabled: enabled })), cfg);
      return json(res, 200, { ok: true });
    }
    if (action === 'unsubscribe') {
      const endpoint = clean(req.body?.endpoint, 2000);
      await writeSubscriptions(callsign, subscriptions.filter(s => s.subscription?.endpoint !== endpoint), cfg);
      return json(res, 200, { ok: true });
    }
    return json(res, 400, { error: 'Acción no válida.' });
  } catch (error) {
    const missing = String(error?.message || '').includes('NOT_CONFIGURED');
    return json(res, missing ? 503 : 500, { error: missing ? 'Las notificaciones push todavía no están configuradas en el servidor.' : 'No se pudo guardar la suscripción de notificaciones.' });
  }
}
