import type { IncomingMessage, ServerResponse } from 'node:http';

type QRZRequest = { username?: string; password?: string; sessionKey?: string; callsign?: string };

export default async function handler(req: IncomingMessage & { method?: string; body?: any }, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  if (req.method !== 'POST') { res.statusCode = 405; res.end('<Error>Use POST</Error>'); return; }
  try {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
    }
    const params = new URLSearchParams();
    if (body.username && body.password) {
      params.set('username', String(body.username));
      params.set('password', String(body.password));
      params.set('agent', 'LogBook-eQSL-Express/1.1');
    } else if (body.sessionKey && body.callsign) {
      params.set('s', String(body.sessionKey));
      params.set('callsign', String(body.callsign).trim().toUpperCase());
    } else {
      res.statusCode = 400;
      res.end('<Error>Missing QRZ login or lookup parameters</Error>');
      return;
    }
    const upstream = await fetch('https://xmldata.qrz.com/xml/current/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'LogBook-eQSL-Express/1.1' },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });
    res.statusCode = upstream.status;
    res.end(await upstream.text());
  } catch (error) {
    res.statusCode = 502;
    res.end('<Error>' + (error instanceof Error ? error.message.replace(/[<&>]/g, '') : 'QRZ request failed') + '</Error>');
  }
}
