import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => res.status(status).json(body);
const recentLookups = new Map();

function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('DIRECTORY_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const clean = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const HAM_CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const CB_CALL_RE = /^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$/;
const stationType = (value) => CB_CALL_RE.test(String(value || '').trim().toUpperCase()) ? '11m' : HAM_CALL_RE.test(String(value || '').trim().toUpperCase()) ? 'ham' : '';

async function handleProfileContacts(req, res) {
  try {
    const admin = config();
    const token = clean(req.body?.token, 64);
    if (!/^[0-9a-f-]{36}$/i.test(token)) return json(res, 401, { error: 'Identidad no verificada.' });
    const { data: root, error: rootError } = await admin.rpc('resolve_community_callsign', { p_token: token });
    const rootCall = String(root || '').trim().toUpperCase();
    if (rootError || !rootCall) return json(res, 401, { error: 'Identidad no verificada.' });
    const { data: identities, error: identityError } = await admin.rpc('community_account_identities', { p_token: token });
    if (identityError) return json(res, 401, { error: 'No se pudieron verificar las identidades vinculadas.' });
    const allowed = new Set((Array.isArray(identities) ? identities : []).map(item => String(item?.callsign || '').trim().toUpperCase()).filter(Boolean));
    allowed.add(rootCall);
    const input = Array.isArray(req.body?.records) ? req.body.records.slice(0, 100) : [];
    const rows = [];
    for (const item of input) {
      const owner = clean(item?.stationCallsign, 40).toUpperCase();
      const remote = clean(item?.remoteCallsign, 40).toUpperCase();
      const type = stationType(owner);
      if (!allowed.has(owner) || !type || stationType(remote) !== type) continue;
      const date = clean(item?.date, 10), time = clean(item?.time, 5), band = clean(item?.band, 24);
      const frequency = Number(String(item?.frequency || '').replace(',', '.'));
      const mode = clean(item?.mode, 16).toUpperCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time) || !band || !Number.isFinite(frequency) || frequency <= 0) continue;
      const normalizedFrequency = frequency.toFixed(3);
      const sorted = [owner, remote].sort((a, b) => a.localeCompare(b));
      const qsoKey = [sorted[0], sorted[1], date, time, band.toLowerCase(), normalizedFrequency, mode].join('|');
      const division = type === '11m' ? (remote.match(/^([0-9]{1,3})[A-Z]/)?.[1] || '') : '';
      rows.push({ owner_callsign: owner, qso_key: qsoKey, remote_callsign: remote, station_type: type,
        country_name: clean(item?.country, 100) || null, division: division || null, band, qso_date: date, qso_time: time });
    }
    if (!rows.length) return json(res, 200, { ok: true, saved: 0 });
    const { error } = await admin.from('community_profile_contacts').upsert(rows, {
      onConflict: 'owner_callsign,qso_key', ignoreDuplicates: true,
    });
    if (error) throw error;
    return json(res, 200, { ok: true, saved: rows.length });
  } catch (error) {
    console.error('[profile-contacts] sync failed:', error?.message || error);
    return json(res, 503, { error: 'No se pudo sincronizar el historial de contactos.' });
  }
}

function profileQsoKey(owner, remote, date, time, band, frequency, mode) {
  const sorted = [owner, remote].sort((a, b) => a.localeCompare(b));
  const normalized = Number(String(frequency || '').replace(',', '.')).toFixed(3);
  return [sorted[0], sorted[1], date, time, String(band || '').trim().toLowerCase(), normalized, String(mode || '').trim().toUpperCase()].join('|');
}

async function handlePublicProfile(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  const requested = clean(req.query?.callsign, 40).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9/]{1,39}$/.test(requested)) return json(res, 400, { error: 'Señal distintiva inválida.' });
  try {
    const admin = config();
    const { data: details, error: detailError } = await admin.rpc('community_public_profile_details', { p_callsigns: [requested] });
    if (detailError || !Array.isArray(details) || !details.length) return json(res, 404, { error: 'Perfil público no encontrado.' });
    const { data: identity, error: identityError } = await admin.from('community_account_identities').select('account_id,identity_type').eq('callsign', requested).maybeSingle();
    if (identityError) throw identityError;
    let identities = [{ callsign: requested, identity_type: stationType(requested) || 'ham' }];
    if (identity?.account_id) {
      const { data, error } = await admin.from('community_account_identities').select('callsign,identity_type,is_primary').eq('account_id', identity.account_id).order('is_primary', { ascending: false });
      if (error) throw error;
      if (Array.isArray(data) && data.length) identities = data.map(item => ({ callsign: item.callsign, identity_type: item.identity_type }));
    } else if (identity?.identity_type) identities = [{ callsign: requested, identity_type: identity.identity_type }];
    const aliases = identities.map(item => item.callsign);
    const typeByCall = new Map(identities.map(item => [item.callsign, item.identity_type]));
    const [historyResult, spotsOwnResult, spotsRemoteResult, galleryResult] = await Promise.all([
      admin.from('community_profile_contacts').select('owner_callsign,qso_key,remote_callsign,station_type,country_name,division,band,qso_date,qso_time').in('owner_callsign', aliases).limit(5000),
      admin.from('live_qso_spots').select('spot_key,callsign,station_callsign,qso_date,qso_time,band,frequency,mode,country').in('station_callsign', aliases).limit(5000),
      admin.from('live_qso_spots').select('spot_key,callsign,station_callsign,qso_date,qso_time,band,frequency,mode,country').in('callsign', aliases).limit(5000),
      admin.from('community_profile_eqsl_gallery').select('recipient_callsign,sender_callsign,station_type,card,received_at').in('recipient_callsign', aliases).order('received_at', { ascending: true }).limit(30),
    ]);
    for (const result of [historyResult, spotsOwnResult, spotsRemoteResult, galleryResult]) if (result.error) throw result.error;
    const contacts = new Map();
    for (const row of historyResult.data || []) {
      const owner = String(row.owner_callsign || '').trim().toUpperCase();
      const remote = String(row.remote_callsign || '').trim().toUpperCase();
      if (!remote || remote === owner || typeByCall.has(remote)) continue;
      contacts.set(row.station_type + '|' + row.qso_key, {
        stationType: row.station_type, remoteCallsign: remote, country: row.country_name || '',
        division: row.division || '', band: row.band || '',
      });
    }
    const addSpot = (spot, owner, remote) => {
      const type = typeByCall.get(owner) || stationType(owner);
      if (!type || !remote || owner === remote || typeByCall.has(remote) || stationType(remote) !== type) return;
      const key = profileQsoKey(owner, remote, spot.qso_date, spot.qso_time, spot.band, spot.frequency, spot.mode);
      const uniqueKey = type + '|' + key;
      if (!contacts.has(uniqueKey)) contacts.set(uniqueKey, {
        stationType: type, remoteCallsign: remote, country: spot.country || '',
        division: type === '11m' ? (String(remote).match(/^([0-9]{1,3})[A-Z]/)?.[1] || '') : '',
        band: spot.band || '',
      });
    };
    for (const spot of spotsOwnResult.data || []) addSpot(spot, spot.station_callsign, spot.callsign);
    for (const spot of spotsRemoteResult.data || []) addSpot(spot, spot.callsign, spot.station_callsign);
    return json(res, 200, { identities, contacts: Array.from(contacts.values()), gallery: (galleryResult.data || []).map(item => ({
      senderCallsign: item.sender_callsign, stationType: item.station_type, receivedAt: item.received_at, card: item.card,
    })) });
  } catch (error) {
    console.error('[public-profile] load failed:', error?.message || error);
    return json(res, 503, { error: 'No se pudieron cargar las estadísticas y la galería públicas.' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  const action = req.method === 'POST' ? String(req.body?.action || '') : String(req.query?.action || '');
  if (req.method === 'GET' && action === 'public-profile') return handlePublicProfile(req, res);
  if (req.method === 'POST' && action === 'profile-contacts') return handleProfileContacts(req, res);
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido' });
  }
  if (!['lookup', 'check', 'grid-map'].includes(action)) return json(res, 400, { error: 'Acción no válida' });

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
