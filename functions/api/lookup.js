import { Buffer } from 'node:buffer';
import handler from '../../api/lookup.js';

globalThis.Buffer ??= Buffer;

export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } });
  }
  let body = {};
  try { body = await request.json(); } catch { return Response.json({ error: 'JSON inválido' }, { status: 400 }); }
  let statusCode = 200;
  const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8' });
  const res = {
    setHeader(name, value) { headers.set(name, String(value)); },
    status(code) { statusCode = code; return this; },
    json(value) { return new Response(JSON.stringify(value), { status: statusCode, headers }); },
  };
  return await handler({ method: request.method, body }, res);
}
