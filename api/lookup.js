export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const call = String(body.call || '').trim().toUpperCase();
  if (!/^[A-Z0-9/]{3,20}$/.test(call)) return res.status(400).json({ error: 'Indicativo no válido' });

  const decode = (s = '') => String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/\s+/g, ' ').trim();

  const cleanPhone = (raw) => {
    let digits = String(raw || '').replace(/\D/g, '');
    if (digits.startsWith('00')) digits = digits.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? digits : '';
  };

  const findContacts = (input) => {
    let source = String(input || '')
      .replace(/\\u003c/gi, '<').replace(/\\u0040/gi, '@')
      .replace(/&#64;|&commat;/gi, '@')
      .replace(/\\x40/gi, '@');
    const emails = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
    const email = emails.find(e => !/(?:example\.com|cloudflare|sentry|w3\.org|noreply|no-reply)/i.test(e)) || '';

    const patterns = [
      /(?:https?:)?\/\/(?:www\.)?wa\.me\/([+0-9]{8,20})/i,
      /(?:https?:)?\/\/(?:www\.)?whatsapp\.com\/send\?[^"' \s]*?phone=([+0-9]{8,20})/i,
      /href=["'][^"']*wa\.me\/([+0-9]{8,20})/i,
      /(?:whatsapp|whats\s*app|wsp|wa\.me|celular|m[oó]vil|movil|tel[eé]fono|telefono|phone|mobile|cell)\s*(?:[:：=]|-)?\s*((?:\+|00)?[0-9][0-9() .-]{7,22})/i
    ];
    let raw = '';
    for (const re of patterns) {
      const m = source.match(re);
      if (m && m[1]) { raw = m[1].trim(); break; }
    }
    return { email, whatsappRaw: raw, whatsapp: cleanPhone(raw) };
  };

  let email = '', whatsapp = '', whatsappRaw = '', name = '', country = '', grid = '';
  let accessError = '';
  let html = '';
  try {
    const response = await fetch('https://www.qrz.com/db/' + encodeURIComponent(call), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow'
    });
    if (!response.ok) {
      accessError = 'QRZ respondió HTTP ' + response.status + ' al consultar el perfil público.';
    } else {
      html = await response.text();
      // Algunos perfiles guardan la biografía codificada en Base64 dentro de la página.
      const bioParts = [];
      const b64Matches = html.matchAll(/Base64\.decode\(["']([A-Za-z0-9+/=]{16,})["']\)/g);
      for (const m of b64Matches) {
        try { bioParts.push(Buffer.from(m[1], 'base64').toString('utf8')); } catch {}
      }
      const decodedPage = html + '\n' + bioParts.join('\n');
      const contacts = findContacts(decodedPage);
      email = contacts.email;
      whatsapp = contacts.whatsapp;
      whatsappRaw = contacts.whatsappRaw;

      const nameMatch = html.match(/<span[^>]*class=["'][^"']*\bm0\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)
        || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (nameMatch) name = decode(nameMatch[1]);
      const gridMatch = html.match(/Grid Square:<\/td>\s*<td[^>]*>([A-Za-z0-9]+)/i)
        || html.match(/\b([A-R]{2}[0-9]{2}[a-x]{2})\b/i);
      if (gridMatch) grid = gridMatch[1];
      const countryMatch = html.match(/Country:<\/td>\s*<td[^>]*>([^<]+)/i);
      if (countryMatch) country = decode(countryMatch[1]);
    }
  } catch {
    accessError = 'No se pudo acceder al perfil público de QRZ desde el servidor.';
  }

  // Only public profile data is used here; no QRZ credentials or subscriber-only XML fields.
  return res.status(200).json({
    callsign: call, name, country, grid, email, whatsapp, whatsappRaw,
    source: email || whatsapp ? 'qrz-public-profile' : 'qrz',
    foundSource: email || whatsapp ? 'qrz-public-profile' : 'qrz',
    accessError: (!email && !whatsapp) ? accessError : ''
  });
}
