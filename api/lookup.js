export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const call = String(body.call || '').trim().toUpperCase();
  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');
  if (!/^[A-Z0-9/]{3,20}$/.test(call)) return res.status(400).json({ error: 'Indicativo no válido' });
  if (!user || !pass) return res.status(200).json({ callsign: call, name: '', email: '', whatsapp: '', whatsappRaw: '', country: '', grid: '', source: 'qrz' });
  const field = (xml, name) => {
    const m = xml.match(new RegExp('<' + name + '>([\\s\\S]*?)</' + name + '>', 'i'));
    return m ? m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').trim() : '';
  };
  try {
    const login = new URLSearchParams({ username: user, password: pass, agent: 'LOGBOOK-EQSL-EXPRESS-LU1TSB/1.0' });
    const auth = await fetch('https://xmldata.qrz.com/xml/current/?' + login.toString());
    if (!auth.ok) return res.status(502).json({ error: 'QRZ no respondió al iniciar sesión' });
    const session = field(await auth.text(), 'Key');
    if (!session) return res.status(200).json({ callsign: call, name: '', email: '', whatsapp: '', whatsappRaw: '', country: '', grid: '', source: 'qrz', warning: 'QRZ no autorizó la consulta o la suscripción no permite estos datos.' });
    const params = new URLSearchParams({ s: session, callsign: call });
    const result = await fetch('https://xmldata.qrz.com/xml/current/?' + params.toString());
    if (!result.ok) return res.status(502).json({ error: 'No se pudo consultar el indicativo en QRZ' });
    const xml = await result.text();
    const email = field(xml, 'email');
    const phone = field(xml, 'mobile') || field(xml, 'landline');
    return res.status(200).json({
      callsign: call, name: [field(xml, 'fname'), field(xml, 'name')].filter(Boolean).join(' '),
      email, whatsapp: phone.replace(/[^0-9]/g, ''), whatsappRaw: phone,
      country: field(xml, 'country'), grid: field(xml, 'grid'), source: 'qrz',
      warning: field(xml, 'Error') || field(xml, 'Message') || ''
    });
  } catch {
    return res.status(502).json({ error: 'No se pudo conectar con QRZ. Revisá la conexión e intentá otra vez.' });
  }
}