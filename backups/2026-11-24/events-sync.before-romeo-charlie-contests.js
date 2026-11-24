import { createClient } from '@supabase/supabase-js';

const CONTESTCLOCK_API = 'https://contestclock.com/api/contests';
const CQ11WW_URL = 'https://www.cq11ww.org/es/default.asp';
const CQ11WW_RULES_URL = 'https://www.cq11ww.org/es/reglas-6.asp';
const RCA_CALENDAR_URL = 'https://www.lu4aa.org/wp/calendario-actividades/';
const CQWW_HOME_URL = 'https://cqww.com/';
const RC_ACTIVATIONS_URL = 'https://www.rcqsl.com/activation.php';
const EK_HOME_URL = 'https://ekdxgroup.com/';
const SUGAR_CONTESTS_URL = 'https://sugardelta.org/concursos.php';
const SUGAR_ACTIVATIONS_URL = 'https://sugardelta.org/activaciones.php';
const ALFA_TANGO_URL = 'https://www.alfatango.org/';
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


function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'").replace(/&ndash;/gi, '–').replace(/&mdash;/gi, '—')
    .replace(/&aacute;/gi, 'á').replace(/&eacute;/gi, 'é').replace(/&iacute;/gi, 'í')
    .replace(/&oacute;/gi, 'ó').replace(/&uacute;/gi, 'ú').replace(/&ntilde;/gi, 'ñ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

function rcaCalendarRows(html) {
  const yearMatch = html.match(/Año\s+(20\d{2})/i);
  const defaultYear = yearMatch ? Number(yearMatch[1]) : new Date().getUTCFullYear();
  const items = [...html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)];
  const rows = [];
  const seen = new Set();
  for (const match of items) {
    const raw = match[1];
    const text = decodeHtml(raw.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
    const dateMatch = text.match(/(\d{1,2})(?:\s*(?:al|a|y|–|—|-)\s*(\d{1,2}))?\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\b/i);
    if (!dateMatch) continue;
    const month = MONTHS[dateMatch[3].toLowerCase()];
    if (month === undefined) continue;
    const yearInText = text.match(/20\d{2}/);
    const year = yearInText ? Number(yearInText[0]) : defaultYear;
    const startDay = Number(dateMatch[1]);
    const endDay = Number(dateMatch[2] || dateMatch[1]);
    const start = new Date(Date.UTC(year, month, startDay, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, endDay, 23, 59, 0));
    if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month || end.getUTCMonth() !== month || end < start) continue;
    if (end.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000) continue;
    let title = text.slice(dateMatch.index + dateMatch[0].length).replace(/^\s*[:–—-]\s*/, '').trim();
    title = title.replace(/[.\s]+$/, '').slice(0, 220);
    if (title.length < 3) continue;
    const key = title.toLowerCase() + '|' + start.toISOString();
    if (seen.has(key)) continue;
    seen.add(key);
    const international = /\bYOTA\b/i.test(title);
    const slug = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
    const anchor = raw.match(/href=["'](https?:\/\/[^"']+)["']/i);
    rows.push({
      external_id: 'rca-calendar:' + slug + ':' + year,
      title,
      description: 'Actividad publicada en el calendario oficial del Radio Club Argentino. Confirmá horarios, condiciones y posibles cambios en la publicación original.',
      event_scope: international ? 'international' : 'national',
      station_type: 'ham',
      country_code: international ? null : 'AR',
      country_name: international ? 'Internacional' : 'Argentina',
      organizer: 'Radio Club Argentino (RCA)',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: 'UTC',
      rules_url: anchor ? anchor[1] : null,
      source_url: RCA_CALENDAR_URL,
      source_name: 'Radio Club Argentino (RCA) · calendario oficial',
      image_url: null,
      status: 'published',
      verified: true,
      is_auto: true,
      source_updated_at: null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}


function cqwwRows(html) {
  const text = decodeHtml(String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
  const rows = [];
  const definitions = [
    { mode: 'SSB', month: 9, regex: /SSB:\s*October\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(20\d{2})/i },
    { mode: 'CW', month: 10, regex: /CW:\s*November\s+(\d{1,2})\s*-\s*(\d{1,2}),?\s*(20\d{2})/i },
  ];
  for (const definition of definitions) {
    const match = text.match(definition.regex);
    if (!match) continue;
    const year = Number(match[3]);
    const startDay = Number(match[1]);
    const endDay = Number(match[2]);
    const start = new Date(Date.UTC(year, definition.month, startDay, 0, 0, 0));
    const end = new Date(Date.UTC(year, definition.month, endDay, 23, 59, 59));
    if (start.getUTCFullYear() !== year || start.getUTCMonth() !== definition.month || end.getUTCMonth() !== definition.month || end < start) continue;
    if (end.getTime() < Date.now() - 30 * 24 * 60 * 60 * 1000 || start.getTime() > Date.now() + 370 * 24 * 60 * 60 * 1000) continue;
    rows.push({
      external_id: 'cqww-' + definition.mode.toLowerCase() + '-' + year,
      title: 'CQ World Wide DX Contest ' + definition.mode + ' ' + year,
      description: 'Concurso mundial de radioafición. Horario oficial: desde las 00:00 UTC del sábado hasta las 23:59:59 UTC del domingo. Consultá las bases oficiales para bandas, categorías y condiciones de participación.',
      event_scope: 'international',
      station_type: 'ham',
      country_code: null,
      country_name: 'Internacional',
      organizer: 'CQ Magazine / CQ WW DX Contest',
      start_at: start.toISOString(),
      end_at: end.toISOString(),
      timezone: 'UTC',
      rules_url: 'https://www.cqww.com/rules/',
      source_url: CQWW_HOME_URL,
      source_name: 'CQ World Wide DX Contest · sitio oficial',
      image_url: null,
      status: 'published',
      verified: true,
      is_auto: true,
      source_updated_at: null,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return rows;
}


const EN_MONTHS = { jan:0, january:0, feb:1, february:1, mar:2, march:2, apr:3, april:3, may:4, jun:5, june:5, jul:6, july:6, aug:7, august:7, sep:8, sept:8, september:8, oct:9, october:9, nov:10, november:10, dec:11, december:11 };

function plainText(html) {
  return decodeHtml(String(html || '').replace(/<script[\\s\\S]*?<\\/script>/gi, ' ').replace(/<style[\\s\\S]*?<\\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ')).trim();
}

function validRange(year, month, startDay, endDay) {
  const start = new Date(Date.UTC(year, month, startDay, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, endDay, 23, 59, 59));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month || end.getUTCMonth() !== month || end < start) return null;
  const now = Date.now();
  if (end.getTime() < now - 30 * 86400000 || start.getTime() > now + 400 * 86400000) return null;
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function make11mEvent({ id, title, description, organizer, sourceUrl, sourceName, startAt, endAt, rulesUrl }) {
  return {
    external_id: id.slice(0, 240),
    title: title.slice(0, 220),
    description: description ? description.slice(0, 5000) : null,
    event_scope: 'international',
    station_type: '11m',
    country_code: null,
    country_name: 'Internacional',
    organizer,
    start_at: startAt || null,
    end_at: endAt || null,
    timezone: 'UTC',
    rules_url: rulesUrl || sourceUrl,
    source_url: sourceUrl,
    source_name: sourceName,
    image_url: null,
    status: 'published',
    verified: true,
    is_auto: true,
    source_updated_at: null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function parseIsoRange(text) {
  const m = text.match(/(20\\d{2})-(\\d{2})-(\\d{2})\\s*(?:to|–|—|-)\\s*(20\\d{2})-(\\d{2})-(\\d{2})/i);
  if (!m) return null;
  return validRange(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[6])) && Number(m[1])===Number(m[4]) && Number(m[2])===Number(m[5])
    ? validRange(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[6])) : null;
}

function parseNumericRange(text) {
  const m = text.match(/(?:start(?:\\s+date)?\\s*:?\\s*)?(\\d{1,2})[./](\\d{1,2})[./](20\\d{2})\\s*(?:to|a|–|—|-)\\s*(?:end(?:\\s+date)?\\s*:?\\s*)?(\\d{1,2})[./](\\d{1,2})[./](20\\d{2})/i);
  if (!m || m[3] !== m[6] || m[2] !== m[5]) return null;
  return validRange(Number(m[3]), Number(m[2])-1, Number(m[1]), Number(m[4]));
}

function parseEnglishRange(text) {
  const m = text.match(/(\\d{1,2})\\s+([A-Za-z]{3,9})\\s+(20\\d{2})\\s*(?:→|to|–|—|-)\\s*(\\d{1,2})\\s+([A-Za-z]{3,9})\\s+(20\\d{2})/i);
  if (!m || m[3] !== m[6]) return null;
  const month1 = EN_MONTHS[m[2].toLowerCase()];
  const month2 = EN_MONTHS[m[5].toLowerCase()];
  if (month1 === undefined || month1 !== month2) return null;
  return validRange(Number(m[3]), month1, Number(m[1]), Number(m[4]));
}

function parseLongEnglishWeekend(text) {
  const m = text.match(/(?:Saturday|Sat\\.?)[, ]+([A-Za-z]+)\\s+(\\d{1,2}),?\\s+(20\\d{2})[^.]{0,80}?(?:Sunday|Sun\\.?)[, ]+([A-Za-z]+)\\s+(\\d{1,2}),?\\s+(20\\d{2})/i);
  if (!m || m[3] !== m[6]) return null;
  const month1 = EN_MONTHS[m[1].toLowerCase()];
  const month2 = EN_MONTHS[m[4].toLowerCase()];
  if (month1 === undefined || month1 !== month2) return null;
  return validRange(Number(m[3]), month1, Number(m[2]), Number(m[5]));
}

function eventBlocks(html) {
  const blocks = [...String(html || '').matchAll(/<(?:article|tr|li|section)\\b[^>]*>([\\s\\S]*?)<\\/(?:article|tr|li|section)>/gi)].map(m => m[1]);
  return blocks.length ? blocks : [String(html || '')];
}

function parseRomeoCharlie(html) {
  const rows = [];
  for (const block of eventBlocks(html)) {
    const text = plainText(block);
    const m = text.match(/([A-Z0-9]+RC\\/[A-Z0-9-]+)\\s+([A-Z]+)\\s*:\\s*([^0-9]{3,90}?)\\s+(20\\d{2}-\\d{2}-\\d{2})\\s+to\\s+(20\\d{2}-\\d{2}-\\d{2})/i);
    if (!m) continue;
    const range = parseIsoRange(m[4] + ' to ' + m[5]);
    if (!range) continue;
    const station = m[1].toUpperCase();
    rows.push(make11mEvent({
      id: 'romeo-charlie:' + station + ':' + range.start_at.slice(0,10),
      title: station + ' · ' + m[3].trim(),
      description: 'Activación publicada en el calendario oficial de Romeo Charlie. Tipo: ' + m[2].toUpperCase() + '. Verificá actividad y QSL en la página de origen.',
      organizer: 'Romeo Charlie DX Group',
      sourceUrl: RC_ACTIVATIONS_URL,
      sourceName: 'Romeo Charlie · activaciones oficiales',
      startAt: range.start_at,
      endAt: range.end_at,
    }));
  }
  return rows;
}

function parseSugarDelta(html, sourceUrl, sourceName) {
  const rows = [];
  for (const block of eventBlocks(html)) {
    const text = plainText(block);
    let range = parseIsoRange(text) || parseNumericRange(text) || parseEnglishRange(text) || parseLongEnglishWeekend(text);
    if (!range) continue;
    const title = text.slice(0, 180).trim();
    if (!title || title.length < 4) continue;
    const idPart = title.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 90);
    rows.push(make11mEvent({
      id: 'sugar-delta:' + idPart + ':' + range.start_at.slice(0,10),
      title: title.slice(0, 220),
      description: 'Actividad o concurso publicado por Sugar Delta. Consultá las bases oficiales para horarios, frecuencias, categorías y envío de logs.',
      organizer: 'Sugar Delta International DX Group',
      sourceUrl,
      sourceName,
      startAt: range.start_at,
      endAt: range.end_at,
    }));
  }
  return rows;
}

function parseEchoKilo(html) {
  const rows = [];
  for (const block of eventBlocks(html)) {
    const text = plainText(block);
    const range = parseIsoRange(text) || parseNumericRange(text) || parseEnglishRange(text) || parseLongEnglishWeekend(text);
    if (!range) continue;
    const title = (text.match(/ECHO KILO[^.]{0,100}|Activation[^.]{0,100}|Special Event[^.]{0,100}|Contest[^.]{0,100}/i) || [text.slice(0,150)])[0].trim();
    const idPart = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0,90);
    rows.push(make11mEvent({
      id: 'echo-kilo:' + idPart + ':' + range.start_at.slice(0,10),
      title: title.slice(0,220),
      description: 'Evento publicado por Echo Kilo DX Group. Consultá la publicación original para reglas, frecuencias, registro y resultados.',
      organizer: 'Echo Kilo DX Group',
      sourceUrl: EK_HOME_URL,
      sourceName: 'Echo Kilo · noticias y concursos oficiales',
      startAt: range.start_at,
      endAt: range.end_at,
    }));
  }
  return rows;
}

function parseAlfaTango(html) {
  const rows = [];
  const anchors = [...String(html || '').matchAll(/<a\\b[^>]*href=["']([^"']+)["'][^>]*>([\\s\\S]*?)<\\/a>/gi)];
  for (const match of anchors) {
    const text = plainText(match[2]);
    const range = parseEnglishRange(text);
    if (!range) continue;
    const title = text.replace(/\\d{1,2}\\s+[A-Za-z]{3,9}\\s+20\\d{2}\\s*(?:→|to|–|—|-)\\s*\\d{1,2}\\s+[A-Za-z]{3,9}\\s+20\\d{2}/i, '').trim();
    if (!title || title.length < 3) continue;
    const href = match[1].startsWith('http') ? match[1] : new URL(match[1], ALFA_TANGO_URL).toString();
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0,90);
    rows.push(make11mEvent({
      id: 'alfa-tango:' + slug + ':' + range.start_at.slice(0,10),
      title: title.slice(0,220),
      description: 'Evento publicado en el calendario oficial de Alfa Tango. Consultá el enlace original para condiciones y detalles de participación.',
      organizer: 'Alfa Tango Worldwide DX Group',
      sourceUrl: ALFA_TANGO_URL,
      sourceName: 'Alfa Tango · calendario oficial',
      startAt: range.start_at,
      endAt: range.end_at,
      rulesUrl: href,
    }));
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
        } else if (source.source_key === 'romeo-charlie-11m') {
          const response = await fetchWithTimeout(RC_ACTIVATIONS_URL, 'text/html');
          const rows = parseRomeoCharlie(await response.text());
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'sugar-delta-11m') {
          const [contestsResponse, activationsResponse] = await Promise.all([
            fetchWithTimeout(SUGAR_CONTESTS_URL, 'text/html'),
            fetchWithTimeout(SUGAR_ACTIVATIONS_URL, 'text/html'),
          ]);
          const rows = [
            ...parseSugarDelta(await contestsResponse.text(), SUGAR_CONTESTS_URL, 'Sugar Delta · concursos oficiales'),
            ...parseSugarDelta(await activationsResponse.text(), SUGAR_ACTIVATIONS_URL, 'Sugar Delta · activaciones oficiales'),
          ];
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'echo-kilo-11m') {
          const response = await fetchWithTimeout(EK_HOME_URL, 'text/html');
          const rows = parseEchoKilo(await response.text());
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'alfa-tango-11m') {
          const response = await fetchWithTimeout(ALFA_TANGO_URL, 'text/html');
          const rows = parseAlfaTango(await response.text());
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'cqww-ham') {
          const response = await fetchWithTimeout(CQWW_HOME_URL, 'text/html');
          const html = await response.text();
          const rows = cqwwRows(html);
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'radio-club-argentina') {
          const response = await fetchWithTimeout(RCA_CALENDAR_URL, 'text/html');
          const html = await response.text();
          const rows = rcaCalendarRows(html);
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
      interval_hours: 24,
      results,
    });
  } catch (error) {
    console.error('[Eventos] Falló la sincronización programada:', error?.message || error);
    return res.status(503).json({ error: 'No se pudo ejecutar la actualización automática.' });
  }
}
