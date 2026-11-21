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

  const action = String(req.query?.action || '');
  if (!['lookup', 'check', 'grid-map'].includes(action)) {
    return json(res, 400, { error: 'Acción no válida' });
  }

  const token = String(req.headers['x-identity-token'] || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
    return json(res, 401, { error: 'Validá tu indicativo para consultar el directorio.' });
  }

  if (action === 'lookup') {
    const lastLookup = recentLookups.get(token) || 0;
    if (Date.now() - lastLookup < 2000) {
      return json(res, 429, { error: 'Esperá un instante antes de actualizar el directorio.' });
    }
    recentLookups.set(token, Date.now());
    if (recentLookups.size > 2000) {
      const cutoff = Date.now() - 60000;
      for (const [identity, timestamp] of recentLookups) if (timestamp < cutoff) recentLookups.delete(identity);
    }
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
 
    if (action === 'check') {
      const target = String(req.query?.callsign || '').trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9/ -]{1,39}$/.test(target)) {
        return json(res, 200, { registered: false });
      }
      if (['DOGON1K', 'LU1TSB/4RC978', 'PRONTO'].includes(target)) {
        return json(res, 200, { registered: false });
      }
      const { data: targetUser, error: targetError } = await supabase
        .from('community_call_signs')
        .select('callsign')
        .eq('callsign', target)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!targetUser) return json(res, 200, { registered: false });
      const { data: targetBlocked, error: targetBlockedError } = await supabase.rpc('community_is_blocked', { p_callsign: target });
      if (targetBlockedError) throw targetBlockedError;
      return json(res, 200, { registered: targetBlocked !== true });
    }

    const { data: blockedRows, error: sanctionsError } = await supabase
      .from('community_sanctions')
      .select('target_callsign')
      .eq('active', true)
      .eq('sanction_type', 'block');
    if (sanctionsError) throw sanctionsError;
    const blockedCallsigns = new Set((blockedRows || [])
      .map((row) => String(row.target_callsign || '').trim().toUpperCase())
      .filter(Boolean));

    if (action === 'grid-map') {
      const registered = new Set();
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('community_call_signs')
          .select('callsign')
          .order('callsign', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = Array.isArray(data) ? data : [];
        for (const row of page) {
          const station = String(row.callsign || '').trim().toUpperCase();
          if (station && !blockedCallsigns.has(station) && !['DOGON1K', 'LU1TSB/4RC978', 'PRONTO'].includes(station)) registered.add(station);
        }
        if (page.length < pageSize) break;
      }

      const stations = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from('live_spot_grid_locators')
          .select('callsign,grid_locator')
          .order('callsign', { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        const page = Array.isArray(data) ? data : [];
        for (const row of page) {
          const station = String(row.callsign || '').trim().toUpperCase();
          const grid = String(row.grid_locator || '').trim().toUpperCase();
          if (registered.has(station) && /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(grid)) {
            stations.push({ callsign: station, grid_locator: grid });
          }
        }
        if (page.length < pageSize) break;
      }
      return json(res, 200, { stations, total: stations.length });
    }

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
        .filter((row) => row.callsign && !['DOGON1K', 'LU1TSB/4RC978', 'PRONTO'].includes(row.callsign) && !blockedCallsigns.has(row.callsign)));
      if (page.length < pageSize) break;
    }

    // Indicamos únicamente si existe un Grid Locator válido para cada usuario.
    // No exponemos el locator ni sus coordenadas en el directorio público.
    const gridCallsigns = new Set();
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('live_spot_grid_locators')
        .select('callsign,grid_locator')
        .order('callsign', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      const page = Array.isArray(data) ? data : [];
      for (const row of page) {
        const station = String(row.callsign || '').trim().toUpperCase();
        const grid = String(row.grid_locator || '').trim().toUpperCase();
        if (station && /^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(grid)) {
          gridCallsigns.add(station);
        }
      }
      if (page.length < pageSize) break;
    }
    const directoryUsers = users.map((user) => ({
      ...user,
      has_grid_locator: gridCallsigns.has(user.callsign),
    }));
    return json(res, 200, { users: directoryUsers, total: directoryUsers.length });
  } catch (error) {
    console.error('[Directorio de usuarios] No se pudo cargar la lista:', error?.message || error);
    return json(res, 503, { error: 'El directorio no está disponible en este momento. Volvé a intentarlo más tarde.' });
  }
}
