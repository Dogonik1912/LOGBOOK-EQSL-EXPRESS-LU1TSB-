export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const call = String(body.call || '').trim().toUpperCase();
  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');
  if (!/^[A-Z0-9/]{3,20}$/.test(call)) return res.status(400).json({ error: 'Indicativo no válido' });

  const decode = (s = '') => String(s)
    .replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\\s+/g, ' ').trim();
  const field = (xml, name) => {
    const re = new RegExp('<' + name + '(?:\\\\s[^>]*)?>([\\\\s\\\\S]*?)</' + name + '>', 'i');
    const m = String(xml).match(re);
    return m ? decode(m[1]) : '';
  };
  const cleanPhone = (raw) => {
    let digits = String(raw || '').replace(/\\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? digits : '';
  };
  const findContacts = (text) => {
    const source = decode(String(text || '').replace(/\\u003c/gi, '<'));
    const emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi) || [];
    const email = emails.find(e => !/(?:example\\.com|cloudflare|sentry|w3\\.org|noreply)/i.test(e)) || '';
    const phonePatterns = [
      /(?:whatsapp|whats\\s*app|wsp|wa\\.me|celular|m[oó]vil|movil|tel[eé]fono|telefono|phone|mobile|cell)\\s*(?:[:：=]|https?:\\/\\/|.{0,12}?)(\\+?[0-9][0-9() .-]{7,20})/i,
      /(?:https?:)?\\/\\/(?:api\\.)?wa\\.me\\/(\\+?[0-9]{8,15})/i,
      /(?:https?:)?\\/\\/(?:www\\.)?whatsapp\\.com\\/send\\?[^"'\\s]*?phone=(\\+?[0-9]{8,15})/i,
      /href=["'][^"']*wa\\.me\\/(\\+?[0-9]{8,15})/i
    ];
    let raw = '';
    for (const re of phonePatterns) {
      const m = source.match(re);
      if (m && m[1]) { raw = m[1]; break; }
    }
    return { email, whatsappRaw: raw, whatsapp: cleanPhone(raw) };
  };

  let email = '', whatsapp = '', whatsappRaw = '', name = '', country = '', grid = '';
  let foundSource = '', accessError = '';
  let publicHtml = '';
  // QRZ's public profile is attempted first, but it may block automated requests.
  try {
    const response = await fetch('https://www.qrz.com/db/' + encodeURIComponent(call), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LOGBOOK-EQSL-EXPRESS-LU1TSB/1.0)', 'Accept-Language': 'es,en;q=0.8' },
      redirect: 'follow'
    });
    if (response.ok) {
      publicHtml = await response.text();
      const contacts = findContacts(publicHtml);
      email = contacts.email;
      whatsapp = contacts.whatsapp;
      whatsappRaw = contacts.whatsappRaw;
      const nm = publicHtml.match(/<span[^>]*class=["'][^"']*m0[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>/i) || publicHtml.match(/<h1[^>]*>([\\s\\S]*?)<\\/h1>/i);
      if (nm) name = decode(nm[1]);
      const gm = publicHtml.match(/Grid Square:<\\/td>\\s*<td[^>]*>([A-Za-z0-9]+)/i) || publicHtml.match(/([A-R]{2}[0-9]{2}[a-x]{2})/i);
      if (gm) grid = gm[1];
      const cm = publicHtml.match(/Country:<\\/td>\\s*<td[^>]*>([^<]+)/i);
      if (cm) country = decode(cm[1]);
      if (email || whatsapp) foundSource = 'qrz-bio';
    } else {
      accessError = 'QRZ no permitió leer el perfil público (HTTP ' + response.status + ').';
    }
  } catch {
    accessError = 'No se pudo acceder al perfil público de QRZ desde el servidor.';
  }

  // Official XML lookup and, when available, the profile biography HTML.
  if (user && pass) {
    try {
      const loginUrl = 'https://xmldata.qrz.com/xml/current/?' + new URLSearchParams({
        username: user, password: pass, agent: 'LOGBOOK-EQSL-EXPRESS-LU1TSB/1.0'
      }).toString();
      const authRes = await fetch(loginUrl);
      if (!authRes.ok) {
        accessError = 'QRZ XML devolvió HTTP ' + authRes.status + '.';
      } else {
        const authXml = await authRes.text();
        const key = field(authXml, 'Key');
        const authErr = field(authXml, 'Error') || field(authXml, 'Message');
        if (!key) {
          accessError = authErr || 'QRZ no entregó una clave XML. Revisá las credenciales y la suscripción.';
        } else {
          const xmlRes = await fetch('https://xmldata.qrz.com/xml/current/?' + new URLSearchParams({ s: key, callsign: call }).toString());
          if (xmlRes.ok) {
            const xml = await xmlRes.text();
            email = field(xml, 'email') || email;
            name = [field(xml, 'fname'), field(xml, 'name')].filter(Boolean).join(' ') || name;
            country = field(xml, 'country') || field(xml, 'land') || country;
            grid = field(xml, 'grid') || grid;
            const lookupError = field(xml, 'Error') || field(xml, 'Message');
            if (lookupError) accessError = lookupError;
            if (email) foundSource = 'qrz-xml';

            // QRZ XML's html=CALLSIGN method returns the formatted bio page.
            if (!whatsapp || !email) {
              const bioRes = await fetch('https://xmldata.qrz.com/xml/current/?' + new URLSearchParams({ s: key, html: call }).toString());
              if (bioRes.ok) {
                const bio = await bioRes.text();
                const contacts = findContacts(bio);
                email = email || contacts.email;
                whatsapp = whatsapp || contacts.whatsapp;
                whatsappRaw = whatsappRaw || contacts.whatsappRaw;
                if (email || whatsapp) foundSource = 'qrz-bio';
              }
            }
          } else {
            accessError = 'La consulta XML de QRZ devolvió HTTP ' + xmlRes.status + '.';
          }
        }
      }
    } catch {
      accessError = 'Falló la consulta autenticada de QRZ XML.';
    }
  }

  return res.status(200).json({
    callsign: call, name, country, grid, email, whatsapp, whatsappRaw,
    source: foundSource || 'qrz',
    foundSource: foundSource || 'qrz',
    accessError: (!email && !whatsapp && accessError) ? accessError : ''
  });
}
