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

  const decodeEntities = (s = '') => String(s)
    .replace(/&commat;|&#64;/gi, '@')
    .replace(/&period;|&#46;/gi, '.')
    .replace(/&colon;/gi, ':')
    .replace(/&amp;/gi, '&')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));

  const stripMarkup = (input = '') => decodeEntities(String(input)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|head|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\\u003c/gi, '<')
    .replace(/\\u0040/gi, '@'))
    .replace(/\\x40/gi, '@')
    .replace(/\s+/g, ' ')
    .trim();

  const normalizeEmail = (candidate = '') => {
    const value = decodeEntities(String(candidate))
      .replace(/^mailto:/i, '')
      .replace(/[),;>"'\]]+$/g, '')
      .replace(/^[<("'[]+/g, '')
      .trim();
    if (!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(value)) return '';
    if (/(?:example\.com|cloudflare|sentry|w3\.org|noreply|no-reply|wordpress|wixstatic|google-analytics|gravatar|schema\.org|jquery|bootstrap)/i.test(value)) return '';
    return value;
  };

  const findContacts = (html, bioTexts = []) => {
    // Solo extrae datos que estén presentes en el HTML público recibido.
    // Prioridad del correo: biografía, enlaces explícitos, texto visible.
    const sourceHtml = String(html || '')
      .replace(/\\u002f/gi, '/').replace(/\\u003a/gi, ':')
      .replace(/\\u0040/gi, '@').replace(/\\x40/gi, '@');
    const bioText = bioTexts.map(stripMarkup).join(' ');
    const mailtoMatches = [...sourceHtml.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi)]
      .map(m => normalizeEmail(m[1]));
    const bioMatches = [...bioText.matchAll(/[A-Z0-9._%+-]+(?:\s*\[at\]\s*|\s*\(at\)\s*|@)[A-Z0-9.-]+(?:\s*\[dot\]\s*|\s*\(dot\)\s*|\.)[A-Z]{2,}/gi)]
      .map(m => normalizeEmail(m[0].replace(/\s*\[at\]\s*|\s*\(at\)\s*/i, '@').replace(/\s*\[dot\]\s*|\s*\(dot\)\s*/i, '.')));
    const visibleHtml = stripMarkup(sourceHtml
      .replace(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi, ' $1 ')
      .replace(/https?:\/\/[^\s"'<>]+/gi, ' '));
    const visibleMatches = [...visibleHtml.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
      .map(m => normalizeEmail(m[0]));
    const email = [...bioMatches, ...mailtoMatches, ...visibleMatches].find(Boolean) || '';

    // Examina enlaces completos (incluidos atributos data-* y HTML escapado) antes
    // de buscar números etiquetados; esto evita perder un WhatsApp publicado como botón.
    const linkSource = decodeEntities(sourceHtml)
      .replace(/&sol;|&#47;|&#x2f;/gi, '/')
      .replace(/&#43;|&plus;/gi, '+')
      .replace(/%2f/gi, '/').replace(/%3a/gi, ':').replace(/%2b/gi, '+');
    const linkCandidates = [];
    const addCandidate = (raw, kind) => {
      const value = String(raw || '').trim();
      const digits = cleanPhone(value);
      if (digits) linkCandidates.push({ raw: value, digits, kind });
    };
    for (const m of linkSource.matchAll(/(?:https?:)?\/\/(?:www\.)?(?:wa\.me|api\.whatsapp\.com|whatsapp\.com)\/[^"'<> \t\r\n]*/gi)) {
      const url = m[0];
      const pathNumber = url.match(/wa\.me\/\+?([0-9]{8,15})/i);
      const queryNumber = url.match(/[?&]phone=\+?([0-9]{8,15})/i);
      if (pathNumber) addCandidate(pathNumber[1], 'whatsapp-link');
      else if (queryNumber) addCandidate(queryNumber[1], 'whatsapp-link');
    }
    for (const m of linkSource.matchAll(/(?:href|data-href|data-url)\s*=\s*["']tel:\s*([^"']+)["']/gi)) {
      addCandidate(m[1].split(/[?;]/)[0], 'tel-link');
    }
    // Los perfiles pueden guardar enlaces dentro de JSON/JavaScript o con entidades.
    const bioAndVisible = bioText + ' ' + visibleHtml;
    const labeledMatch = bioAndVisible.match(/(?:whatsapp|whats\s*app|wsp|wa\.me|celular|m[oó]vil|movil|tel[eé]fono|telefono|phone|mobile|cell)\s*(?:[:：=]|-)?\s*((?:\+|00)?[0-9][0-9() .-]{7,22})/i);
    if (labeledMatch) addCandidate(labeledMatch[1], 'labeled-number');
    const whatsapp = linkCandidates[0]?.digits || (linkCandidates.length ? '' : (labeledMatch ? cleanPhone(labeledMatch[1]) : ''));
    const whatsappRaw = linkCandidates[0]?.raw || (labeledMatch ? labeledMatch[1].trim() : '');
    return { email, whatsappRaw, whatsapp };
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
      // QRZ puede incluir una o varias biografías codificadas en Base64.
      const bioParts = [];
      const b64Matches = html.matchAll(/Base64\.decode\(["']([A-Za-z0-9+/=]{16,})["']\)/gi);
      for (const m of b64Matches) {
        try {
          const decoded = Buffer.from(m[1], 'base64').toString('utf8');
          if (decoded && /[A-Za-z0-9]/.test(decoded)) bioParts.push(decoded);
        } catch {}
      }
      const contacts = findContacts(html, bioParts);
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
