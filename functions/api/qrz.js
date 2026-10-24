import handler from '../../api/qrz.ts';

export async function onRequest({ request }) {
  if (request.method !== 'POST') {
    return new Response('<Error>Use POST</Error>', { status: 405, headers: { 'Content-Type': 'application/xml; charset=utf-8', Allow: 'POST' } });
  }
  let body = {};
  try { body = await request.json(); } catch { return new Response('<Error>Invalid JSON</Error>', { status: 400, headers: { 'Content-Type': 'application/xml; charset=utf-8' } }); }
  let statusCode = 200;
  let responseBody = '';
  const headers = new Headers({ 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'no-store' });
  const res = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name, String(value)); },
    end(value = '') { responseBody = String(value); statusCode = this.statusCode || statusCode; },
  };
  await handler({ method: request.method, body }, res);
  statusCode = res.statusCode || statusCode;
  return new Response(responseBody, { status: statusCode, headers });
}
