import { createClient } from '@supabase/supabase-js';

const json = (res, status, body) => res.status(status).json(body);
const clean = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const HAM_CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const CB_CALL_RE = /^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$/;
const stationType = (value) => CB_CALL_RE.test(String(value || '').trim().toUpperCase()) ? '11m' : HAM_CALL_RE.test(String(value || '').trim().toUpperCase()) ? 'ham' : '';

function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('PUBLIC_PROFILE_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function qsoKey(owner, remote, date, time, band, frequency, mode) {
  const sorted = [owner, remote].sort((a, b) => a.localeCompare(b));
  const normalized = Number(String(frequency || '').replace(',', '.')).toFixed(3);
  return [sorted[0], sorted[1], date, time, String(band || '').trim().toLowerCase(), normalized, String(mode || '').trim().toUpperCase()].join('|');
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'Método no permitido.' }); }
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
    } else if (identity?.identity_type) {
      identities = [{ callsign: requested, identity_type: identity.identity_type }];
    }
    const aliases = identities.map(item => item.callsign);
    const typeByCall = new Map(identities.map(item => [item.callsign, item.identity_type]));
    const [historyResult, spotsOwnResult, spotsRemoteResult, galleryResult] = await Promise.all([
      admin.from('community_profile_contacts').select('owner_callsign,qso_key,remote_callsign,station_type,country_name,division,band,qso_date,qso_time').in('owner_callsign', aliases).limit(5000),
      admin.from('live_qso_spots').select('spot_key,callsign,station_callsign,qso_date,qso_time,band,frequency,mode,country').in('station_callsign', aliases).limit(5000),
      admin.from('live_qso_spots').select('spot_key,callsign,station_callsign,qso_date,qso_time,band,frequency,mode,country').in('callsign', aliases).limit(5000),
      admin.from('community_profile_eqsl_gallery').select('recipient_callsign,sender_callsign,station_type,card,received_at').in('recipient_callsign', aliases).order('received_at', { ascending: true }).limit(200),
    ]);
    for (const result of [historyResult, spotsOwnResult, spotsRemoteResult, galleryResult]) if (result.error) throw result.error;
    const contacts = new Map();
    for (const row of historyResult.data || []) {
      contacts.set(row.station_type + '|' + row.qso_key, {
        stationType: row.station_type, remoteCallsign: row.remote_callsign,
        country: row.country_name || '', division: row.division || '', band: row.band || '',
      });
    }
    const addSpot = (spot, owner, remote) => {
      const type = typeByCall.get(owner) || stationType(owner);
      if (!type || stationType(remote) !== type) return;
      const key = qsoKey(owner, remote, spot.qso_date, spot.qso_time, spot.band, spot.frequency, spot.mode);
      const uniqueKey = type + '|' + key;
      if (!contacts.has(uniqueKey)) contacts.set(uniqueKey, {
        stationType: type, remoteCallsign: remote, country: spot.country || '',
        division: type === '11m' ? (String(remote).match(/^([0-9]{1,3})[A-Z]/)?.[1] || '') : '',
        band: spot.band || '',
      });
    };
    for (const spot of spotsOwnResult.data || []) addSpot(spot, spot.station_callsign, spot.callsign);
    for (const spot of spotsRemoteResult.data || []) addSpot(spot, spot.callsign, spot.station_callsign);
    return json(res, 200, {
      identities,
      contacts: Array.from(contacts.values()),
      gallery: (galleryResult.data || []).map(item => ({
        senderCallsign: item.sender_callsign, stationType: item.station_type,
        receivedAt: item.received_at, card: item.card,
      })),
    });
  } catch (error) {
    console.error('[public-profile] load failed:', error?.message || error);
    return json(res, 503, { error: 'No se pudieron cargar las estadísticas y la galería públicas.' });
  }
}
