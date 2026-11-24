import { createClient } from '@supabase/supabase-js';

const CONTESTCLOCK_API = 'https://contestclock.com/api/contests';
const CQ11WW_URL = 'https://www.cq11ww.org/es/default.asp';
const CQ11WW_RULES_URL = 'https://www.cq11ww.org/es/reglas-6.asp';
const MONTHS = { enero:0, febrero:1, marzo:2, abril:3, mayo:4, junio:5, julio:6, agosto:7, septiembre:8, setiembre:8, octubre:9, noviembre:10, diciembre:11 };

function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('EVENTS_SYNC_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function fetchWithTimeout(url, accept) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, { headers: { Accept: accept, 'User-Agent': 'LogBook-eQSL-Express-Events/1.0 (+https://logbook-eqsl-express-lu-1-tsb.vercel.app)' }, signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + new URL(url).hostname);
    return response;
  } finally { clearTimeout(timeout); }
}

function safeDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function contestClockRows(payload) {
  const now = Date.now();
  const oldest = now - 30 * 24 * 60 * 60 * 1000;
  const newest = now + 370 * 24 * 60 * 60 * 1000;
  const occurrences = Array.isArray(payload?.occurrences) ? payload.occurrences : [];
  const rows = [];
  for (const item of occurrences) {
    if (!item || item.verified !== true) continue;
    const startAt = safeDate(item.start);
    const endAt = safeDate(item.end);
    if (!startAt || !endAt) continue;
    const startTime = new Date(startAt).getTime();
    if (startTime < oldest || startTime > newest) continue;
    const countryCode = String(item.country || '').trim().toUpperCase();
    const isWorldwide = String(item.eligibility_scope || '').toLowerCase() === 'worldwide';
    const scope = isWorldwide ? 'international' : 'national';
    if (scope === 'national' && !/^[A-Z]{2}$/.test(countryCode)) continue;
    const modes = Array.isArray(item.modes) ? item.modes.join(', ') : '';
    const bands = Array.isArray(item.bands) ? item.bands.join(', ') : '';
    const details = [
      item.sponsor ? 'Organizador: ' + item.sponsor : '',
      modes ? 'Modos: ' + modes : '',
      bands ? 'Bandas: ' + bands : '',
      item.exchange ? 'Intercambio: ' + item.exchange : '',
      item.note ? String(item.note).slice(0, 1200) : '',
      item.eligibility_reason ? 'Participación: ' + item.eligibility_reason : '',
    ].filter(Boolean).join('\n');
    const uid = String(item.uid || (String(item.contest_id || item.name || 'contest') + '-' + startAt)).slice(0, 240);
    rows.push({
      external_id: 'contestclock:' + uid,
      title: String(item.name || item.contest_id || 'Concurso de radioafición').slice(0, 220),
      description: details || null,
      event_scope: scope,
      station_type: 'ham',
      country_code: /^[A-Z]{2}$/.test(countryCode) ? countryCode : null,
      country_name: /^[A-Z]{2}$/.test(countryCode) ? countryCode : 'Internacional',
      organizer: String(item.sponsor || '').slice(0, 180) || null,
      start_at: startAt,
      end_at: endAt,
      timezone: 'UTC',
      rules_url: item.rules_url && /^https?:\/\//i.test(item.rules_url) ? item.rules_url : null,
      source_url: 'https://contestclock.com/',
      source_name: 'ContestClock (licencia CC BY 4.0) · reglamento del organizador',
      image_url: null,
      status: 'published',
      verified: true,
      is_auto: true,
      source_updated_at: safeDate(item.rules_url_checked),
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}

function parseCqEleven(html) {
  const yearMatch = html.match(/CONCURSO\s+(20\d{2})/i);
  const dateMatch = html.match(/(?:Para\s+)?20\d{2}[^.]{0,60}?s[áa]bado\s+(\d{1,2})\s+y\s+domingo\s+(\d{1,2})\s+de\s+([a-záéíóú]+)/i);
  if (!yearMatch || !dateMatch) return null;
  const year = Number(yearMatch[1]);
  const startDay = Number(dateMatch[1]);
  const endDay = Number(dateMatch[2]);
  const month = MONTHS[String(dateMatch[3]).toLowerCase()];
  if (!Number.isInteger(year) || !Number.isInteger(startDay) || !Number.isInteger(endDay) || month === undefined) return null;
  const start = new Date(Date.UTC(year, month, startDay, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, endDay, 23, 59, 0));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month || end.getUTCMonth() !== month || end < start) return null;
  return {
    external_id: 'cq-eleven-ww:' + year,
    title: 'Eleven World Wide Contest ' + year,
    description: 'Concurso mundial dedicado exclusivamente a 11 metros. La organización indica una duración de 48 horas, desde las 00:00 UTC del sábado hasta las 23:59 UTC del domingo. Consultá siempre las bases oficiales antes de participar.',
    event_scope: 'international',
    station_type: '11m',
    country_code: null,
    country_name: 'Internacional',
    organizer: 'CQ Eleven World Wide Contest',
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    timezone: 'UTC',
    rules_url: CQ11WW_RULES_URL,
    source_url: CQ11WW_URL,
    source_name: 'CQ Eleven World Wide Contest · sitio oficial',
    image_url: null,
    status: 'published',
    verified: true,
    is_auto: true,
    source_updated_at: null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function recordRun(supabase, sourceKey, status, inserted, updated, errorMessage, details) {
  await supabase.from('radio_event_sync_runs').insert({
    source_key: sourceKey,
    finished_at: new Date().toISOString(),
    status,
    inserted_count: inserted,
    updated_count: updated,
    error_message: errorMessage || null,
    details: details || {},
  });
  await supabase.from('radio_event_sources').update({
    last_checked_at: new Date().toISOString(),
    ...(status === 'success' || status === 'partial' ? { last_success_at: new Date().toISOString(), last_error: null } : { last_error: String(errorMessage || 'Error de sincronización').slice(0, 500) }),
  }).eq('source_key', sourceKey);
}

async function upsertRows(supabase, sourceKey, rows) {
  if (!rows.length) {
    await recordRun(supabase, sourceKey, 'success', 0, 0, null, { received: 0 });
    return { inserted: 0, updated: 0, received: 0 };
  }
  const ids = rows.map((row) => row.external_id);
  const { data: existing, error: lookupError } = await supabase.from('radio_events').select('external_id').in('external_id', ids);
  if (lookupError) throw lookupError;
  const oldIds = new Set((existing || []).map((row) => row.external_id));
  const { error } = await supabase.from('radio_events').upsert(rows, { onConflict: 'external_id' });
  if (error) throw error;
  const inserted = rows.filter((row) => !oldIds.has(row.external_id)).length;
  const updated = rows.length - inserted;
  await recordRun(supabase, sourceKey, 'success', inserted, updated, null, { received: rows.length });
  return { inserted, updated, received: rows.length };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }
  let supabase;
  try {
    supabase = config();
    const secret = String(process.env.CRON_SECRET || '');
    const authorization = String(req.headers.authorization || '');
    const isCron = Boolean(secret && authorization === 'Bearer ' + secret);
    if (!isCron) {
      const token = String(req.headers['x-identity-token'] || '').trim();
      const requestedCall = String(req.headers['x-callsign'] || '').trim().toUpperCase();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token) ||
          !/^[A-Z0-9][A-Z0-9/]{2,23}$/.test(requestedCall)) {
        return res.status(401).json({ error: 'No autorizado.' });
      }
      const { data: rootCall, error: resolveError } = await supabase.rpc('resolve_community_callsign', { p_token: token });
      const canonical = String(rootCall || '').trim().toUpperCase();
      if (resolveError || !canonical) return res.status(401).json({ error: 'La identificación no está validada.' });
      const { data: identityOk, error: identityError } = await supabase.rpc('community_identity_authorized', { p_callsign: requestedCall, p_token: token });
      if (identityError || identityOk !== true) return res.status(403).json({ error: 'La identificación seleccionada no pertenece a esta cuenta.' });
      const { data: role } = await supabase.rpc('community_actor_role', { p_callsign: canonical, p_token: token });
      if (role !== 'admin') return res.status(403).json({ error: 'Solo el administrador puede forzar la actualización.' });
    }
    const { data: sources, error: sourceError } = await supabase.from('radio_event_sources').select('*').eq('enabled', true);
    if (sourceError) throw sourceError;
    const results = [];

    for (const source of sources || []) {
      try {
        if (source.source_key === 'contestclock-ham') {
          const currentYear = new Date().getUTCFullYear();
          const yearPayloads = await Promise.all([currentYear, currentYear + 1].map(async (year) => {
            const response = await fetchWithTimeout(CONTESTCLOCK_API + '?year=' + year, 'application/json');
            return response.json();
          }));
          const combined = { occurrences: yearPayloads.flatMap((payload) => Array.isArray(payload?.occurrences) ? payload.occurrences : []) };
          const rows = contestClockRows(combined);
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'cq-eleven-ww') {
          const response = await fetchWithTimeout(CQ11WW_URL, 'text/html');
          const html = await response.text();
          const event = parseCqEleven(html);
          const rows = event ? [event] : [];
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else {
          await recordRun(supabase, source.source_key, 'partial', 0, 0, 'No existe un adaptador para esta fuente.', {});
          results.push({ source: source.source_key, error: 'No existe un adaptador para esta fuente.' });
        }
      } catch (error) {
        const message = String(error?.message || error);
        await recordRun(supabase, source.source_key, 'error', 0, 0, message, {});
        results.push({ source: source.source_key, error: message });
      }
    }

    const failures = results.filter((item) => item.error);
    return res.status(failures.length === results.length && results.length ? 502 : 200).json({
      ok: failures.length === 0,
      checked_at: new Date().toISOString(),
      interval_hours: 12,
      results,
    });
  } catch (error) {
    console.error('[Eventos] Falló la sincronización programada:', error?.message || error);
    return res.status(503).json({ error: 'No se pudo ejecutar la actualización automática.' });
  }
}
