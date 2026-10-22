import type { IncomingMessage, ServerResponse } from 'node:http';

function decode(value: string): string {
  return value.replace(/&amp;/gi, '&').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>');
}
function normalizePhone(raw: string): string {
  let n = raw.replace(/\D/g, '');
  if (n.startsWith('00')) n = n.slice(2);
  if (n.startsWith('0') && n.length >= 10) n = n.slice(1);
  if (n.length === 10 && n.startsWith('9')) n = '549' + n.slice(1);
  if (n.length === 10 && !n.startsWith('54')) n = '54' + n;
  return n.length >= 8 && n.length <= 15 ? n : '';
}
export default async function handler(req: IncomingMessage & { method?: string; body?: any }, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Use POST' })); return; }
  try {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
    }
    const call = String(body.call || '').trim().toUpperCase();
    if (!/^[A-Z0-9/]{3,15}$/.test(call)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'Indicativo no válido' })); return; }
    const profileRes = await fetch('https://www.qrz.com/db/' + encodeURIComponent(call), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LogBook-eQSL-Express/1.0)', 'Accept-Language': 'es,en;q=0.8' },
      signal: AbortSignal.timeout(10000),
    });
    if (!profileRes.ok) { res.end(JSON.stringify({ callsign: call, email: '', whatsapp: '', whatsappRaw: '', foundSource: '' })); return; }
    const html = await profileRes.text();
    let bio = '';
    const b64 = html.match(/Base64\.decode\(\s*["']([A-Za-z0-9+/=]+)["']\s*\)/i);
    if (b64?.[1]) { try { bio = Buffer.from(b64[1], 'base64').toString('utf8'); } catch { bio = ''; } }
    const emailOk = (candidate: string) => {
      const e = decode(candidate).trim().replace(/^mailto:/i, '').split(/[?\s"'<>]/)[0];
      return /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(e) && !/(?:example\.com|sentry|cloudflare|google|qrz\.com)$/i.test(e.split('@')[1] || '');
    };
    const mailto = [...html.matchAll(/href\s*=\s*["']mailto:([^"'?]+)(?:\?[^"']*)?["']/gi)].map(m => m[1]).find(emailOk);
    const bioEmail = [...bio.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)].map(m => m[0]).find(emailOk);
    // Never search all HTML for emails: menus, scripts, and unrelated groups can contaminate the result.
    const email = mailto || bioEmail || '';
    let whatsapp = '', whatsappRaw = '';
    const hrefs = [...html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(m => decode(m[1]));
    for (const href of hrefs) {
      if (!/(?:wa\.me\/|api\.whatsapp\.com\/send|whatsapp\.com\/send)/i.test(href)) continue;
      try {
        const u = new URL(href, 'https://www.qrz.com');
        const raw = u.searchParams.get('phone') || (u.hostname.toLowerCase() === 'wa.me' ? u.pathname.split('/').filter(Boolean)[0] : '');
        const normalized = normalizePhone(raw);
        if (normalized) { whatsapp = normalized; whatsappRaw = raw; break; }
      } catch { /* ignore invalid href */ }
    }
    if (!whatsapp) {
      const labelled = bio.match(/(?:whatsapp|wsp|celular|m[oó]vil|tel[eé]fono)\s*[:：]?\s*([+\d][\d\s().-]{7,22})/i);
      if (labelled?.[1]) { whatsapp = normalizePhone(labelled[1]); if (whatsapp) whatsappRaw = labelled[1].trim(); }
    }
    const nm = html.match(/<span class=["']m0["'][^>]*>([^<]+)<\/span>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const grid = html.match(/Grid Square:<\/td>\s*<td[^>]*>([A-R]{2}[0-9]{2}[A-X]{2})/i) || bio.match(/\b([A-R]{2}[0-9]{2}[A-X]{2})\b/i);
    const country = html.match(/Country:<\/td>\s*<td[^>]*>([^<]+)</i);
    res.end(JSON.stringify({
      callsign: call, name: nm ? decode(nm[1].replace(/<[^>]*>/g, '')).trim() : '',
      country: country ? decode(country[1]).trim() : '', grid: grid ? grid[1].trim() : '',
      email, whatsapp, whatsappRaw,
      foundSource: [mailto ? 'qrz-profile-mailto' : bioEmail ? 'qrz-profile-bio' : '', whatsapp ? 'qrz-profile-whatsapp' : ''].filter(Boolean).join('+'),
    }));
  } catch (e) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'No se pudo consultar el perfil público' }));
  }
}
