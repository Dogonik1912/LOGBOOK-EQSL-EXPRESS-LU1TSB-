import type { IncomingMessage, ServerResponse } from 'node:http';

type UploadBody = {
  username?: string;
  password?: string;
  callsign?: string;
  stationCallsign?: string;
  date?: string;
  time?: string;
  band?: string;
  frequency?: string;
  mode?: string;
  rstSent?: string;
  rstRcvd?: string;
  grid?: string;
};

const field = (name: string, value: string) => value ? `<${name}:${value.length}>${value}` : '';

export default async function handler(req: IncomingMessage & { method?: string; body?: any }, res: ServerResponse) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.statusCode = 405; res.end(JSON.stringify({ error: 'Use POST' })); return; }
  try {
    let body = req.body;
    if (!body || typeof body !== 'object') {
      const chunks: Uint8Array[] = [];
      for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
    }
    const data = body as UploadBody;
    const username = String(data.username || '').trim();
    const password = String(data.password || '');
    const call = String(data.callsign || '').trim().toUpperCase();
    const station = String(data.stationCallsign || '').trim().toUpperCase();
    const date = String(data.date || '').replace(/-/g, '');
    const time = String(data.time || '').replace(/:/g, '').padEnd(4, '0').slice(0, 6);
    const band = String(data.band || '').trim().toUpperCase();
    const mode = String(data.mode || '').trim().toUpperCase();
    if (!username || !password || !/^[A-Z0-9/]{3,20}$/.test(call) || !/^[A-Z0-9/]{3,20}$/.test(station) ||
        !/^\d{8}$/.test(date) || !/^\d{4,6}$/.test(time) || !band || !mode) {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Faltan credenciales o datos obligatorios del QSO.' })); return;
    }
    const freq = String(data.frequency || '').trim();
    const adif = '<ADIF_VER:5>3.1.4<EOH>' + [
      field('CALL', call), field('QSO_DATE', date), field('TIME_ON', time),
      field('BAND', band), field('MODE', mode), field('STATION_CALLSIGN', station),
      field('RST_SENT', String(data.rstSent || '')), field('RST_RCVD', String(data.rstRcvd || '')),
      field('FREQ', freq), field('GRIDSQUARE', String(data.grid || '')), '<EOR>'
    ].join('');
    const form = new FormData();
    form.set('Filename', new Blob([adif], { type: 'text/plain;charset=utf-8' }), 'qso.adi');
    form.set('EQSL_USER', username);
    form.set('EQSL_PSWD', password);
    const upstream = await fetch('https://www.eqsl.cc/qslcard/ImportADIF.cfm', {
      method: 'POST',
      headers: { 'User-Agent': 'LogBook-eQSL-Express/1.2 (LU1TSB)', 'Accept': 'text/html,text/plain' },
      body: form,
      signal: AbortSignal.timeout(20000)
    });
    const resultHtml = await upstream.text();
    const resultText = resultHtml.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();
    const added = resultText.match(/Result:\s*(\d+)\s+out of\s+(\d+)\s+records added/i);
    if (!upstream.ok || !added || Number(added[1]) !== 1) {
      const duplicate = /Bad record:\s*Duplicate/i.test(resultText);
      res.statusCode = duplicate ? 409 : 502;
      res.end(JSON.stringify({ error: duplicate ? 'eQSL.cc indica que este QSO ya estaba cargado.' : (resultText.slice(0, 500) || 'eQSL.cc no confirmó la carga.'), duplicate }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, message: 'QSO cargado individualmente en eQSL.cc.', details: resultText.slice(0, 300) }));
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Error de conexión con eQSL.cc.' }));
  }
}
