import type { IncomingMessage, ServerResponse } from 'node:http';

type UploadBody = {
  key?: string;
  callsign?: string;
  stationCallsign?: string;
  date?: string;
  time?: string;
  band?: string;
  frequency?: string;
  mode?: string;
  rstSent?: string;
  rstRcvd?: string;
};

const adifField = (name: string, value: string) => value ? `<${name}:${value.length}>${value}` : '';

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
    const key = String(data.key || '').trim();
    const call = String(data.callsign || '').trim().toUpperCase();
    const station = String(data.stationCallsign || '').trim().toUpperCase();
    const date = String(data.date || '').replace(/-/g, '');
    const time = String(data.time || '').replace(/:/g, '').padEnd(4, '0').slice(0, 6);
    const band = String(data.band || '').trim().toUpperCase();
    const mode = String(data.mode || '').trim().toUpperCase();
    if (!key || !/^[A-Z0-9/]{3,20}$/.test(call) || !/^[A-Z0-9/]{3,20}$/.test(station) ||
        !/^\d{8}$/.test(date) || !/^\d{4,6}$/.test(time) || !band || !mode) {
      res.statusCode = 400; res.end(JSON.stringify({ error: 'Faltan datos obligatorios o el indicativo no es válido.' })); return;
    }
    const freq = String(data.frequency || '').trim();
    const adif = [
      adifField('CALL', call), adifField('QSO_DATE', date), adifField('TIME_ON', time),
      adifField('BAND', band), adifField('MODE', mode), adifField('STATION_CALLSIGN', station),
      adifField('RST_SENT', String(data.rstSent || '')), adifField('RST_RCVD', String(data.rstRcvd || '')),
      adifField('FREQ', freq), '<EOR>'
    ].join('');
    const params = new URLSearchParams({ KEY: key, ACTION: 'INSERT', ADIF: adif });
    const upstream = await fetch('https://logbook.qrz.com/api', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'User-Agent': 'LogBook-eQSL-Express/1.2 (LU1TSB)',
        'Accept': 'text/plain'
      },
      body: params.toString(),
      signal: AbortSignal.timeout(15000)
    });
    const responseText = await upstream.text();
    const result = responseText.match(/(?:^|&)RESULT=([^&\s]+)/i)?.[1] || '';
    const reason = responseText.match(/(?:^|&)REASON=([^&]+)/i)?.[1] || '';
    if (!upstream.ok || result.toUpperCase() !== 'OK') {
      res.statusCode = result.toUpperCase() === 'AUTH' ? 403 : 502;
      res.end(JSON.stringify({ error: decodeURIComponent(reason.replace(/\+/g, ' ')) || responseText.slice(0, 400) || 'QRZ no confirmó la carga.', result }));
      return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ success: true, result, logids: responseText.match(/(?:^|&)LOGIDS=([^&]+)/i)?.[1] || '', count: responseText.match(/(?:^|&)COUNT=([^&]+)/i)?.[1] || '1' }));
  } catch (error) {
    res.statusCode = 502;
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Error de conexión con QRZ.' }));
  }
}
