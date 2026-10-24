// Public directory API for LogBook eQSL Express.
// The Supabase service-role key must remain server-side in Vercel environment variables.
const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const validEmail = (v) => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(v || '').trim());
const cleanCall = (v) => String(v || '').trim().toUpperCase();
const cleanText = (v, max) => String(v || '').trim().slice(0, max);

async function db(path, init = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('DIRECTORY_NOT_CONFIGURED');
  const response = await fetch(`${base.replace(/\/$/, '')}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const responseText = await response.text();
  if (!response.ok) throw new Error(`DIRECTORY_DB_ERROR_${response.status}: ${responseText.slice(0, 200)}`);
  return responseText ? JSON.parse(responseText) : [];
}

const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'GET') {
    const action = String(req.query?.action || '');
    try {
      if (action === 'lookup') {
        const call = cleanCall(req.query?.call);
        if (!CALL_RE.test(call)) return json(res, 400, { error: 'Indicativo no válido' });
        const rows = await db(
          `eqsl_directory?select=callsign,email,whatsapp,telegram,country,grid&callsign=eq.${encodeURIComponent(call)}&contact_public=eq.true&limit=1`
        );
        return json(res, 200, { contact: rows[0] || null });
      }

      if (action === 'count') {
        const rows = await db('rpc/get_eqsl_directory_stats', { method: 'POST', body: '{}' });
        const stats = Array.isArray(rows) ? rows[0] : rows;
        return json(res, 200, {
          activeUsers: Number(stats?.active_users || 0),
          totalActions: Number(stats?.total_actions || 0),
        });
      }
      return json(res, 400, { error: 'Acción no válida' });
    } catch (error) {
      const notConfigured = String(error?.message || '').includes('DIRECTORY_NOT_CONFIGURED');
      return json(res, notConfigured ? 503 : 500, {
        error: notConfigured ? 'Directorio mundial aún no configurado' : 'No se pudo consultar el directorio',
      });
    }
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Método no permitido' });
  }

  try {
    const body = req.body || {};
    const call = cleanCall(body.callsign);
    if (!CALL_RE.test(call)) return json(res, 400, { error: 'Indicativo no válido' });

    if (body.action === 'activity') {
      // Atomic DB function avoids lost counts during simultaneous eQSL actions.
      await db('rpc/record_eqsl_activity', {
        method: 'POST',
        body: JSON.stringify({ p_callsign: call }),
      });
      return json(res, 200, { ok: true });
    }

    if (body.action === 'contact') {
      // Publication is opt-in; the UI must collect this consent from the station owner,
      // never from someone entering a correspondent's contact details.
      if (body.consent !== true) {
        return json(res, 400, { error: 'Se requiere autorización explícita para publicar los datos de esta estación' });
      }

      const email = cleanText(body.email, 254);
      const whatsapp = String(body.whatsapp || '').replace(/[^0-9]/g, '').slice(0, 15);
      const telegram = cleanText(body.telegram, 32).replace(/^@+/, '').replace(/[^A-Za-z0-9_]/g, '');
      const country = cleanText(body.country, 100);
      const grid = cleanText(body.grid, 12).toUpperCase();

      if (email && !validEmail(email)) return json(res, 400, { error: 'Correo no válido' });
      if (whatsapp && (whatsapp.length < 7 || whatsapp.length > 15)) {
        return json(res, 400, { error: 'WhatsApp debe incluir el código internacional y entre 7 y 15 dígitos' });
      }
      if (telegram && !/^[A-Za-z0-9_]{5,32}$/.test(telegram)) {
        return json(res, 400, { error: 'Usuario de Telegram no válido' });
      }
      if (!email && !whatsapp && !telegram) {
        return json(res, 400, { error: 'Ingresá al menos un contacto que quieras publicar' });
      }

      await db('rpc/publish_eqsl_contact', {
        method: 'POST',
        body: JSON.stringify({
          p_callsign: call,
          p_email: email || null,
          p_whatsapp: whatsapp || null,
          p_telegram: telegram || null,
          p_country: country || null,
          p_grid: grid || null,
        }),
      });
      return json(res, 200, { ok: true, callsign: call });
    }

    return json(res, 400, { error: 'Acción no válida' });
  } catch (error) {
    const message = String(error?.message || '');
    const notConfigured = message.includes('DIRECTORY_NOT_CONFIGURED');
    const invalid = message.includes('INVALID_CALLSIGN');
    return json(res, notConfigured ? 503 : invalid ? 400 : 500, {
      error: notConfigured
        ? 'Directorio mundial aún no configurado'
        : invalid
          ? 'Indicativo no válido'
          : 'No se pudo actualizar el directorio',
    });
  }
}
