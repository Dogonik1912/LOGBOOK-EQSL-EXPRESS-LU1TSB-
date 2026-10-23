// Public directory API for LogBook eQSL Express.
// Configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in Vercel before global storage is active.
const CALL_RE = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/;
const validEmail = (v) => /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(String(v || '').trim());
const cleanCall = (v) => String(v || '').trim().toUpperCase();

async function db(path, init = {}) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) throw new Error('DIRECTORY_NOT_CONFIGURED');
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`DIRECTORY_DB_ERROR_${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'GET') {
    const action = String(req.query?.action || '');
    try {
      if (action === 'lookup') {
        const call = cleanCall(req.query?.call);
        if (!CALL_RE.test(call)) return res.status(400).json({ error: 'Indicativo no válido' });
        const rows = await db(`eqsl_directory?select=callsign,email,whatsapp,country,grid&callsign=eq.${encodeURIComponent(call)}&contact_public=eq.true&limit=1`);
        return res.status(200).json({ contact: rows[0] || null });
      }
      if (action === 'count') {
        const rows = await db('eqsl_directory?select=callsign&activity_count=gt.0');
        return res.status(200).json({ activeUsers: new Set(rows.map(r => r.callsign)).size });
      }
      return res.status(400).json({ error: 'Acción no válida' });
    } catch (error) {
      const notConfigured = String(error?.message || '').includes('DIRECTORY_NOT_CONFIGURED');
      return res.status(notConfigured ? 503 : 500).json({ error: notConfigured ? 'Directorio global aún no configurado' : 'No se pudo consultar el directorio' });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const body = req.body || {};
    const call = cleanCall(body.callsign);
    if (!CALL_RE.test(call)) return res.status(400).json({ error: 'Indicativo no válido' });
    const now = new Date().toISOString();
    if (body.action === 'activity') {
      // Increment only for an explicit eQSL action; one row per unique station keeps the user count deduplicated.
      const existing = await db(`eqsl_directory?select=callsign,activity_count&callsign=eq.${encodeURIComponent(call)}&limit=1`);
      if (existing.length) {
        await db(`eqsl_directory?callsign=eq.${encodeURIComponent(call)}`, {
          method: 'PATCH',
          body: JSON.stringify({ activity_count: Number(existing[0].activity_count || 0) + 1, last_activity_at: now }),
        });
      } else {
        await db('eqsl_directory', {
          method: 'POST',
          body: JSON.stringify({ callsign: call, activity_count: 1, last_activity_at: now, contact_public: false }),
        });
      }
      return res.status(200).json({ ok: true });
    }
    if (body.action === 'contact') {
      if (body.consent !== true) return res.status(400).json({ error: 'Se requiere autorización para publicar datos de contacto' });
      const email = String(body.email || '').trim();
      const whatsapp = String(body.whatsapp || '').replace(/[^0-9]/g, '');
      const country = String(body.country || '').trim().slice(0, 100);
      const grid = String(body.grid || '').trim().toUpperCase().slice(0, 12);
      if (email && !validEmail(email)) return res.status(400).json({ error: 'Correo no válido' });
      if (!email && !whatsapp) return res.status(400).json({ error: 'Falta correo o WhatsApp' });
      const existing = await db(`eqsl_directory?select=callsign&callsign=eq.${encodeURIComponent(call)}&limit=1`);
      const data = { callsign: call, email: email || null, whatsapp: whatsapp || null, country, grid, contact_public: true, contact_updated_at: now };
      if (existing.length) await db(`eqsl_directory?callsign=eq.${encodeURIComponent(call)}`, { method: 'PATCH', body: JSON.stringify(data) });
      else await db('eqsl_directory', { method: 'POST', body: JSON.stringify({ ...data, activity_count: 0 }) });
      return res.status(200).json({ ok: true });
    }
    return res.status(400).json({ error: 'Acción no válida' });
  } catch (error) {
    const notConfigured = String(error?.message || '').includes('DIRECTORY_NOT_CONFIGURED');
    return res.status(notConfigured ? 503 : 500).json({ error: notConfigured ? 'Directorio global aún no configurado' : 'No se pudo actualizar el directorio' });
  }
}
