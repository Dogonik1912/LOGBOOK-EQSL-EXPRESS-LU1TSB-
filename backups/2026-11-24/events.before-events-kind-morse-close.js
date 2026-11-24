import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  try {
    const supabase = config();
    const identity = await authorize(req, supabase);
    if (identity.error) return json(res, identity.error.status, { error: identity.error.message });

    if (req.method === 'GET') {
      const category = String(req.query?.category || 'national');
      const stationType = String(req.query?.station_type || 'ham');
      const country = String(req.query?.country || '').trim().toUpperCase();
      if (!['national', 'international'].includes(category) || !['ham', '11m'].includes(stationType)) {
        return json(res, 400, { error: 'Filtro de categoría o modalidad no válido.' });
      }
      if (country && !/^[A-Z]{2}$/.test(country)) return json(res, 400, { error: 'Código de país no válido.' });
      let query = supabase.from('radio_events').select('*')
        .eq('status', 'published')
        .in('station_type', [stationType, 'both'])
        .eq('event_scope', category)
        .or('start_at.is.null,start_at.gte.' + new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
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
      const countries = [...new Set((countryRows || []).map((row) => String(row.country_code || '').toUpperCase()).filter((code) => /^[A-Z]{2}$/.test(code)))].sort();
      return json(res, 200, {
        events: events || [],
        countries,
        is_admin: identity.isAdmin,
        last_updated: sourceRows?.[0]?.last_success_at || null,
      });
    }

    if (req.method === 'POST') {
      if (!identity.isAdmin) return json(res, 403, { error: 'Solo el administrador puede publicar eventos.' });
      const body = req.body || {};
      const title = String(body.title || '').trim().slice(0, 220);
      const scope = String(body.event_scope || '');
      const stationType = String(body.station_type || '');
      const country = String(body.country_code || '').trim().toUpperCase();
      if (title.length < 3 || !['national', 'international'].includes(scope) || !['ham', '11m'].includes(stationType)) {
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
