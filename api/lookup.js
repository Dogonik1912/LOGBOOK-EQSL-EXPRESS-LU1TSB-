export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const call = String(body.call || '').trim().toUpperCase();
  const user = String(body.user || '').trim();
  const pass = String(body.pass || '');
  if (!/^[A-Z0-9/]{3,20}$/.test(call)) return res.status(400).json({ error: 'Indicativo no válido' });

  const decode = (s = '') => s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").trim();
  const field = (xml, name) => {
    const m = xml.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>', 'i'));
    return m ? decode(m[1].replace(/<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>/g, '$1').replace(/<[^>]+>/g, ' ')) : '';
  };

  let email = '', whatsapp = '', whatsappRaw = '', name = '', country = '', grid = '';
  let foundSource = '';
  let bioText = '';
  // Primero intentar la ficha pública de QRZ, donde puede haber correo o teléfono
  // escrito por el propio radioaficionado en su biografía.
  try {
    const pageRes = await fetch('https://www.qrz.com/db/' + encodeURIComponent(call), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LOGBOOK-EQSL-EXPRESS-LU1TSB/1.0)',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });
    if (pageRes.ok) {
      const html = await pageRes.text();
      const b64 = html.match(/Base64\\.decode\\(["']([A-Za-z0-9+/=]+)["']\\)/);
      if (b64?.[1]) {
        try { bioText = Buffer.from(b64[1], 'base64').toString('utf8'); } catch {}
      }
      const nameMatch = html.match(/<span class="m0"[^>]*>([^<]+)<\\/span>/i)
        || html.match(/<h1[^>]*>([^<]+)<\\/h1>/i);
      if (nameMatch) name = decode(nameMatch[1].replace(/<[^>]+>/g, ' '));
      const gridMatch = html.match(/Grid Square:<\\/td>\\s*<td[^>]*>([A-Za-z0-9]+)/i)
        || html.match(/([A-R]{2}[0-9]{2}[a-x]{2})/i);
      if (gridMatch) grid = gridMatch[1].trim();
      const countryMatch = html.match(/Country:<\\/td>\\s*<td[^>]*>([^<]+)<\\/td>/i);
      if (countryMatch) country = decode(countryMatch[1]);

      const scan = (bioText + ' ' + html).replace(/\\u003c/gi, '<');
      const waMatch = scan.match(/(?:whatsapp|wsp|wa\\.me|celular|m[oó]vil|movil|tel[eé]fono|telefono|cel)\\s*(?:[:：=]|https?:\\/\\/)?\\s*([+0-9][+0-9() .-]{7,24})/i);
      if (waMatch?.[1]) {
        whatsappRaw = waMatch[1].trim();
        let digits = whatsappRaw.replace(/\\D/g, '');
        if (digits.startsWith('00')) digits = digits.slice(2);
        if (digits.length >= 8) whatsapp = digits;
      }
      const foundEmails = scan.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}/gi) || [];
      const validEmails = foundEmails.filter(e =>
        !/(?:google|qrz\\.com|sentry|example\\.com|cloudflare|w3\\.org)/i.test(e)
      );
      if (validEmails.length) email = validEmails[0];
      if (email || whatsapp) foundSource = 'qrz-bio';
    }
  } catch (err) {
    // La búsqueda XML se intenta debajo si el perfil público no está disponible.
    console.warn('QRZ public profile lookup failed');
  }

  // Complementar con XML oficial si el usuario configuró sus credenciales.
  if (user && pass && (!email || !name || !grid || !country)) {
    try {
      const login = new URLSearchParams({ username: user, password: pass, agent: 'LOGBOOK-EQSL-EXPRESS-LU1TSB/1.0' });
      const auth = await fetch('https://xmldata.qrz.com/xml/current/?' + login.toString());
      if (auth.ok) {
        const key = field(await auth.text(), 'Key');
        if (key) {
          const result = await fetch('https://xmldata.qrz.com/xml/current/?' + new URLSearchParams({ s: key, callsign: call }).toString());
          if (result.ok) {
            const xml = await result.text();
            email = email || field(xml, 'email');
            name = name || [field(xml, 'fname'), field(xml, 'name')].filter(Boolean).join(' ');
            country = country || field(xml, 'country') || field(xml, 'land');
            grid = grid || field(xml, 'grid');
            if (email && !foundSource) foundSource = 'qrz-xml';
          }
        }
      }
    } catch {
      console.warn('QRZ XML lookup failed');
    }
  }

  return res.status(200).json({
    callsign: call, name, country, grid, email, whatsapp, whatsappRaw,
    source: foundSource || 'qrz',
    foundSource: foundSource || 'qrz',
  });
}
