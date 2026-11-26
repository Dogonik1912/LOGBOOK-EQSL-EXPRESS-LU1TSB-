import { createClient } from '@supabase/supabase-js';

const clean = (value, max = 80) => String(value ?? '').trim().slice(0, max);
const json = (res, status, body) => res.status(status).json(body);
const HAM_CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const CB_CALL_RE = /^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$/;
const stationType = (value) => CB_CALL_RE.test(String(value || '').trim().toUpperCase()) ? '11m' : HAM_CALL_RE.test(String(value || '').trim().toUpperCase()) ? 'ham' : '';

function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('PROFILE_CONTACTS_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Método no permitido.' }); }
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
      const is11m = type === '11m';
      const division = is11m ? (remote.match(/^([0-9]{1,3})[A-Z]/)?.[1] || '') : '';
      rows.push({
        owner_callsign: owner,
        qso_key: qsoKey,
        remote_callsign: remote,
        station_type: type,
        country_name: clean(item?.country, 100) || null,
        division: division || null,
        band,
        qso_date: date,
        qso_time: time,
      });
    }
    if (!rows.length) return json(res, 200, { ok: true, saved: 0 });
    const { error } = await admin.from('community_profile_contacts').upsert(rows, {
      onConflict: 'owner_callsign,qso_key',
      ignoreDuplicates: true,
    });
    if (error) throw error;
    return json(res, 200, { ok: true, saved: rows.length });
  } catch (error) {
    console.error('[profile-contacts] sync failed:', error?.message || error);
    return json(res, 503, { error: 'No se pudo sincronizar el historial de contactos.' });
  }
}
