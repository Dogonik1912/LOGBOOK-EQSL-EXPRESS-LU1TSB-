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


  // Intenta iniciar sesión en la web de QRZ (sin XML) y leer solo el campo Email
  // de la ficha del indicativo. No se reutilizan cookies entre usuarios ni se guardan
  // credenciales en el servidor. Si QRZ cambia su formulario, se informa sin inventar datos.
  async function lookupWithQRZWebLogin(user, pass, callsign) {
    if (!user || !pass) return {};
    const baseHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache'
    };
    const cookies = new Map();
    const rememberCookies = response => {
      const values = typeof response.headers.getSetCookie === 'function'
        ? response.headers.getSetCookie()
        : [response.headers.get('set-cookie') || ''];
      for (const line of values) {
        const first = String(line).split(';')[0];
        const at = first.indexOf('=');
        if (at > 0) cookies.set(first.slice(0, at).trim(), first.slice(at + 1).trim());
      }
    };
    const cookieHeader = () => [...cookies.entries()].map(([k,v]) => k + '=' + v).join('; ');
    const request = async (url, options = {}) => {
      const headers = { ...baseHeaders, ...(options.headers || {}) };
      if (cookies.size) headers.Cookie = cookieHeader();
      const response = await fetch(url, {
        ...options, headers, redirect: 'manual', signal: AbortSignal.timeout(12000)
      });
      rememberCookies(response);
      return response;
    };
    try {
      let loginResponse = await request('https://www.qrz.com/login');
      if ([301,302,303,307,308].includes(loginResponse.status) && loginResponse.headers.get('location')) {
        const next = new URL(loginResponse.headers.get('location'), 'https://www.qrz.com').href;
        loginResponse = await request(next);
      }
      if (!loginResponse.ok) return { webLoginError: 'QRZ no permitió abrir el formulario de inicio de sesión (HTTP ' + loginResponse.status + ').' };
      const loginHtml = await loginResponse.text();
      const forms = [...loginHtml.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/gi)];
      const candidates = forms.map(m => ({ attrs: m[1], html: m[2] }));
      let form = candidates.find(x => /password/i.test(x.html) && /user|call|login|email/i.test(x.html)) ||
        candidates.find(x => /password/i.test(x.html));
      if (!form) return { webLoginError: 'No se reconoció el formulario web de QRZ; no se intentó extraer el correo.' };
      const actionMatch = form.attrs.match(/action\s*=\s*["']([^"']*)["']/i);
      const methodMatch = form.attrs.match(/method\s*=\s*["']([^"']*)["']/i);
      const action = new URL(actionMatch ? actionMatch[1] : '/login', loginResponse.url || 'https://www.qrz.com/login').href;
      const params = new URLSearchParams();
      for (const m of form.html.matchAll(/<input\b([^>]*)>/gi)) {
        const attrs = m[1];
        const name = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1];
        const value = attrs.match(/\bvalue\s*=\s*["']([^"']*)["']/i)?.[1] || '';
        const type = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || 'text';
        if (name && /hidden|submit|text|email|checkbox/i.test(type)) params.set(name, value);
      }
      const inputDefs = [...form.html.matchAll(/<input\b([^>]*)>/gi)].map(m => {
        const a=m[1], n=a.match(/\bname\s*=\s*["']([^"']+)["']/i)?.[1] || '';
        const t=a.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || 'text';
        return {name:n,type:t};
      });
      const userField = inputDefs.find(x => /user|call|login|email/i.test(x.name) && !/csrf|token|remember/i.test(x.name) && x.type !== 'password');
      const passField = inputDefs.find(x => x.type === 'password' || /pass(word)?/i.test(x.name));
      if (!userField || !passField) return { webLoginError: 'El formulario de QRZ no expuso los campos de usuario y contraseña esperados.' };
      params.set(userField.name, user);
      params.set(passField.name, pass);
      const submit = inputDefs.find(x => /submit/i.test(x.type) && x.name);
      if (submit && !params.has(submit.name)) params.set(submit.name, 'Login');
      let auth = await request(action, {
        method: (methodMatch?.[1] || 'post').toUpperCase(),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Referer': loginResponse.url || 'https://www.qrz.com/login' },
        body: params.toString()
      });
      // Seguir redirecciones manteniendo únicamente las cookies de esta petición.
      for (let i=0; i<4 && [301,302,303,307,308].includes(auth.status) && auth.headers.get('location'); i++) {
        const next = new URL(auth.headers.get('location'), action).href;
        auth = await request(next, { method: 'GET', headers: { 'Referer': action } });
      }
      const authHtml = await auth.text();
      if (!cookies.size || /name=["']password["'][^>]*type=["']password["']/i.test(authHtml) && /login failed|invalid password|incorrect password/i.test(stripMarkup(authHtml))) {
        return { webLoginError: 'QRZ no confirmó una sesión web autenticada; revisá el usuario y la contraseña.' };
      }
      const profileResponse = await request('https://www.qrz.com/db/' + encodeURIComponent(callsign), {
        headers: { 'Referer': 'https://www.qrz.com/' }
      });
      if (!profileResponse.ok) return { webLoginError: 'QRZ no permitió abrir el perfil tras iniciar sesión (HTTP ' + profileResponse.status + ').' };
      const profileHtml = await profileResponse.text();
      if (/login is required for additional detail|login required to view/i.test(stripMarkup(profileHtml))) {
        return { webLoginError: 'QRZ siguió mostrando el perfil como no autenticado; la sesión web no quedó validada.' };
      }
      const contact = findContacts(profileHtml, [], false);
      return {
        email: contact.email || '',
        emailSource: contact.email ? 'qrz-web-session' : '',
        webLoginError: contact.email ? '' : 'Sesión web iniciada, pero el campo Email no se pudo descifrar desde el HTML recibido.'
      };
    } catch (error) {
      return { webLoginError: 'Falló la consulta web autenticada de QRZ: ' + (error instanceof Error ? error.message : 'error desconocido') };
    }
  }

  // HamQTH API v2: alternativa independiente cuando QRZ no devuelve el correo.
  // La contraseña se envía únicamente en el POST de login, nunca en una URL.
  async function lookupWithHamQTH(user, pass, callsign) {
    if (!user || !pass) return {};
    try {
      const login = await fetch('https://www.hamqth.com/api/v2/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ callsign: user, password: pass }),
        signal: AbortSignal.timeout(10000)
      });
      if (!login.ok) {
        return { hamqthError: login.status === 401
          ? 'HamQTH rechazó el usuario o la contraseña.'
          : 'HamQTH no pudo autenticar la cuenta (HTTP ' + login.status + ').' };
      }
      const auth = await login.json();
      if (!auth.token) return { hamqthError: 'HamQTH no devolvió un token de sesión.' };
      const response = await fetch('https://www.hamqth.com/api/v2/callbook/' + encodeURIComponent(callsign) + '?app=LogBook%20eQSL%20Express', {
        headers: { 'Authorization': 'Bearer ' + auth.token, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000)
      });
      if (!response.ok) {
        return { hamqthError: response.status === 404
          ? 'Ese indicativo no figura en el callbook de HamQTH.'
          : 'HamQTH no pudo consultar el indicativo (HTTP ' + response.status + ').' };
      }
      const profile = await response.json();
      const returnedCall = String(profile.callsign || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
      const requestedCall = String(callsign || '').toUpperCase().replace(/[^A-Z0-9/]/g, '');
      if (!returnedCall || returnedCall !== requestedCall) {
        return { hamqthError: 'HamQTH devolvió un registro que no coincide con el indicativo solicitado.' };
      }
      const email = normalizeEmail(profile.email || '');
      const name = String(profile.name || profile.nick || '').trim();
      const country = String(profile.country || '').trim();
      const grid = String(profile.location?.grid || profile.grid || '').trim();
      return { email, name, country, grid, hamqthFound: true, emailSource: email ? 'hamqth' : '' };
    } catch (error) {
      return { hamqthError: 'No se pudo consultar HamQTH: ' + (error instanceof Error ? error.message : 'error desconocido') };
    }
  }

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

  // PRUEBA 1: sesión web QRZ sin XML. Es la vía prioritaria para el campo
  // "Email: Use mouse to view". Solo si no funciona, probar la vía XML opcional.
  const webProfile = await lookupWithQRZWebLogin(
    String(body.user || '').trim(),
    String(body.pass || ''),
    call
  );
  if (webProfile.email) email = webProfile.email;
  if (!name && webProfile.name) name = webProfile.name;

  // Alternativa: HamQTH puede proporcionar el correo del perfil si QRZ no lo devuelve.
  // Solo se acepta un registro cuyo indicativo coincide exactamente con el consultado.
  const hamqthProfile = email ? {} : await lookupWithHamQTH(
    String(body.hamqthUser || '').trim(),
    String(body.hamqthPass || ''),
    call
  );
  if (!email && hamqthProfile.email) email = hamqthProfile.email;
  if (!name && hamqthProfile.name) name = hamqthProfile.name;
  if (!country && hamqthProfile.country) country = hamqthProfile.country;
  if (!grid && hamqthProfile.grid) grid = hamqthProfile.grid;

  // Si QRZ no devolvió correo y HamQTH tampoco, intentar la API XML autorizada de QRZ.
  // Nunca sustituir el correo por uno encontrado en scripts o en el pie de página.
  const xmlProfile = email ? {} : await lookupWithAuthorizedQRZXml(
    String(body.user || '').trim(),
    String(body.pass || ''),
    call
  );
  // Fuente exclusiva del correo: ficha XML autenticada del indicativo consultado.
  // Nunca conservar ni sustituirlo por una coincidencia del HTML público.
  email = email || xmlProfile.email || '';
  const emailSource = webProfile.email ? webProfile.emailSource : (hamqthProfile.email ? 'hamqth' : (xmlProfile.emailSource || (email ? 'qrz-xml' : '')));
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

  // El correo solo se acepta de una respuesta del indicativo exacto en HamQTH
  // o de una consulta autenticada de QRZ. Los teléfonos solo se aceptan si
  // aparecen explícitamente como contacto en el perfil público.
  return res.status(200).json({
    callsign: call, name, country, grid, email,
    phone, whatsapp, whatsappRaw,
    source: email ? emailSource : (hamdbFound ? 'hamdb' : 'qrz'),
    foundSource: email ? emailSource : (hamdbFound ? 'hamdb' : 'qrz'),
    sources: ['qrz', ...(hamdbFound ? ['hamdb'] : []), ...(email ? [emailSource] : [])],
    accessError: !email ? (hamqthProfile.hamqthError || webProfile.webLoginError || accessError || 'Ni QRZ ni HamQTH devolvieron un correo para este indicativo. El teléfono/WhatsApp se informa únicamente si figura como contacto público.') : ''
  });
}
