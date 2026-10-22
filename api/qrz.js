export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('<?xml version="1.0"?><QRZDatabase><Error>Method not allowed</Error></QRZDatabase>');
  }

  const body = req.body || {};
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  const sessionKey = String(body.sessionKey || '').trim();
  const callsign = String(body.callsign || '').trim().toUpperCase();

  // Two supported operations:
  // 1) Authenticate the operator's own QRZ XML account and return its session key.
  // 2) Use a previously issued QRZ XML session key to request one exact callsign.
  let url;
  if (sessionKey) {
    if (!/^[A-Z0-9/]{3,20}$/.test(callsign)) {
      return res.status(400).send('<?xml version="1.0"?><QRZDatabase><Error>Invalid callsign</Error></QRZDatabase>');
    }
    url = 'https://xmldata.qrz.com/xml/current/?s=' +
      encodeURIComponent(sessionKey) + ';callsign=' + encodeURIComponent(callsign);
  } else {
    if (!username || !password) {
      return res.status(400).send('<?xml version="1.0"?><QRZDatabase><Error>Username and password are required</Error></QRZDatabase>');
    }
    url = 'https://xmldata.qrz.com/xml/current/?username=' +
      encodeURIComponent(username) + ';password=' + encodeURIComponent(password) +
      ';agent=' + encodeURIComponent('LOGBOOK-EQSL-EXPRESS-LU1TSB');
  }

  try {
    const upstream = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/xml,text/xml;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(12000),
      redirect: 'follow'
    });
    const xml = await upstream.text();

    // Keep QRZ's XML error details so the UI can explain login/subscription issues.
    // Never log or return the URL because it contains credentials/session keys.
    if (!upstream.ok) {
      return res.status(502).send('<?xml version="1.0"?><QRZDatabase><Error>QRZ upstream HTTP ' + upstream.status + '</Error></QRZDatabase>');
    }
    return res.status(200).send(xml);
  } catch {
    return res.status(502).send('<?xml version="1.0"?><QRZDatabase><Error>Could not reach QRZ XML service</Error></QRZDatabase>');
  }
}
