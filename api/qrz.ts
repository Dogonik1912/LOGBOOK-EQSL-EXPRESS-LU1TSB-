import type { IncomingMessage, ServerResponse } from 'node:http';

type QRZRequest = { username?: unknown; password?: unknown; sessionKey?: unknown; callsign?: unknown };
type QRZIncomingMessage = IncomingMessage & { method?: string; body?: unknown };

const MAX_BODY_BYTES = 16 * 1024;
const CALLSIGN_RE = /^[A-Z0-9][A-Z0-9/.-]{1,23}$/;
const xmlError = (res: ServerResponse, status: number, message: string) => {
  res.statusCode = status;
  res.end(`<Error>${message}</Error>`);
};

export default async function handler(req: QRZIncomingMessage, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    xmlError(res, 405, 'Use POST');
    return;
  }

  const contentLength = Number(req.headers['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    xmlError(res, 413, 'Request too large');
    return;
  }

  try {
    let body: unknown = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      for await (const chunk of req) {
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        totalBytes += bytes.byteLength;
        if (totalBytes > MAX_BODY_BYTES) {
          xmlError(res, 413, 'Request too large');
          return;
        }
        chunks.push(bytes);
      }
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
      } catch {
        xmlError(res, 400, 'Invalid JSON');
        return;
      }
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      xmlError(res, 400, 'Invalid request');
      return;
    }

    const input = body as QRZRequest;
    const params = new URLSearchParams();

    if (typeof input.username === 'string' && typeof input.password === 'string') {
      const username = input.username.trim();
      if (!username || username.length > 128 || input.password.length < 1 || input.password.length > 256) {
        xmlError(res, 400, 'Invalid QRZ credentials format');
        return;
      }
      params.set('username', username);
      params.set('password', input.password);
      params.set('agent', 'LogBook-eQSL-Express/1.1');
    } else if (typeof input.sessionKey === 'string' && typeof input.callsign === 'string') {
      const sessionKey = input.sessionKey.trim();
      const callsign = input.callsign.trim().toUpperCase();
      if (!sessionKey || sessionKey.length > 1024 || !CALLSIGN_RE.test(callsign)) {
        xmlError(res, 400, 'Invalid QRZ lookup parameters');
        return;
      }
      params.set('s', sessionKey);
      params.set('callsign', callsign);
    } else {
      xmlError(res, 400, 'Missing QRZ login or lookup parameters');
      return;
    }

    const upstream = await fetch('https://xmldata.qrz.com/xml/current/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'LogBook-eQSL-Express/1.1',
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    res.statusCode = upstream.status;
    res.end(await upstream.text());
  } catch {
    // Never return upstream/internal exception details to the public caller.
    xmlError(res, 502, 'QRZ request failed');
  }
}
