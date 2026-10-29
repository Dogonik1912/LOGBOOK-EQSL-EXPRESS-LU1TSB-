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
export async function sendPrivateMessagePush(callsign, item = {}) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  let webpush;
  try { webpush = (await import('web-push')).default; } catch { return; }
  let cfg;
  try { cfg = config(); } catch { return; }
  const normalized = callsign.trim().toUpperCase();
  const aliases = ['LU1TSB', 'LU1TSB/4RC978', '4RC978'].includes(normalized)
    ? ['LU1TSB', 'LU1TSB/4RC978', '4RC978']
    : [normalized];
  const groups = await Promise.all(aliases.map(alias => readSubscriptions(alias, cfg)));
  const seen = new Set();
  const active = groups.flat().filter(entry => {
    const endpoint = entry?.subscription?.endpoint;
    if (!endpoint || seen.has(endpoint)) return false;
    seen.add(endpoint);
    return true;
  });
  if (!active.length) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:lu1tsb.4rc978@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );
  const failed = new Set();
  await Promise.all(active.map(async entry => {
    try {
      await webpush.sendNotification(entry.subscription, JSON.stringify({
        title: 'Nuevo mensaje privado',
        body: 'Tienes un mensaje privado de ' + clean(item.from, 40) + '.',
        tag: 'private-' + clean(item.id, 36),
        url: '/?open_private_messages=1',
        silent: entry.alertsEnabled === false,
      }), { TTL: 60 * 60 * 24 });
    } catch (error) {
      if (error?.statusCode === 404 || error?.statusCode === 410) failed.add(entry.subscription.endpoint);
    }
  }));
  if (failed.size) await writeSubscriptions(normalized, active.filter(entry => !failed.has(entry.subscription?.endpoint)), cfg);
}

export async function sendEqslPush(callsign, item = {}) {
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return;
  let webpush;
  try { webpush = (await import('web-push')).default; } catch { return; }
  let cfg;
  try { cfg = config(); } catch { return; }
  // Merge subscriptions for the owner's linked identifiers, deduplicated by endpoint.
  const aliases = ['LU1TSB', 'LU1TSB/4RC978', '4RC978'].includes(callsign.trim().toUpperCase())
    ? ['LU1TSB', 'LU1TSB/4RC978', '4RC978']
    : [callsign.trim().toUpperCase()];
  const groups = await Promise.all(aliases.map(alias => readSubscriptions(alias, cfg)));
  const seenEndpoints = new Set();
  const subscriptions = groups.flat().filter(entry => {
    const endpoint = entry?.subscription?.endpoint;
    if (!endpoint || seenEndpoints.has(endpoint)) return false;
    seenEndpoints.add(endpoint);
    return true;
  });
  const active = subscriptions.filter(s => s && s.subscription?.endpoint);
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
  });
  const failed = new Set();
  await Promise.all(active.map(async (entry) => {
    try {
      const notificationPayload = JSON.stringify({ title: 'LogBook eQSL EXPRESS', body: item.isResponse ? 'Has recibido una respuesta a tu eQSL.' : 'Has recibido una nueva eQSL.', tag: 'eqsl-' + clean(item.id, 24), url: '/?open_eqsl_inbox=1', unreadCount: Number(item.unreadCount) || 1, silent: entry.alertsEnabled === false });
      await webpush.sendNotification(entry.subscription, notificationPayload, { TTL: 60 * 60 * 24 });
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
    const action = clean(req.body?.action, 24);
    if (action === 'notify-private') {
      const recipient = clean(req.body?.recipient, 40).toUpperCase();
      const messageId = clean(req.body?.messageId, 36);
      if (!recipient || recipient === callsign || !/^[0-9a-f-]{36}$/i.test(messageId)) {
        return json(res, 400, { error: 'Destinatario o mensaje privado no válido.' });
      }
      // Verify against the database that this authenticated sender actually sent the message.
      const verify = await fetch(cfg.supabaseUrl + '/rest/v1/rpc/community_private_messages', {
        method: 'POST',
        headers: { apikey: cfg.supabaseKey, Authorization: 'Bearer ' + cfg.supabaseKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_callsign: callsign, p_token: token, p_other_callsign: recipient }),
      });
      if (!verify.ok) return json(res, 403, { error: 'No se pudo verificar el mensaje privado.' });
      const rows = await verify.json();
      const messages = Array.isArray(rows) ? rows : [];
      const sent = messages.find(message => message?.id === messageId &&
        String(message.sender_callsign || '').toUpperCase() === callsign &&
        String(message.recipient_callsign || '').toUpperCase() === recipient);
      if (!sent) return json(res, 403, { error: 'El mensaje no coincide con un envío confirmado.' });
      await sendPrivateMessagePush(recipient, { id: messageId, from: callsign });
      return json(res, 200, { ok: true });
    }
    const subscriptions = await readSubscriptions(callsign, cfg);
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
