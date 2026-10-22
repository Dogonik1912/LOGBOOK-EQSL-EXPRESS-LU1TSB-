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

  const decodeEmailRegion = (region = '') => {
    let decoded = String(region)
      // QRZ puede representar separadores como escapes JavaScript dentro del campo Email.
      .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .replace(/%40/gi, '@').replace(/%2e/gi, '.');
    const decodedPieces = [];
    // Solo descifrar valores incrustados dentro de la región Email del perfil,
    // nunca recorrer scripts, anuncios o el pie de página completo.
    for (const match of decoded.matchAll(/(?:atob|Base64\.decode)\s*\(\s*["']([A-Za-z0-9+/=]{8,})["']\s*\)/gi)) {
      try {
        const piece = Buffer.from(match[1], 'base64').toString('utf8');
        if (/[A-Z0-9._%+-]+\s*(?:@|\\u0040|\\x40)\s*[A-Z0-9.-]+/i.test(piece)) decodedPieces.push(piece);
      } catch {}
    }
    for (const match of decoded.matchAll(/String\.fromCharCode\s*\(\s*([0-9,\s]+)\s*\)/gi)) {
      try {
        const piece = match[1].split(',').map(n => String.fromCharCode(Number(n.trim()))).join('');
        if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(piece)) decodedPieces.push(piece);
      } catch {}
    }
    return decoded + ' ' + decodedPieces.join(' ');
  };

  const findContacts = (html, bioTexts = [], allowEmailFromAuthorizedBio = false) => {
    // Buscar correo exclusivamente en el campo Email del perfil QRZ o en una
    // biografía obtenida por la sesión XML autorizada. No extraer teléfonos.
    const sourceHtml = String(html || '')
      .replace(/\\u002f/gi, '/').replace(/\\u003a/gi, ':')
      .replace(/\\u0040/gi, '@').replace(/\\x40/gi, '@');
    const emailRegions = [...sourceHtml.matchAll(/\b(?:e-?mail)\s*:/gi)]
      .map(m => sourceHtml.slice(m.index || 0, (m.index || 0) + 800)
        .split(/(?:Ham Member|Lookups\s*:|Biography|Detail|Logbook|Awards|<footer|<\/footer>)/i)[0]);
    const protectedRegion = emailRegions.find(region =>
      /use\s+mouse\s+to\s+view|login\s+required\s+to\s+view/i.test(stripMarkup(region))
    ) || '';
    const profileRegion = protectedRegion || emailRegions[0] || '';
    const normalizedRegion = decodeEmailRegion(profileRegion)
      .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>');
    const mailto = [...normalizedRegion.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi)]
      .map(m => normalizeEmail(m[1])).find(Boolean) || '';
    const visible = stripMarkup(normalizedRegion
      .replace(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi, ' $1 ')
      .replace(/https?:\/\/[^\s"'<>]+/gi, ' '));
    const visibleEmail = [...visible.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
      .map(m => normalizeEmail(m[0])).find(Boolean) || '';

    let authorizedBioEmail = '';
    if (allowEmailFromAuthorizedBio) {
      for (const bio of bioTexts) {
        const normalizedBio = decodeEmailRegion(String(bio || ''))
          .replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>');
        const bioMailto = [...normalizedBio.matchAll(/href\s*=\s*["']mailto:([^"'?\s]+)(?:\?[^"']*)?["']/gi)]
          .map(m => normalizeEmail(m[1])).find(Boolean) || '';
        const bioVisible = stripMarkup(normalizedBio);
        const bioTextEmail = [...bioVisible.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)]
          .map(m => normalizeEmail(m[0])).find(Boolean) || '';
        authorizedBioEmail = bioMailto || bioTextEmail;
        if (authorizedBioEmail) break;
      }
    }
    return { email: mailto || visibleEmail || authorizedBioEmail || '' };
  };

  const xmlTextValue = (xml, tag) => {
    const match = String(xml || '').match(new RegExp('<(?:[A-Za-z0-9_]+:)?' + tag + '\\b[^>]*>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_]+:)?' + tag + '>', 'i'));
    return match ? decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]*>/g, '').trim()) : '';
  };

  // QRZ documenta XML como vía autenticada para aplicaciones. Si el usuario
  // conectó su propia cuenta, usar únicamente los campos que su cuenta puede consultar.
  async function lookupWithAuthorizedQRZXml(user, pass, callsign) {
    if (!user || !pass) return { accessError: 'Conectá tu cuenta QRZ en Ajustes para consultar el correo mediante la interfaz oficial.' };
    try {
      const authUrl = 'https://xmldata.qrz.com/xml/current/?username=' +
        encodeURIComponent(user) + ';password=' + encodeURIComponent(pass) +
        ';agent=' + encodeURIComponent('LOGBOOK-EQSL-EXPRESS-LU1TSB');
      const authResponse = await fetch(authUrl, {
        headers: { 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' }
      });
      if (!authResponse.ok) return { accessError: 'La interfaz XML de QRZ respondió HTTP ' + authResponse.status + ' al autenticar.' };
      const authXml = await authResponse.text();
      const key = xmlTextValue(authXml, 'Key');
      if (!key) {
        const reason = xmlTextValue(authXml, 'Error') || xmlTextValue(authXml, 'Message');
        return { accessError: reason ? 'QRZ no autenticó la cuenta: ' + reason : 'QRZ no devolvió una clave de sesión XML. Revisá las credenciales configuradas.' };
      }
      const profileUrl = 'https://xmldata.qrz.com/xml/current/?s=' +
        encodeURIComponent(key) + ';callsign=' + encodeURIComponent(callsign);
      const profileResponse = await fetch(profileUrl, {
        headers: { 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' }
      });
      if (!profileResponse.ok) return { accessError: 'La interfaz XML de QRZ respondió HTTP ' + profileResponse.status + ' al consultar el indicativo.' };
      const profileXml = await profileResponse.text();
      const xmlError = xmlTextValue(profileXml, 'Error');
      const xmlMessage = xmlTextValue(profileXml, 'Message');
      if (xmlError) return { accessError: 'QRZ XML: ' + xmlError };


      // Verificar la identidad del registro antes de aceptar cualquier dato de contacto.
      // QRZ normalmente devuelve <call>; si lo incluye y no coincide, no asociar
      // ningún correo ni dato personal a este QSO.
      const returnedCall = xmlTextValue(profileXml, 'call').toUpperCase().replace(/[^A-Z0-9/]/g, '');
      const requestedCall = String(callsign || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
      if (returnedCall && returnedCall !== requestedCall) return {};

      let email = normalizeEmail(xmlTextValue(profileXml, 'email'));
      let emailSource = email ? 'qrz-xml' : '';

      // PRUEBA 1: QRZ documenta html=<callsign> como consulta autenticada de la
      // ficha exacta. Si el campo XML <email> viene vacío, revisar únicamente
      // la región etiquetada "Email" de esa misma ficha; nunca buscar en toda
      // la página ni en el pie de página, para no asociar el correo de terceros.
      if (!email) {
        try {
          const bioUrl = 'https://xmldata.qrz.com/xml/current/?s=' +
            encodeURIComponent(key) + ';html=' + encodeURIComponent(callsign);
          const bioResponse = await fetch(bioUrl, {
            headers: { 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8' },
            signal: AbortSignal.timeout(10000)
          });
          if (bioResponse.ok) {
            const bioHtml = await bioResponse.text();
            const profileContacts = findContacts(bioHtml, [], false);
            if (profileContacts.email) {
              email = profileContacts.email;
              emailSource = 'qrz-authenticated-profile-html';
            }
          }
        } catch {
          // Si la consulta de la ficha HTML falla, conservar el resultado XML.
        }
      }

      return {
        email,
        emailSource,
        accessError: email ? '' : (xmlMessage ? 'QRZ informa: ' + xmlMessage : 'QRZ autenticó la cuenta, pero no entregó el campo Email para este indicativo. Puede estar oculto o limitado por los permisos/suscripción de QRZ.'),
        name: xmlTextValue(profileXml, 'fname') && xmlTextValue(profileXml, 'name')
          ? xmlTextValue(profileXml, 'fname') + ' ' + xmlTextValue(profileXml, 'name')
          : xmlTextValue(profileXml, 'name'),
        country: xmlTextValue(profileXml, 'country'),
        grid: xmlTextValue(profileXml, 'grid')
      };
    } catch (error) {
      return { accessError: 'Falló la consulta XML oficial de QRZ: ' + (error instanceof Error ? error.message : 'error desconocido') };
    }
  }


  // Se evita automatizar el formulario HTML de QRZ. Para correo se utiliza
  // exclusivamente la interfaz XML oficial autenticada y los permisos de esa cuenta.

  let email = '', name = '', country = '', grid = '';
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
      // No tomar correos del HTML público: puede contener correos de terceros,
      // pie de página o componentes compartidos y asociarlos al indicativo equivocado.
      // El correo solo se acepta más abajo desde la respuesta XML autenticada del callsign exacto.

      const nameMatch = html.match(/<span[^>]*class=["'][^"']*\bm0\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)
        || html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (nameMatch) name = decode(nameMatch[1]);
      const gridMatch = html.match(/Grid Square:<\/td>\s*<td[^>]*>\s*([A-R]{2}[0-9]{2}(?:[A-X]{2})?)/i);
      if (gridMatch) grid = gridMatch[1];
      const countryMatch = html.match(/Country:<\/td>\s*<td[^>]*>([^<]+)/i);
      if (countryMatch) country = decode(countryMatch[1]);
    }
  } catch {
    accessError = 'No se pudo acceder al perfil público de QRZ desde el servidor.';
  }

  // Única vía automática para correo: interfaz XML oficial autenticada de QRZ.
  // No se automatiza el formulario web ni se intenta descifrar el campo protegido.
  const xmlProfile = await lookupWithAuthorizedQRZXml(
    String(body.user || '').trim(),
    String(body.pass || ''),
    call
  );
  email = xmlProfile.email || '';
  const emailSource = xmlProfile.emailSource || '';
  if (!name && xmlProfile.name) name = xmlProfile.name;
  if (!country && xmlProfile.country) country = xmlProfile.country;
  if (!grid && xmlProfile.grid) grid = xmlProfile.grid;

  // Extraer teléfono/WhatsApp solo de enlaces y etiquetas de contacto del perfil
  // público del indicativo consultado. Nunca inferir números a partir del indicativo.
  let whatsapp = '', whatsappRaw = '', phone = '';
  const contactHtml = String(html || '')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|head|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  const contactCandidates = [];
  for (const m of contactHtml.matchAll(/href\s*=\s*["'](?:https?:)?\/\/(?:api\.)?whatsapp\.com\/send\?[^"']*phone=([^&"'\s]+)/gi)) {
    try { contactCandidates.push(decodeURIComponent(m[1].replace(/&amp;/gi, '&'))); } catch {}
  }
  for (const m of contactHtml.matchAll(/href\s*=\s*["'](?:https?:)?\/\/(?:www\.)?wa\.me\/([^?"'\s]+)/gi)) {
    try { contactCandidates.push(decodeURIComponent(m[1])); } catch {}
  }
  const cleanPhone = value => String(value || '').replace(/(?:ext\.?|x)\s*\d+$/i, '').replace(/[^\+\d]/g, '');
  for (const candidate of contactCandidates) {
    const digits = cleanPhone(candidate);
    if (digits.replace(/\D/g, '').length >= 8 && digits.replace(/\D/g, '').length <= 15) {
      whatsapp = digits.replace(/^\+/, '');
      whatsappRaw = candidate;
      break;
    }
  }
  if (!whatsapp && html) {
    const visibleProfile = stripMarkup(contactHtml);
    const phoneMatch = visibleProfile.match(/(?:phone|telephone|mobile|cell(?:ular)?|tel[eé]fono|m[oó]vil|celular|whatsapp|wsp)\s*[:：-]\s*([+\d(][+\d().\s/-]{6,22}\d)/i);
    if (phoneMatch) {
      const digits = cleanPhone(phoneMatch[1]);
      if (digits.replace(/\D/g, '').length >= 8 && digits.replace(/\D/g, '').length <= 15) {
        phone = phoneMatch[1].trim();
        whatsapp = digits.replace(/^\+/, '');
        whatsappRaw = phone;
      }
    }
  }

  // El correo solo se acepta de una consulta autenticada de QRZ para el indicativo exacto.
  // Los teléfonos solo se aceptan si
  // aparecen explícitamente como contacto en el perfil público.
  return res.status(200).json({
    callsign: call, name, country, grid, email,
    phone, whatsapp, whatsappRaw,
    source: email ? emailSource : 'qrz',
    foundSource: email ? emailSource : 'qrz',
    sources: ['qrz'],
    accessError: !email ? (xmlProfile.accessError || accessError || 'QRZ no entregó un correo mediante la interfaz oficial. El teléfono/WhatsApp se informa únicamente si figura como contacto público.') : ''
  });
}
