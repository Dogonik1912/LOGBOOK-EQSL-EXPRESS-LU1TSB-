import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => res.status(status).json(body);
const recentLookups = new Map();

function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('DIRECTORY_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Método no permitido' });
  }

  if (String(req.query?.action || '') !== 'lookup') {
    return json(res, 400, { error: 'Acción no válida' });
  }

  const token = String(req.headers['x-identity-token'] || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return json(res, 401, { error: 'Validá tu indicativo para consultar el directorio.' });
  }

  const lastLookup = recentLookups.get(token) || 0;
  if (Date.now() - lastLookup < 2000) {
    return json(res, 429, { error: 'Esperá un instante antes de actualizar el directorio.' });
  }
  recentLookups.set(token, Date.now());
  if (recentLookups.size > 2000) {
    const cutoff = Date.now() - 60000;
    for (const [identity, timestamp] of recentLookups) if (timestamp < cutoff) recentLookups.delete(identity);
  }

  try {
    const supabase = config();
    const { data: identity, error: identityError } = await supabase.rpc('resolve_community_callsign', { p_token: token });
    const callsign = String(identity || '').trim().toUpperCase();
    if (identityError || !callsign) {
      return json(res, 401, { error: 'La identidad de este dispositivo no está validada. Volvé a validar tu indicativo.' });
    }

    const { data: blocked, error: blockedError } = await supabase.rpc('community_is_blocked', { p_callsign: callsign });
    if (blockedError) return json(res, 503, { error: 'No se pudo comprobar el estado de acceso. Volvé a intentarlo.' });
    if (blocked === true) return json(res, 403, { error: 'Este indicativo no tiene acceso al directorio.' });
 
    const users = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('community_call_signs')
        .select('callsign')
        .order('callsign', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = Array.isArray(data) ? data : [];
      users.push(...page
        .map((row) => ({ callsign: String(row.callsign || '').trim().toUpperCase() }))
        .filter((row) => row.callsign && !['DOGON1K', 'LU1TSB/4RC978', 'PRONTO'].includes(row.callsign)));
      if (page.length < pageSize) break;
    }

    return json(res, 200, { users, total: users.length });
  } catch (error) {
    console.error('[Directorio de usuarios] No se pudo cargar la lista:', error?.message || error);
    return json(res, 503, { error: 'El directorio no está disponible en este momento. Volvé a intentarlo más tarde.' });
  }
}
