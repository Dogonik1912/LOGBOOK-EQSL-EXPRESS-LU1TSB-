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

  const findContacts = (html, bioTexts = [], allowEmailFromAuthorizedBio = false) => {
    // Solo extrae datos que estén presentes en el HTML público recibido.
    // Prioridad del correo: biografía, enlaces explícitos, texto visible.
    const sourceHtml = String(html || '')
      .replace(/\\u002f/gi, '/').replace(/\\u003a/gi, ':')
      .replace(/\\u0040/gi, '@').replace(/\\x40/gi, '@');
    const bioText = bioTexts.map(stripMarkup).join(' ');
    // Texto visible del perfil para detectar teléfonos etiquetados; esta variable faltaba,
    // provocando ReferenceError y abortando toda la búsqueda del corresponsal.
    const visibleHtml = stripMarkup(sourceHtml);
    // El correo solo se busca dentro del bloque de la ficha que sigue a la etiqueta
    // "Email". Buscar mailto en todo el HTML de QRZ puede devolver el correo del
    // soporte, del pie de página o de un anuncio en lugar del corresponsal.
    // La biografía no sustituye el campo Email / "Use mouse to view".
    const emailRegions = [...sourceHtml.matchAll(/\b(?:e-?mail)\s*:/gi)]
      .map(m => sourceHtml.slice(m.index || 0, (m.index || 0) + 800)
        .split(/(?:Ham Member|Lookups\s*:|Biography|Detail|Logbook|Awards|<footer|<\/footer>)/i)[0]);
    const protectedEmailRegion = emailRegions.find(region =>
      /use\s+mouse\s+to\s+view|login\s+required\s+to\s+view/i.test(stripMarkup(region))
    ) || '';
    const emailRegionWithAddress = emailRegions.find(region =>
      /mailto:|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(region)
    ) || '';
    // Preferir el primer campo Email real de la ficha y no saltar a otra zona
    // del documento si QRZ no publica una dirección en ese campo.
    const profileEmailHtml = protectedEmailRegion || emailRegions[0] || emailRegionWithAddress;
    const profileEmailSource = profileEmailHtml
      .replace(/\\u0040/gi, '@').replace(/\\x40/gi, '@')
      .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>');
    const mailtoMatches = [...profileEmailSource.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi)]
      .map(m => normalizeEmail(m[1]));
    const visibleEmailRegion = stripMarkup(profileEmailSource
      .replace(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi, ' $1 ')
      .replace(/https?:\/\/[^\s"'<>]+/gi, ' '));
    const visibleMatches = [...visibleEmailRegion.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
      .map(m => normalizeEmail(m[0]));

    // La biografía descargada con la clave XML autenticada es una fuente autorizada
    // distinta del campo Email del perfil. La opción existía, pero no se utilizaba:
    // por eso se perdían direcciones que el operador había escrito en su biografía.
    let authorizedBioEmail = '';
    if (allowEmailFromAuthorizedBio) {
      for (const bio of bioTexts) {
        const normalizedBio = String(bio || '')
          .replace(/\\u0040/gi, '@').replace(/\\x40/gi, '@')
          .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>');
        const bioMailto = [...normalizedBio.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi)]
          .map(m => normalizeEmail(m[1])).find(Boolean);
        const bioVisible = stripMarkup(normalizedBio);
        const bioTextEmail = [...bioVisible.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
          .map(m => normalizeEmail(m[0])).find(Boolean);
        authorizedBioEmail = bioMailto || bioTextEmail || '';
        if (authorizedBioEmail) break;
      }
    }
    const email = mailtoMatches.find(Boolean) || visibleMatches.find(Boolean) || authorizedBioEmail || '';

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

  const xmlTextValue = (xml, tag) => {
    const match = String(xml || '').match(new RegExp('<(?:[A-Za-z0-9_]+:)?' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?' + tag + '>', 'i'));
    return match ? decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim()) : '';
  };

  // QRZ documenta XML como vía autenticada para aplicaciones. Si el usuario
  // conectó su propia cuenta, usar únicamente los campos que su cuenta puede consultar.
  async function lookupWithAuthorizedQRZXml(user, pass, callsign) {
    if (!user || !pass) return {};
    try {
      const authUrl = 'https://xmldata.qrz.com/xml/current/?username=' +
        encodeURIComponent(user) + ';password=' + encodeURIComponent(pass) +
        ';agent=' + encodeURIComponent('LOGBOOK-EQSL-EXPRESS-LU1TSB');
      const authResponse = await fetch(authUrl, {
        headers: { 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' }
      });
      if (!authResponse.ok) return {};
      const authXml = await authResponse.text();
      const key = xmlTextValue(authXml, 'Key');
      if (!key) return {};
      const profileUrl = 'https://xmldata.qrz.com/xml/current/?s=' +
        encodeURIComponent(key) + ';callsign=' + encodeURIComponent(callsign);
      const profileResponse = await fetch(profileUrl, {
        headers: { 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' }
      });
      if (!profileResponse.ok) return {};
      const profileXml = await profileResponse.text();
      if (/<Error>/i.test(profileXml)) return {};
      let email = normalizeEmail(xmlTextValue(profileXml, 'email'));
      let whatsapp = '';
      let whatsappRaw = '';

      // QRZ documenta html=<callsign> como vía XML autenticada para obtener
      // la biografía del perfil. Esto permite leer contactos publicados en la bio
      // sin depender del HTML público ni de controles de terceros.
      try {
        const bioUrl = 'https://xmldata.qrz.com/xml/current/?s=' +
          encodeURIComponent(key) + ';html=' + encodeURIComponent(callsign);
        const bioResponse = await fetch(bioUrl, {
          headers: { 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
          signal: AbortSignal.timeout(10000)
        });
        if (bioResponse.ok) {
          const bioHtml = await bioResponse.text();
          const bioContacts = findContacts(bioHtml, [bioHtml], true);
          if (!email && bioContacts.email) email = bioContacts.email;
          whatsapp = bioContacts.whatsapp || '';
          whatsappRaw = bioContacts.whatsappRaw || '';
        }
      } catch {
        // La ficha XML principal sigue siendo útil aunque QRZ no entregue la bio.
      }

      return {
        email,
        whatsapp,
        whatsappRaw,
        name: xmlTextValue(profileXml, 'fname') && xmlTextValue(profileXml, 'name')
          ? xmlTextValue(profileXml, 'fname') + ' ' + xmlTextValue(profileXml, 'name')
          : xmlTextValue(profileXml, 'name'),
        country: xmlTextValue(profileXml, 'country'),
        grid: xmlTextValue(profileXml, 'grid')
      };
    } catch {
      return {};
    }
  }

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

  // Fuente pública adicional: HamDB no requiere iniciar sesión. Se usa para
  // completar datos básicos, pero nunca se inventan correo ni teléfono a partir de
  // un indicativo o de datos que HamDB no publica.
  let hamdbFound = false;
  try {
    const hamdbResponse = await fetch(
      'https://api.hamdb.org/' + encodeURIComponent(call) + '/json/LOGBOOK-EQSL-EXPRESS-LU1TSB',
      {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(7000)
      }
    );
    if (hamdbResponse.ok) {
      const payload = await hamdbResponse.json();
      const record = payload?.hamdb?.callsign || payload?.callsign || {};
      const status = String(payload?.hamdb?.messages?.status || payload?.messages?.status || '').toUpperCase();
      if ((!status || status === 'OK') && (record.call || record.callsign || record.name || record.grid)) {
        hamdbFound = true;
        if (!name) {
          const first = String(record.fname || '').trim();
          const last = String(record.name || '').trim();
          name = [first, last].filter(Boolean).join(' ') || String(record.name || '').trim();
        }
        if (!country) country = String(record.country || record.country_name || '').trim();
        if (!grid) grid = String(record.grid || record.gridsquare || '').trim();
      }
    }
  } catch {
    // La fuente adicional es opcional: si falla, no debe impedir el resto del lookup.
  }

  // Si se conectó una cuenta QRZ, intentar también la API XML autorizada.
  // Nunca sustituir el correo por uno encontrado en scripts o en el pie de página.
  const xmlProfile = await lookupWithAuthorizedQRZXml(
    String(body.user || '').trim(),
    String(body.pass || ''),
    call
  );
  if (xmlProfile.email) email = xmlProfile.email;
  if (xmlProfile.whatsapp) whatsapp = xmlProfile.whatsapp;
  if (xmlProfile.whatsappRaw) whatsappRaw = xmlProfile.whatsappRaw;
  if (!name && xmlProfile.name) name = xmlProfile.name;
  if (!country && xmlProfile.country) country = xmlProfile.country;
  if (!grid && xmlProfile.grid) grid = xmlProfile.grid;

  // El correo público no se devuelve nunca desde este endpoint. Solo puede
  // proceder de la consulta XML autenticada a QRZ, solicitada por el servicio cliente.
  return res.status(200).json({
    callsign: call, name, country, grid, email, whatsapp, whatsappRaw,
    source: email || whatsapp ? 'qrz-public-profile' : (hamdbFound ? 'hamdb' : 'qrz'),
    foundSource: email || whatsapp ? 'qrz-public-profile' : (hamdbFound ? 'hamdb' : 'qrz'),
    sources: ['qrz', ...(hamdbFound ? ['hamdb'] : []), ...(xmlProfile.email || xmlProfile.whatsapp ? ['qrz-xml'] : [])],
    accessError: (!email && !whatsapp) ? (accessError || 'No se encontró correo ni WhatsApp publicado en las fuentes consultadas. Los datos básicos pueden proceder de HamDB; esta fuente no garantiza contactos.') : ''
  });
}
