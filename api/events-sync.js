import { createClient } from '@supabase/supabase-js';

const CONTESTCLOCK_API = 'https://contestclock.com/api/contests';
const CQ11WW_URL = 'https://www.cq11ww.org/es/default.asp';
const CQ11WW_RULES_URL = 'https://www.cq11ww.org/es/reglas-6.asp';
const RCA_CALENDAR_URL = 'https://www.lu4aa.org/wp/calendario-actividades/';
const LU4AAO_PROGRAMMED_URL = 'https://lu4aao.org/actividades_programadas.htm';
const CQWW_HOME_URL = 'https://cqww.com/';
const RC_ACTIVATIONS_URL = 'https://www.rcqsl.com/activation.php';
const RC_CONTESTS_URL = 'https://www.rcqsl.com/contest.php';
const EK_HOME_URL = 'https://ekdxgroup.com/';
const SUGAR_CONTESTS_URL = 'https://sugardelta.org/concursos.php';
const SUGAR_ACTIVATIONS_URL = 'https://sugardelta.org/activaciones.php';
const ALFA_TANGO_URL = 'https://www.alfatango.org/';
const URE_CONTESTS_URL = 'https://www.ure.es/proximos-concursos/';
const REF_CALENDAR_URL = 'https://concours.r-e-f.org/calendrier/calendrier.php?annee=';
const DA_RC_XMAS_URL = 'https://da-rcxmas.org/es/';
const RCQSL_TROPHY_URL = 'https://www.rcqsl.com/news.php?id=62';
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
    const response = await fetch(url, { redirect: 'follow', cache: 'no-store', headers: { Accept: accept, 'Accept-Language': 'en-US,en;q=0.9,es;q=0.8', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36' }, signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status + ' from ' + new URL(url).hostname);
    return response;
  } finally { clearTimeout(timeout); }
}

async function fetchJsonWithTimeout(url) {
  const response = await fetchWithTimeout(url, 'application/json');
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  const body = await response.text();
  if (!contentType.includes('json')) throw new Error('La fuente devolvió un formato distinto de JSON.');
  let payload;
  try { payload = JSON.parse(body); } catch { throw new Error('La fuente devolvió JSON no válido.'); }
  if (!payload || !Array.isArray(payload.occurrences)) throw new Error('La fuente no devolvió una lista de concursos válida.');
  return payload;
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
      event_kind: 'contest',
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
      event_kind: /contest|concurso|championship|copa|trofeo/i.test(title) ? 'contest' : 'event',
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
      event_kind: 'contest',
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
  return decodeHtml(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function validRange(year, month, startDay, endDay) {
  const start = new Date(Date.UTC(year, month, startDay, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, endDay, 23, 59, 59));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month || end.getUTCMonth() !== month || end < start) return null;
  const now = Date.now();
  if (end.getTime() < now - 30 * 86400000 || start.getTime() > now + 400 * 86400000) return null;
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function make11mEvent({ id, title, description, organizer, sourceUrl, sourceName, startAt, endAt, rulesUrl, eventKind = 'event' }) {
  return {
    external_id: id.slice(0, 240),
    event_kind: eventKind,
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

function normalizeDateRange(startYear, startMonth, startDay, endYear, endMonth, endDay) {
  const start = new Date(Date.UTC(startYear, startMonth, startDay, 0, 0, 0));
  const end = new Date(Date.UTC(endYear, endMonth, endDay, 23, 59, 59));
  if (start.getUTCFullYear() !== startYear || start.getUTCMonth() !== startMonth || end.getUTCFullYear() !== endYear || end.getUTCMonth() !== endMonth || end < start) return null;
  const now = Date.now();
  if (end.getTime() < now - 30 * 86400000 || start.getTime() > now + 400 * 86400000) return null;
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function parseIsoRange(text) {
  const m = text.match(/(20\d{2})-(\d{2})-(\d{2})\s*(?:to|–|—|-)\s*(20\d{2})-(\d{2})-(\d{2})/i);
  if (!m) return null;
  return normalizeDateRange(Number(m[1]), Number(m[2])-1, Number(m[3]), Number(m[4]), Number(m[5])-1, Number(m[6]));
}

function parseNumericRange(text) {
  const m = text.match(/(?:start(?:\s+date)?\s*:?\s*)?(\d{1,2})[./](\d{1,2})[./](20\d{2})\s*(?:to|a|–|—|-)\s*(?:end(?:\s+date)?\s*:?\s*)?(\d{1,2})[./](\d{1,2})[./](20\d{2})/i);
  if (!m) return null;
  return normalizeDateRange(Number(m[3]), Number(m[2])-1, Number(m[1]), Number(m[6]), Number(m[5])-1, Number(m[4]));
}

function parseEnglishRange(text) {
  const m = text.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})\s*(?:→|to|–|—|-)\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})/i);
  if (!m) return null;
  const month1 = EN_MONTHS[m[2].toLowerCase()];
  const month2 = EN_MONTHS[m[5].toLowerCase()];
  if (month1 === undefined || month2 === undefined) return null;
  return normalizeDateRange(Number(m[3]), month1, Number(m[1]), Number(m[6]), month2, Number(m[4]));
}

function parseLongEnglishWeekend(text) {
  const m = text.match(/(?:Saturday|Sat\.?)[, ]+([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})[^.]{0,80}?(?:Sunday|Sun\.?)[, ]+([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})/i);
  if (!m) return null;
  const month1 = EN_MONTHS[m[1].toLowerCase()];
  const month2 = EN_MONTHS[m[4].toLowerCase()];
  if (month1 === undefined || month2 === undefined) return null;
  return normalizeDateRange(Number(m[3]), month1, Number(m[2]), Number(m[6]), month2, Number(m[5]));
}

function eventBlocks(html) {
  const blocks = [...String(html || '').matchAll(/<(?:article|tr|li|section)\b[^>]*>([\s\S]*?)<\/(?:article|tr|li|section)>/gi)].map(m => m[1]);
  return blocks.length ? blocks : [String(html || '')];
}

function parseRomeoCharlieContests(html) {
  const rows = [];
  for (const block of eventBlocks(html)) {
    const text = plainText(block);
    const m = text.match(/(.{3,180}?)\s+(20\d{2}-\d{2}-\d{2})\s+to\s+(20\d{2}-\d{2}-\d{2})/i);
    if (!m) continue;
    const range = parseIsoRange(m[2] + ' to ' + m[3]);
    if (!range) continue;
    const title = m[1].replace(/^\W+/, '').trim();
    if (!title || /QRZ|Station|Dates|Status/i.test(title)) continue;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0,90);
    rows.push(make11mEvent({
      id: 'romeo-charlie-contest:' + slug + ':' + range.start_at.slice(0,10),
      title,
      description: 'Concurso o trofeo publicado en el calendario oficial de Romeo Charlie. Consultá las reglas y la vigencia en la página original.',
      organizer: 'Romeo Charlie DX Group',
      sourceUrl: RC_CONTESTS_URL,
      sourceName: 'Romeo Charlie · concursos y trofeos oficiales',
      eventKind: 'contest',
      startAt: range.start_at,
      endAt: range.end_at,
    }));
  }
  return rows;
}

function parseRomeoCharlie(html) {
  const rows = [];
  for (const block of eventBlocks(html)) {
    const text = plainText(block);
    const m = text.match(/([A-Z0-9]+RC\/[A-Z0-9-]+)\s+([A-Z]+)\s*:\s*([^0-9]{3,90}?)\s+(20\d{2}-\d{2}-\d{2})\s+to\s+(20\d{2}-\d{2}-\d{2})/i);
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

function parseSugarDelta(html, sourceUrl, sourceName, eventKind = 'event') {
  const rows = [];
  for (const block of eventBlocks(html)) {
    const text = plainText(block);
    let range = parseIsoRange(text) || parseNumericRange(text) || parseEnglishRange(text) || parseLongEnglishWeekend(text);
    if (!range) continue;
    const title = text.slice(0, 180).trim();
    if (!title || title.length < 4) continue;
    const idPart = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 90);
    rows.push(make11mEvent({
      id: 'sugar-delta:' + idPart + ':' + range.start_at.slice(0,10),
      title: title.slice(0, 220),
      description: 'Actividad o concurso publicado por Sugar Delta. Consultá las bases oficiales para horarios, frecuencias, categorías y envío de logs.',
      organizer: 'Sugar Delta International DX Group',
      sourceUrl,
      sourceName,
      eventKind,
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
  const anchors = [...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const text = plainText(match[2]);
    let range = parseEnglishRange(text), dateText = '';
    if (!range) {
      const m = text.match(/(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s+([A-Za-z]{3,9})\s+(20\d{2})/i);
      if (m) {
        const month = EN_MONTHS[m[3].toLowerCase()];
        if (month !== undefined) { range = normalizeDateRange(Number(m[4]), month, Number(m[1]), Number(m[4]), month, Number(m[2])); dateText = m[0]; }
      }
    } else {
      dateText = (text.match(/\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}\s*(?:→|to|–|—|-)\s*\d{1,2}\s+[A-Za-z]{3,9}\s+20\d{2}/i) || [])[0] || '';
    }
    if (!range) continue;
    const title = (dateText ? text.replace(dateText, '') : text).replace(/^\s*[-:–—]+\s*/, '').trim();
    if (!title || title.length < 3) continue;
    let href;
    try { href = new URL(match[1], ALFA_TANGO_URL).toString(); } catch { continue; }
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0,90);
    rows.push(make11mEvent({
      id: 'alfa-tango:' + slug + ':' + range.start_at.slice(0,10),
      title: title.slice(0,220),
      description: 'Evento publicado en el calendario oficial de Alfa Tango. Consultá el enlace original para condiciones y detalles de participación.',
      organizer: 'Alfa Tango Worldwide DX Group',
      sourceUrl: ALFA_TANGO_URL,
      sourceName: 'Alfa Tango · calendario oficial',
      eventKind: /contest|sprint|award/i.test(title) ? 'contest' : 'event',
      startAt: range.start_at,
      endAt: range.end_at,
      rulesUrl: href,
    }));
  }
  return rows;
}


function parseUreContests(html) {
  const rows = [];
  const anchors = [...String(html || '').matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)];
  for (const match of anchors) {
    const title = plainText(match[2]).trim();
    if (!title || title.length < 3) continue;
    const before = plainText(String(html).slice(Math.max(0, match.index - 1400), match.index));
    const date = before.match(/(\d{1,2})(?:\s*al\s*(\d{1,2}))?\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})/i);
    if (!date) continue;
    const month = MONTHS[date[3].toLowerCase()];
    if (month === undefined) continue;
    const year = Number(date[4]), startDay = Number(date[1]), endDay = Number(date[2] || date[1]);
    const range = normalizeDateRange(year, month, startDay, year, month, endDay);
    if (!range) continue;
    const national = /nacional|ure|sufijos|fon[ií]a|invierno v-?uhf/i.test(title);
    const href = match[1].startsWith('http') ? match[1] : new URL(match[1], URE_CONTESTS_URL).toString();
    const slug = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 90);
    rows.push({
      external_id: 'ure-contest:' + slug + ':' + range.start_at.slice(0, 10),
      event_kind: 'contest',
      title: title.slice(0, 220),
      description: 'Concurso incluido en el calendario público de la Unión de Radioaficionados Españoles. Consultá las bases oficiales del organizador para confirmar bandas, modos, horarios y elegibilidad.',
      event_scope: national ? 'national' : 'international',
      station_type: 'ham',
      country_code: national ? 'ES' : null,
      country_name: national ? 'España' : 'Internacional',
      organizer: 'Unión de Radioaficionados Españoles (URE) / organizador del concurso',
      start_at: range.start_at, end_at: range.end_at, timezone: 'UTC',
      rules_url: href, source_url: URE_CONTESTS_URL, source_name: 'URE · próximos concursos oficiales',
      image_url: null, status: 'published', verified: true, is_auto: true,
      source_updated_at: null, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
  }
  return [...new Map(rows.map(row => [row.external_id, row])).values()];
}



async function enrichUreNationalContestTimes(rows) {
  const monthIndex = (name) => MONTHS[String(name || '').toLowerCase()];
  return Promise.all(rows.map(async (row) => {
    if (row.event_scope !== 'national' || !row.rules_url || !/fon[ií]a|sufijos/i.test(row.title)) return row;
    try {
      const response = await fetchWithTimeout(row.rules_url, 'text/html');
      const content = plainText(await response.text());
      const match = content.match(/desde\s+las\s+(\d{3,4})\s+horas?\s+UTC\s+del\s+(?:s[aá]bado)\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(20\d{2})\s+hasta\s+las\s+(\d{3,4})\s+horas?\s+UTC\s+del\s+(?:domingo)\s+(\d{1,2})\s+de\s+([a-záéíóú]+)\s+(20\d{2})/i);
      if (!match) return row;
      const time = (value) => String(value).padStart(4, '0');
      const startTime = time(match[1]), endTime = time(match[5]);
      const startMonth = monthIndex(match[3]), endMonth = monthIndex(match[7]);
      if (startMonth === undefined || endMonth === undefined) return row;
      const start = new Date(Date.UTC(Number(match[4]), startMonth, Number(match[2]), Number(startTime.slice(0, 2)), Number(startTime.slice(2))));
      const end = new Date(Date.UTC(Number(match[8]), endMonth, Number(match[6]), Number(endTime.slice(0, 2)), Number(endTime.slice(2))));
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return row;
      return { ...row, start_at: start.toISOString(), end_at: end.toISOString() };
    } catch {
      return row;
    }
  }));
}

function parseRefCalendar(html, year) {
  const rows = [];
  const tableRows = [...String(html || '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const parseDateTime = (value, isEnd) => {
    const match = String(value || '').match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})(?:\s+(\d{1,2}):(\d{2}))?/);
    if (!match) return null;
    const day = Number(match[1]), month = Number(match[2]) - 1, y = Number(match[3]);
    const hour = match[4] === undefined ? (isEnd ? 23 : 0) : Number(match[4]);
    const minute = match[5] === undefined ? (isEnd ? 59 : 0) : Number(match[5]);
    const date = new Date(Date.UTC(y, month, day, hour, minute, isEnd ? 59 : 0));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== month || date.getUTCDate() !== day) return null;
    return date.toISOString();
  };
  for (const row of tableRows) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => cell[1]);
    if (cells.length < 3) continue;
    const title = plainText(cells[0]);
    if (!title || /^concours$/i.test(title)) continue;
    const startAt = parseDateTime(plainText(cells[1]), false);
    const endAt = parseDateTime(plainText(cells[2]), true);
    if (!startAt || !endAt || new Date(endAt) < new Date(startAt)) continue;
    const startMs = new Date(startAt).getTime();
    if (startMs < Date.now() - 30 * 86400000 || startMs > Date.now() + 400 * 86400000) continue;
    // Les épreuves IARU sont régionales/internationales; les autres lignes du calendrier REF sont nationales françaises.
    const international = /\bIARU\b/i.test(title);
    const slug = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
    const linkMatch = String(cells[5] || cells[0]).match(/href=["']([^"']+)["']/i);
    let rulesUrl = null;
    if (linkMatch) {
      try { rulesUrl = new URL(linkMatch[1], 'https://concours.r-e-f.org/').toString(); } catch { /* optional */ }
    }
    rows.push({
      external_id: 'ref-calendar:' + slug + ':' + startAt.slice(0, 10),
      event_kind: 'contest',
      title: title.slice(0, 220),
      description: 'Concurso publicado en el calendario oficial de la Commission des concours del Réseau des Émetteurs Français. Los horarios están expresados en UTC; consultá el reglamento oficial para categorías y condiciones.',
      event_scope: international ? 'international' : 'national',
      station_type: 'ham',
      country_code: international ? null : 'FR',
      country_name: international ? 'Internacional' : 'Francia',
      organizer: 'Réseau des Émetteurs Français (REF) · Commission des concours',
      start_at: startAt,
      end_at: endAt,
      timezone: 'UTC',
      rules_url: rulesUrl,
      source_url: REF_CALENDAR_URL + year,
      source_name: 'REF · calendario oficial de concursos',
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

function parseDaRcXmas(html) {
  const text = plainText(html);
  const startMatch = text.match(/(?:Starts?|Inicio|Comienza)\s*:\s*(\d{1,2})\s+(?:de\s+)?([A-Za-zÁÉÍÓÚáéíóú]+)\s+(?:de\s+)?(20\d{2})(?:\s+(\d{1,2}):(\d{2})\s*UTC)?/i);
  const endMatch = text.match(/(?:Ends?|Final|Termina)\s*:\s*(\d{1,2})\s+(?:de\s+)?([A-Za-zÁÉÍÓÚáéíóú]+)\s+(?:de\s+)?(20\d{2})(?:\s+(\d{1,2}):(\d{2})\s*UTC)?/i);
  if (!startMatch || !endMatch) return [];
  const monthIndex = (name) => EN_MONTHS[name.toLowerCase()] ?? MONTHS[name.toLowerCase()] ?? (name.toLowerCase() === 'diecembre' ? 11 : undefined);
  const sm = monthIndex(startMatch[2]), em = monthIndex(endMatch[2]);
  if (sm === undefined || em === undefined) return [];
  const start = new Date(Date.UTC(Number(startMatch[3]), sm, Number(startMatch[1]), Number(startMatch[4] || 0), Number(startMatch[5] || 0), 0));
  const end = new Date(Date.UTC(Number(endMatch[3]), em, Number(endMatch[1]), Number(endMatch[4] || 23), Number(endMatch[5] || 59), 0));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end < start ||
      start.getUTCFullYear() !== Number(startMatch[3]) || start.getUTCMonth() !== sm ||
      end.getUTCFullYear() !== Number(endMatch[3]) || end.getUTCMonth() !== em) return [];
  const range = { start_at: start.toISOString(), end_at: end.toISOString() };
  const year = range.start_at.slice(0, 4);
  return [{
    external_id: 'da-rc-xmas:' + range.start_at.slice(0, 10), event_kind: 'contest',
    title: 'DA-RC Christmas Contest ' + year,
    description: 'Concurso internacional de 11 metros organizado por Dx Adventure Radio Club Delta-Alfa. Horario publicado por la organización en UTC. La web oficial ofrece bases, activadores y seguimiento de clasificaciones.',
    event_scope: 'international', station_type: '11m', country_code: null, country_name: 'Internacional',
    organizer: 'Dx Adventure Radio Club Delta-Alfa', start_at: range.start_at, end_at: range.end_at, timezone: 'UTC',
    rules_url: 'https://da-rcxmas.org/es/', source_url: 'https://da-rcxmas.org/es/', source_name: 'DA-RC Xmas Contest · sitio oficial',
    image_url: null, status: 'published', verified: true, is_auto: true, source_updated_at: null,
    last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }];
}

function parseRcqslChristmasTrophy(html) {
  const text = plainText(html);
  const dateMatch = text.match(/(?:Date|Fechas?)\s*:\s*(\d{1,2})(?:st|nd|rd|th)?\s*(?:to|al|[-–—])\s*(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-zÁÉÍÓÚáéíóú]+)\s+(20\d{2})/i);
  if (!dateMatch) return [];
  const monthName = dateMatch[3].toLowerCase();
  const month = EN_MONTHS[monthName] ?? MONTHS[monthName] ?? (monthName === 'diecembre' ? 11 : undefined);
  if (month === undefined) return [];
  const range = normalizeDateRange(Number(dateMatch[4]), month, Number(dateMatch[1]), Number(dateMatch[4]), month, Number(dateMatch[2]));
  if (!range) return [];
  const modes = (text.match(/QSO valid only in\s+([^*.]{2,100})/i) || [])[1] || 'SSB, AM y FM';
  return [{
    external_id: 'rcqsl-news-62:' + range.start_at.slice(0, 10),
    event_kind: 'contest',
    title: 'Trofeo Navidad RC 2026',
    description: 'Trofeo internacional de 11 metros abierto a operadores RC y no RC. Cazadores: 1 punto por estación RC/SC contactada. Activadores: 1 punto por estación en el log y cada DXCC cuenta como multiplicador. Modos válidos: ' + modes.trim() + '. La clasificación se actualiza al cargar los logs de activadores y se emite eQSL por cada contacto con estaciones activadoras.',
    event_scope: 'international',
    station_type: '11m',
    country_code: null,
    country_name: 'Internacional',
    organizer: 'Romeo Charlie HQ · Romeo Charlie DX Group',
    start_at: range.start_at,
    end_at: range.end_at,
    timezone: 'UTC',
    rules_url: RCQSL_TROPHY_URL,
    source_url: RCQSL_TROPHY_URL,
    source_name: 'RCQSL · Reglamento oficial del Trofeo Navidad RC 2026',
    image_url: null,
    status: 'published',
    verified: true,
    is_auto: true,
    source_updated_at: null,
    last_seen_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }];
}

function parseLu4aaoActivities(html) {
  const blocks = String(html || '').split(/<hr\b[^>]*>|(?:\*\s*){4,}\*/gi);
  const rows = [];
  for (const block of blocks) {
    const text = plainText(block);
    if (!text || text.length < 20) continue;
    let dateMatch = text.match(/(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(20\d{2})\s+al\s+(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(20\d{2})/i);
    let range = null;
    let matchedDate = '';
    if (dateMatch) {
      const monthStart = MONTHS[dateMatch[2].toLowerCase()];
      const monthEnd = MONTHS[dateMatch[5].toLowerCase()];
      if (monthStart !== undefined && monthEnd !== undefined) {
        range = normalizeDateRange(Number(dateMatch[3]), monthStart, Number(dateMatch[1]), Number(dateMatch[6]), monthEnd, Number(dateMatch[4]));
        matchedDate = dateMatch[0];
      }
    }
    if (!range) {
      dateMatch = text.match(/(\d{1,2})\s*(?:al|a)\s*(?:[A-Za-zÁÉÍÓÚáéíóú]+\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})/i);
      if (dateMatch) {
        const month = MONTHS[dateMatch[3].toLowerCase()];
        if (month !== undefined) {
          const startDay = Number(dateMatch[1]);
          const endDay = Number(dateMatch[2]);
          const year = Number(dateMatch[4]);
          let startMonth = month;
          let startYear = year;
          if (endDay < startDay) {
            startMonth -= 1;
            if (startMonth < 0) { startMonth = 11; startYear -= 1; }
          }
          range = normalizeDateRange(startYear, startMonth, startDay, year, month, endDay);
          matchedDate = dateMatch[0];
        }
      }
    }
    if (!range) {
      dateMatch = text.match(/(?:hasta el\s+)?(?:[A-Za-zÁÉÍÓÚáéíóú]+\s+)?(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\s+(?:de\s+)?(20\d{2})/i);
      if (dateMatch) {
        const month = MONTHS[dateMatch[2].toLowerCase()];
        if (month !== undefined) {
          range = normalizeDateRange(Number(dateMatch[3]), month, Number(dateMatch[1]), Number(dateMatch[3]), month, Number(dateMatch[1]));
          matchedDate = dateMatch[0];
        }
      }
    }
    if (!range) continue;
    let title = text.replace(matchedDate, '').replace(/^\s*[:–—-]\s*/, '').trim();
    title = title.replace(/[.\s]+$/, '').slice(0, 220);
    if (title.length < 4 || /^actividades programadas|^actualización\b/i.test(title)) continue;
    const slug = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
    const link = block.match(/href=["']([^"']+)["']/i);
    let rulesUrl = LU4AAO_PROGRAMMED_URL;
    if (link?.[1]) { try { rulesUrl = new URL(link[1], LU4AAO_PROGRAMMED_URL).toString(); } catch { /* Keep the calendar link. */ } }
    const isLu1aas = /\bLU1AAS\b/i.test(title);
    const organizer = isLu1aas && /prefectura/i.test(title) ? 'Prefectura Naval Argentina · LU1AAS'
      : ((title.match(/Radio Club [^,.;]{2,90}/i) || [])[0] || (isLu1aas ? 'LU1AAS · Prefectura Naval Argentina' : 'Radio Club / grupo organizador'));
    const isArgentina = /\b(?:LU|LW|AY|AZ|LP|LQ)\d[A-Z0-9/]*\b|Argentina|argentino|argentina|Buenos Aires|La Rioja|Entre R[ií]os|Chajar[ií]|Mor[oó]n/i.test(text);
    rows.push({
      external_id: 'lu4aao-programmed:' + slug + ':' + range.start_at.slice(0, 10),
      event_kind: /concurso|contest|trofeo/i.test(title) ? 'contest' : 'event',
      title,
      description: text.slice(0, 5000) + '\n\nCalendario recopilado por LU4AAO a partir de información de las entidades organizadoras. Confirmá posibles cambios en la publicación original.',
      event_scope: isArgentina ? 'national' : 'international', station_type: 'ham', country_code: isArgentina ? 'AR' : null, country_name: isArgentina ? 'Argentina' : 'Internacional', organizer,
      start_at: range.start_at, end_at: range.end_at, timezone: 'UTC', rules_url: rulesUrl,
      source_url: LU4AAO_PROGRAMMED_URL, source_name: 'LU4AAO · actividades programadas de radioclubes argentinos',
      image_url: null, status: 'published', verified: false, is_auto: true,
      source_updated_at: null, last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
  }
  return [...new Map(rows.map(row => [row.external_id, row])).values()];
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
    event_kind: 'contest',
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
  const finishedAt = new Date().toISOString();
  await supabase.from('radio_event_sources').update({
    last_checked_at: finishedAt,
    ...(status === 'success' ? { last_success_at: finishedAt, last_error: null } : { last_error: String(errorMessage || 'La fuente no pudo actualizarse completamente.').slice(0, 500) }),
  }).eq('source_key', sourceKey);
}

async function upsertRows(supabase, sourceKey, rows) {
  if (!rows.length) {
    await recordRun(supabase, sourceKey, 'partial', 0, 0, 'La fuente respondió, pero no se detectaron eventos con fechas válidas; se conserva la última información publicada.', { received: 0 });
    return { inserted: 0, updated: 0, received: 0 };
  }
  let inserted = 0;
  let updated = 0;
  // Keep each PostgREST write small enough for large calendars such as ContestClock.
  for (let offset = 0; offset < rows.length; offset += 100) {
    const batch = rows.slice(offset, offset + 100);
    const ids = batch.map((row) => row.external_id);
    const { data: existing, error: lookupError } = await supabase.from('radio_events').select('external_id').in('external_id', ids);
    if (lookupError) throw lookupError;
    const oldIds = new Set((existing || []).map((row) => row.external_id));
    const { error } = await supabase.from('radio_events').upsert(batch, { onConflict: 'external_id' });
    if (error) throw error;
    const batchInserted = batch.filter((row) => !oldIds.has(row.external_id)).length;
    inserted += batchInserted;
    updated += batch.length - batchInserted;
  }
  await recordRun(supabase, sourceKey, 'success', inserted, updated, null, { received: rows.length, batches: Math.ceil(rows.length / 100) });
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
          // ContestClock publica el catálogo anual mediante ?year=YYYY. El rango
          // from/to no es un parámetro admitido y provocaba HTTP 400.
          const currentPayload = await fetchJsonWithTimeout(CONTESTCLOCK_API + '?year=' + currentYear);
          // El calendario siguiente puede no estar publicado todavía. Su ausencia
          // no debe bloquear la importación del año vigente.
          let nextPayload = null;
          try { nextPayload = await fetchJsonWithTimeout(CONTESTCLOCK_API + '?year=' + (currentYear + 1)); }
          catch (nextYearError) { console.warn('[Eventos] ContestClock aún no ofrece el año siguiente:', nextYearError?.message || nextYearError); }
          const rows = [...contestClockRows(currentPayload), ...contestClockRows(nextPayload)];
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'romeo-charlie-11m') {
          const [activationsResponse, contestsResponse] = await Promise.all([
            fetchWithTimeout(RC_ACTIVATIONS_URL, 'text/html'),
            fetchWithTimeout(RC_CONTESTS_URL, 'text/html'),
          ]);
          const rows = [
            ...parseRomeoCharlie(await activationsResponse.text()),
            ...parseRomeoCharlieContests(await contestsResponse.text()),
          ];
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'sugar-delta-11m') {
          const [contestsResponse, activationsResponse] = await Promise.all([
            fetchWithTimeout(SUGAR_CONTESTS_URL, 'text/html'),
            fetchWithTimeout(SUGAR_ACTIVATIONS_URL, 'text/html'),
          ]);
          const rows = [
            ...parseSugarDelta(await contestsResponse.text(), SUGAR_CONTESTS_URL, 'Sugar Delta · concursos oficiales', 'contest'),
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
        } else if (source.source_key === 'lu4aao-activities') {
          const response = await fetchWithTimeout(LU4AAO_PROGRAMMED_URL, 'text/html');
          const rows = parseLu4aaoActivities(await response.text());
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'ref-ham-contests') {
          const years = [new Date().getUTCFullYear(), new Date().getUTCFullYear() + 1];
          const pages = await Promise.all(years.map(async (year) => {
            const response = await fetchWithTimeout(REF_CALENDAR_URL + year, 'text/html');
            return parseRefCalendar(await response.text(), year);
          }));
          const rows = pages.flat();
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'ure-ham-contests') {
          const response = await fetchWithTimeout(URE_CONTESTS_URL, 'text/html');
          const parsedRows = parseUreContests(await response.text());
          const rows = await enrichUreNationalContestTimes(parsedRows);
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'da-rc-xmas-11m') {
          const response = await fetchWithTimeout(DA_RC_XMAS_URL, 'text/html');
          const rows = parseDaRcXmas(await response.text());
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'rcqsl-news-62') {
          const response = await fetchWithTimeout(RCQSL_TROPHY_URL, 'text/html');
          const rows = parseRcqslChristmasTrophy(await response.text());
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else if (source.source_key === 'cq-eleven-ww') {
          const response = await fetchWithTimeout(CQ11WW_URL, 'text/html');
          const html = await response.text();
          const event = parseCqEleven(html);
          const rows = event ? [event] : [];
          results.push({ source: source.source_key, ...(await upsertRows(supabase, source.source_key, rows)) });
        } else {
          await recordRun(supabase, source.source_key, 'error', 0, 0, 'No existe un adaptador para esta fuente.', {});
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
