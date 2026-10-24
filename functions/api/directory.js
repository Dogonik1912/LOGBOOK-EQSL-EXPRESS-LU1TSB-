const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const validEmail = (v) => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(v || '').trim());
const cleanCall = (v) => String(v || '').trim().toUpperCase();
const cleanText = (v, max) => String(v || '').trim().slice(0, max);
const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store, max-age=0', 'Pragma': 'no-cache', 'X-Content-Type-Options': 'nosniff' } });

async function db(env, path, init = {}) {
  const base = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('DIRECTORY_NOT_CONFIGURED');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=representation', ...(init.headers || {}) },
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`DIRECTORY_DB_ERROR_${response.status}: ${responseText.slice(0, 200)}`);
  return responseText ? JSON.parse(responseText) : [];
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  if (request.method === 'GET') {
    const action = String(url.searchParams.get('action') || '');
    try {
      if (action === 'lookup') {
        const call = cleanCall(url.searchParams.get('call'));
        if (!CALL_RE.test(call)) return json({ error: 'Indicativo no válido' }, 400);
        const rows = await db(env, `eqsl_directory?select=callsign,email,whatsapp,telegram,country,grid&callsign=eq.${encodeURIComponent(call)}&contact_public=eq.true&limit=1`);
        return json({ contact: rows[0] || null });
      }
      if (action === 'count') {
        const rows = await db(env, 'rpc/get_eqsl_directory_stats', { method: 'POST', body: '{}' });
        const stats = Array.isArray(rows) ? rows[0] : rows;
        return json({ activeUsers: Number(stats?.active_users || 0), totalActions: Number(stats?.total_actions || 0) });
      }
      return json({ error: 'Acción no válida' }, 400);
    } catch (error) {
      const notConfigured = String(error?.message || '').includes('DIRECTORY_NOT_CONFIGURED');
      return json({ error: notConfigured ? 'Directorio mundial aún no configurado' : 'No se pudo consultar el directorio' }, notConfigured ? 503 : 500);
    }
  }
  if (request.method !== 'POST') return new Response(JSON.stringify({ error: 'Método no permitido' }), { status: 405, headers: { 'Content-Type': 'application/json', Allow: 'GET, POST' } });
  let body = {};
  try { body = await request.json(); } catch { return json({ error: 'JSON inválido' }, 400); }
  const call = cleanCall(body.callsign);
  if (!CALL_RE.test(call)) return json({ error: 'Indicativo no válido' }, 400);
  try {
    if (body.action === 'activity') {
      await db(env, 'rpc/record_eqsl_activity', { method: 'POST', body: JSON.stringify({ p_callsign: call }) });
      return json({ ok: true });
    }
    if (body.action === 'contact') {
      return json({ error: 'La publicación mundial de contactos está temporalmente deshabilitada hasta implementar la verificación del titular del indicativo.' }, 501);
    }
    return json({ error: 'Acción no válida' }, 400);
  } catch (error) {
    const message = String(error?.message || '');
    const notConfigured = message.includes('DIRECTORY_NOT_CONFIGURED');
    const invalid = message.includes('INVALID_CALLSIGN');
    return json({ error: notConfigured ? 'Directorio mundial aún no configurado' : invalid ? 'Indicativo no válido' : 'No se pudo actualizar el directorio' }, notConfigured ? 503 : invalid ? 400 : 500);
  }
}
