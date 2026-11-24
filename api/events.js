import { createClient } from '@supabase/supabase-js';
import { createHmac, timingSafeEqual } from 'node:crypto';

const json = (res, status, body) => res.status(status).json(body);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function config() {
  const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
  if (!url || !key) throw new Error('EVENTS_NOT_CONFIGURED');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value));
    return ['https:', 'http:'].includes(url.protocol) ? url.toString() : null;
  } catch { return null; }
}

function shareSignature(id, secret) {
  return createHmac('sha256', secret).update('logbook-radio-event-share:' + id).digest('base64url');
}

function verifyShareToken(token, secret) {
  const [id, supplied, extra] = String(token || '').split('.');
  if (extra || !UUID_RE.test(id || '') || !supplied) return null;
  const expected = Buffer.from(shareSignature(id, secret));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return id;
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

const SHARE_LANGUAGES = new Set(['es','en','pt','pt-br','fr','de','it','nl','pl','ru','uk','zh','ja','ko','ar','hi','tr','sv','no','da','fi','cs','el','ro','hu','id','th']);
function normalizeShareLanguage(value) {
  const raw = String(value || 'es').toLowerCase().replace('_', '-');
  return SHARE_LANGUAGES.has(raw) ? raw : (SHARE_LANGUAGES.has(raw.split('-')[0]) ? raw.split('-')[0] : 'es');
}
function renderSharedEvent(event, requestedLanguage = 'es') {
  const language = normalizeShareLanguage(requestedLanguage);
  const english = language === 'en';
  const locale = language === 'pt-br' ? 'pt-BR' : language;
  const copy = english ? {
    invalid: 'Invalid link', unavailable: 'This publication is no longer available',
    pending: 'Date pending official publication', confirmed: 'Date to be confirmed',
    contest: 'Contest', event: 'Event', national: 'National', international: 'International',
    ham: 'Amateur radio', eleven: '11 meters', both: 'Both modes',
    official: 'View official rules / announcement ↗', noOfficial: 'The organizer has not published an official link yet.',
    verified: 'verified source', source: 'Source', welcome: 'Discover LogBook eQSL EXPRESS',
    intro: 'This link lets you view the shared publication. Sign in or register to access the full calendar and all other app features.',
    enter: 'Sign in or register', country: 'International',
  } : {
    invalid: 'Enlace no válido', unavailable: 'Esta publicación ya no está disponible',
    pending: 'Fecha pendiente de publicación oficial', confirmed: 'Fecha por confirmar',
    contest: 'Concurso', event: 'Evento', national: 'Nacional', international: 'Internacional',
    ham: 'Radioafición', eleven: '11 metros', both: 'Ambas modalidades',
    official: 'Consultar bases / publicación oficial ↗', noOfficial: 'El organizador todavía no publicó un enlace oficial.',
    verified: 'fuente verificada', source: 'Fuente', welcome: 'Descubrí LogBook eQSL EXPRESS',
    intro: 'Este enlace permite consultar solamente la publicación compartida. Registrate para acceder a la agenda completa y a las demás funciones de la aplicación.',
    enter: 'Registrarme o entrar a la aplicación', country: 'Internacional',
  };
  const date = event.start_at ? new Date(event.start_at) : null;
  const dateText = date && !Number.isNaN(date.getTime())
    ? date.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC'
    : copy.pending;
  const endDate = event.end_at ? new Date(event.end_at) : null;
  const endText = endDate && !Number.isNaN(endDate.getTime())
    ? ' — ' + endDate.toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC' : '';
  const official = [event.rules_url, event.source_url].map(safeUrl).find((url) => url && url.startsWith('https://'));
  const officialLink = official
    ? '<a class="official" href="' + escapeHtml(official) + '" target="_blank" rel="noopener noreferrer">' + copy.official + '</a>'
    : '<p class="muted">' + copy.noOfficial + '</p>';
  const type = event.event_kind === 'contest' ? copy.contest : copy.event;
  const station = event.station_type === '11m' ? copy.eleven : event.station_type === 'both' ? copy.both : copy.ham;
  const country = event.country_name || event.country_code || (event.event_scope === 'international' ? copy.country : '');
  const title = event.title || (english ? copy.invalid : copy.invalid);
  return '<!doctype html><html lang="' + escapeHtml(language) + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>' + escapeHtml(title) + ' · LogBook eQSL EXPRESS</title><style>*{box-sizing:border-box}body{margin:0;padding:28px 14px;background:linear-gradient(135deg,#e0f2fe,#fff,#cffafe);font:16px system-ui,sans-serif;color:#0f172a}.wrap{max-width:720px;margin:auto}.brand{text-align:center;margin:0 auto 20px;color:#fff;background:#083344;border-radius:999px;padding:11px 18px;width:max-content;max-width:100%;font-weight:900}.card,.invite{background:#fff;border:1px solid #cbd5e1;border-radius:18px;padding:22px;box-shadow:0 8px 24px #0f172a12}.pills{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}.pill{border-radius:30px;padding:5px 11px;background:#e0e7ff;color:#3730a3;font-size:12px;font-weight:800}h1{font-size:clamp(22px,5vw,32px);line-height:1.15;margin:0 0 12px}.muted{color:#64748b;font-size:14px}.description{white-space:pre-wrap;line-height:1.6;color:#334155;margin:18px 0}.official,.register{display:inline-block;margin-top:14px;padding:12px 16px;border-radius:9px;text-decoration:none;font-weight:800}.official{background:#155e75;color:#fff}.invite{margin-top:18px;text-align:center;border-color:#a5f3fc}.register{background:#059669;color:#fff}.source{border-top:1px solid #e2e8f0;margin-top:20px;padding-top:12px;color:#64748b;font-size:12px}</style></head><body><main class="wrap"><header class="brand">◉ LogBook eQSL EXPRESS</header><article class="card"><div class="pills"><span class="pill">' + type + '</span><span class="pill">' + escapeHtml(event.event_scope === 'national' ? copy.national : copy.international) + '</span><span class="pill">' + station + '</span></div><h1>' + escapeHtml(title) + '</h1><p class="muted">📅 ' + escapeHtml(dateText + endText) + '</p>' + (event.organizer || country ? '<p class="muted">' + escapeHtml([event.organizer, country].filter(Boolean).join(' · ')) + '</p>' : '') + (event.description ? '<p class="description">' + escapeHtml(event.description) + '</p>' : '') + officialLink + '<p class="source">' + copy.source + ': ' + escapeHtml(event.source_name || 'LogBook eQSL EXPRESS') + (event.verified ? ' · ' + copy.verified : '') + '</p></article><section class="invite"><h2>' + copy.welcome + '</h2><p class="muted">' + copy.intro + '</p><a class="register" href="/?lang=' + encodeURIComponent(language) + '">' + copy.enter + '</a></section></main></body></html>';
}

async function authorize(req, supabase) {
  const token = String(req.headers['x-identity-token'] || '').trim();
  const requestedCall = String(req.headers['x-callsign'] || '').trim().toUpperCase();
  if (!UUID_RE.test(token) || !/^[A-Z0-9][A-Z0-9/]{2,23}$/.test(requestedCall)) {
    return { error: { status: 401, message: 'Validá tu identificación para acceder a Eventos y Concursos.' } };
  }
  const { data: canonical, error: resolveError } = await supabase.rpc('resolve_community_callsign', { p_token: token });
  const rootCall = String(canonical || '').trim().toUpperCase();
  if (resolveError || !rootCall) return { error: { status: 401, message: 'La identificación de este dispositivo no está validada.' } };

  const { data: authorized, error: authError } = await supabase.rpc('community_identity_authorized', {
    p_callsign: requestedCall, p_token: token,
  });
  if (authError || authorized !== true) return { error: { status: 403, message: 'La identificación seleccionada no pertenece a esta cuenta.' } };

  const { data: blocked, error: blockedError } = await supabase.rpc('community_is_blocked', { p_callsign: rootCall });
  if (blockedError) return { error: { status: 503, message: 'No se pudo comprobar el acceso de esta identificación.' } };
  if (blocked === true) return { error: { status: 403, message: 'Esta identificación no tiene acceso a los servicios comunitarios.' } };

  const { data: role } = await supabase.rpc('community_actor_role', { p_callsign: rootCall, p_token: token });
  return { token, callsign: requestedCall, rootCall, isAdmin: role === 'admin' };
}

function sourceKeyForEvent(event) {
  if (!event?.is_auto) return null;
  let host = '';
  try { host = new URL(String(event.source_url || '')).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
  if (host === 'contestclock.com') return 'contestclock-ham';
  if (host === 'alfatango.org') return 'alfa-tango-11m';
  if (host === 'ure.es') return 'ure-ham-contests';
  if (host === 'concours.r-e-f.org') return 'ref-ham-contests';
  if (host === 'da-rcxmas.org') return 'da-rc-xmas-11m';
  if (host === 'lu4aa.org') return 'radio-club-argentina';
  if (host === 'lu4aao.org') return 'lu4aao-activities';
  if (host === 'cqww.com') return 'cqww-ham';
  if (host === 'cq11ww.org') return 'cq-eleven-ww';
  if (host === 'rcqsl.com') return 'romeo-charlie-11m';
  if (host === 'sugardelta.org') return 'sugar-delta-11m';
  if (host === 'ekdxgroup.com') return 'echo-kilo-11m';
  return null;
}

function normalizedEventTitle(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\b20\d{2}\b/g, '').replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}

function canonicalEventTitle(event) {
  const text = [event.title, event.organizer, event.source_name].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const aliases = [
    [/\byota\b|youngsters on the air|mes yota/, 'yota'],
    [/examen de ascenso/, 'examen-de-ascenso'],
    [/world radio day|dia mundial de la radio|journee mondiale de la radio|giornata mondiale della radio/, 'world-radio-day'],
    [/international marconi day|dia internacional de marconi|giornata internazionale di marconi|journee internationale marconi/, 'international-marconi-day'],
    [/cq world wide dx|\bcqww\b/, 'cq-world-wide-dx'],
    [/eleven world wide|cq eleven world wide/, 'eleven-world-wide'],
    [/santa award|premio santa/, 'santa-award'],
  ];
  for (const [pattern, canonical] of aliases) if (pattern.test(text)) return canonical;
  return normalizedEventTitle(event.title);
}

function eventDeduplicationKey(event) {
  const start = event.start_at ? new Date(event.start_at).toISOString().slice(0, 10) : 'no-date';
  const scope = [event.event_scope, event.station_type, event.event_kind, event.country_code || ''];
  if (/\byota\b/i.test([event.title, event.organizer, event.source_name].join(' '))) {
    return ['yota-month', ...scope, start.slice(0, 7)].join('|');
  }
  return [...scope, start, canonicalEventTitle(event)].join('|');
}
function deduplicateEvents(events) {
  const selected = new Map();
  for (const event of events || []) {
    const key = eventDeduplicationKey(event);
    const prior = selected.get(key);
    if (!prior) { selected.set(key, event); continue; }
    const score = (item) => (item.verified ? 4 : 0) +
      (item.rules_url ? 2 : 0) + (item.source_url ? 1 : 0) +
      (item.description ? Math.min(String(item.description).length / 1000, 1) : 0) +
      (/radio club argentino|radioaficionado argentino/i.test(String(item.organizer || '') + ' ' + String(item.source_name || '')) ? 3 : 0) +
      (/^mes yota$/i.test(String(item.title || '').trim()) ? 5 : 0);
    if (score(event) > score(prior)) selected.set(key, event);
  }
  return [...selected.values()];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  try {
    const { client: supabase, secret } = (() => {
      const url = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
      const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
      if (!url || !key) throw new Error('EVENTS_NOT_CONFIGURED');
      return { client: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }), secret: key };
    })();

    if (req.method === 'GET' && req.query?.share) {
      const sharedId = verifyShareToken(req.query.share, secret);
      if (!sharedId) return res.status(404).send(renderSharedEvent({ title: 'Enlace no válido', event_scope: 'international', event_kind: 'event', station_type: 'ham' }, req.query?.lang));
      const { data: sharedEvent, error: shareError } = await supabase.from('radio_events')
        .select('id,title,description,event_scope,event_kind,station_type,country_code,country_name,organizer,start_at,end_at,rules_url,source_url,source_name,verified')
        .eq('id', sharedId).eq('status', 'published').maybeSingle();
      if (shareError) throw shareError;
      if (!sharedEvent) return res.status(404).send(renderSharedEvent({ title: 'Esta publicación ya no está disponible', event_scope: 'international', event_kind: 'event', station_type: 'ham' }, req.query?.lang));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      return res.status(200).send(renderSharedEvent(sharedEvent, req.query?.lang));
    }

    const identity = await authorize(req, supabase);
    if (identity.error) return json(res, identity.error.status, { error: identity.error.message });

    if (req.method === 'GET') {
      const category = String(req.query?.category || 'national');
      const stationType = String(req.query?.station_type || 'ham');
      const eventKind = String(req.query?.event_kind || 'event');
      const country = String(req.query?.country || '').trim().toUpperCase();
      if (!['national', 'international'].includes(category) || !['ham', '11m'].includes(stationType) || !['event', 'contest'].includes(eventKind)) {
        return json(res, 400, { error: 'Filtro de categoría o modalidad no válido.' });
      }
      if (country && !/^[A-Z]{2}$/.test(country)) return json(res, 400, { error: 'Código de país no válido.' });
      let query = supabase.from('radio_events').select('*')
        .eq('status', 'published')
        .in('station_type', [stationType, 'both'])
        .eq('event_scope', category)
        .eq('event_kind', eventKind)
        .or('start_at.is.null,start_at.gte.' + new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() + ',end_at.gte.' + new Date().toISOString())
        .order('start_at', { ascending: true, nullsFirst: false })
        .limit(200);
      if (category === 'national') {
        if (!country) return json(res, 200, { events: [], countries: [], is_admin: identity.isAdmin, last_updated: null });
        query = query.eq('country_code', country);
      } else if (country) {
        query = query.eq('country_code', country);
      }
      const [{ data: events, error }, { data: countryRows, error: countryError }, { data: sourceRows, error: sourceError }] = await Promise.all([
        query,
        supabase.from('radio_events').select('country_code').eq('status', 'published').in('station_type', [stationType, 'both']).not('country_code', 'is', null).limit(1000),
        supabase.from('radio_event_sources').select('last_success_at').not('last_success_at', 'is', null).order('last_success_at', { ascending: false }).limit(1),
      ]);
      if (error || countryError || sourceError) throw error || countryError || sourceError;
      // A transient failure in today's sync must not hide events saved by the last good run.
      const visibleEvents = deduplicateEvents((events || []).filter((event) => !event.is_auto || Boolean(sourceKeyForEvent(event))));
      const countries = [...new Set((countryRows || []).map((row) => String(row.country_code || '').toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))].sort();
      return json(res, 200, {
        events: visibleEvents,
        countries,
        is_admin: identity.isAdmin,
        last_updated: sourceRows?.[0]?.last_success_at || null,
      });
    }

    if (req.method === 'POST') {
      const body = req.body || {};
      if (body.action === 'share') {
        const id = String(body.id || '').trim();
        if (!UUID_RE.test(id)) return json(res, 400, { error: 'Identificador de publicación no válido.' });
        const { data: event, error: eventError } = await supabase.from('radio_events').select('id').eq('id', id).eq('status', 'published').maybeSingle();
        if (eventError) throw eventError;
        if (!event) return json(res, 404, { error: 'La publicación ya no está disponible.' });
        return json(res, 200, { token: id + '.' + shareSignature(id, secret) });
      }
      if (!identity.isAdmin) return json(res, 403, { error: 'Solo el administrador puede publicar eventos.' });
      const title = String(body.title || '').trim().slice(0, 220);
      const scope = String(body.event_scope || '');
      const stationType = String(body.station_type || '');
      const eventKind = String(body.event_kind || 'event');
      const country = String(body.country_code || '').trim().toUpperCase();
      if (title.length < 3 || !['national', 'international'].includes(scope) || !['ham', '11m'].includes(stationType) || !['event', 'contest'].includes(eventKind)) {
        return json(res, 400, { error: 'Completá el título, la categoría y la modalidad del evento.' });
      }
      if (scope === 'national' && !/^[A-Z]{2}$/.test(country)) {
        return json(res, 400, { error: 'Un evento nacional necesita un código de país ISO de dos letras.' });
      }
      const startAt = body.start_at ? new Date(body.start_at) : null;
      const endAt = body.end_at ? new Date(body.end_at) : null;
      if ((startAt && Number.isNaN(startAt.getTime())) || (endAt && Number.isNaN(endAt.getTime())) || (startAt && endAt && endAt < startAt)) {
        return json(res, 400, { error: 'Revisá las fechas del evento.' });
      }
      const payload = {
        title,
        description: String(body.description || '').trim().slice(0, 5000) || null,
        event_scope: scope,
        event_kind: eventKind,
        station_type: stationType,
        country_code: scope === 'national' ? country : null,
        country_name: scope === 'national' ? String(body.country_name || country).slice(0, 100) : 'Internacional',
        organizer: String(body.organizer || '').trim().slice(0, 180) || null,
        start_at: startAt ? startAt.toISOString() : null,
        end_at: endAt ? endAt.toISOString() : null,
        rules_url: safeUrl(body.rules_url),
        source_url: safeUrl(body.rules_url),
        source_name: 'Publicación de administración · LogBook eQSL EXPRESS',
        image_url: safeUrl(body.image_url),
        status: 'published',
        verified: true,
        is_auto: false,
        created_by: identity.rootCall,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase.from('radio_events').insert(payload).select('*').single();
      if (error) throw error;
      return json(res, 201, { event: data });
    }

    if (req.method === 'DELETE') {
      if (!identity.isAdmin) return json(res, 403, { error: 'Solo el administrador puede borrar publicaciones.' });
      const id = String(req.query?.id || req.body?.id || '').trim();
      if (!UUID_RE.test(id)) return json(res, 400, { error: 'Identificador de evento no válido.' });
      const { error } = await supabase.from('radio_events').delete().eq('id', id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE');
    return json(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    console.error('[Eventos y concursos] Error:', error?.message || error);
    return json(res, 503, { error: 'La agenda no está disponible temporalmente. Volvé a intentarlo.' });
  }
}
