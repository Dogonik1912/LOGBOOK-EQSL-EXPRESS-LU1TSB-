import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'qrz-proxy',
        configureServer(server) {
          // Endpoint de consulta y cruce de datos QRZ (Web scraping + Bio decoding + XML)
          server.middlewares.use('/api/lookup', async (req, res) => {
            try {
              const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
              const call = (url.searchParams.get('call') || '').trim().toUpperCase();
              const qrzUser = url.searchParams.get('user') || '';
              const qrzPass = url.searchParams.get('pass') || '';

              if (!call) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'Callsign required' }));
                return;
              }

              let email = '';
              let whatsapp = '';
              let whatsappRaw = '';
              let name = '';
              let country = '';
              let grid = '';
              let bioText = '';
              let foundSource = '';

              // 1. Obtener página pública de QRZ (contiene la biografía en Base64 donde muchos hams publican su WhatsApp o email)
              try {
                const pageRes = await fetch(`https://www.qrz.com/db/${encodeURIComponent(call)}`, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
                  },
                });

                if (pageRes.ok) {
                  const html = await pageRes.text();

                  // Decodificar biografía en Base64 si existe
                  const b64Match = html.match(/Base64\.decode\("([A-Za-z0-9+/=]+)"\)/);
                  if (b64Match && b64Match[1]) {
                    try {
                      bioText = Buffer.from(b64Match[1], 'base64').toString('utf-8');
                    } catch (e) {
                      // ignore
                    }
                  }

                  // Extraer nombre del operador
                  const nameMatch = html.match(/<span class="m0"[^>]*>([^<]+)<\/span>/i) ||
                    html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                    html.match(/title="<b class='f12 blue'>([^<]+)<\/b>"/i);
                  if (nameMatch) {
                    name = nameMatch[1].trim();
                  }

                  // Extraer Grid Locator si está en el HTML
                  const gridMatch = html.match(/Grid Square:<\/td><td[^>]*>([A-Za-z0-9]+)/i) ||
                    html.match(/([A-R]{2}[0-9]{2}[a-x]{2})/i);
                  if (gridMatch) {
                    grid = gridMatch[1].trim();
                  }

                  // Extraer País
                  const countryMatch = html.match(/Country:<\/td><td[^>]*>([^<]+)<\/td>/i);
                  if (countryMatch) {
                    country = countryMatch[1].trim();
                  }

                  // 2. Extraer WhatsApp / Teléfono del texto de la biografía o del HTML
                  const fullTextToScan = `${bioText} ${html}`;

                  // Patrón de WhatsApp / Celular / Móvil
                  const waPattern = /(?:whatsapp|wsp|wa|cel|tel|movil|móvil|celular|telefono|teléfono)[:\s]*([+0-9\s-]{8,25})/i;
                  const waFound = fullTextToScan.match(waPattern);
                  if (waFound && waFound[1]) {
                    whatsappRaw = waFound[1].trim();
                    let clean = whatsappRaw.replace(/[^0-9]/g, '');
                    if (clean.startsWith('00')) clean = clean.slice(2);
                    // Si empieza con 9 y código de área argentino sin país
                    if (clean.length === 10 && clean.startsWith('9')) clean = '54' + clean;
                    if (clean.length >= 8) {
                      whatsapp = clean;
                      foundSource = 'qrz-bio-whatsapp';
                    }
                  }

                  // 3. Extraer Email de la biografía o HTML
                  const emailPattern = /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi;
                  const emailsFound = fullTextToScan.match(emailPattern);
                  if (emailsFound) {
                    // Filtrar dominios de anuncios o tracking
                    const validEmails = emailsFound.filter(em => 
                      !em.includes('google') && 
                      !em.includes('qrz.com') && 
                      !em.includes('sentry') &&
                      !em.includes('example.com') &&
                      !em.includes('cloudflare')
                    );
                    if (validEmails.length > 0) {
                      email = validEmails[0];
                      foundSource = foundSource ? `${foundSource}+email` : 'qrz-bio-email';
                    }
                  }
                }
              } catch (scrapeErr) {
                console.warn('QRZ Web Scraping error:', scrapeErr);
              }

              // 4. Si el usuario proporcionó credenciales QRZ, consultar la API XML para email oficial
              if (qrzUser && qrzPass && (!email || !grid)) {
                try {
                  const authQuery = new URLSearchParams({
                    username: qrzUser,
                    password: qrzPass,
                    agent: 'LogBook-eQSL-Express-1.0',
                  }).toString();

                  const authRes = await fetch(`https://xmldata.qrz.com/xml/current/?${authQuery}`);
                  if (authRes.ok) {
                    const authXml = await authRes.text();
                    const keyMatch = authXml.match(/<Key>([^<]+)<\/Key>/);
                    if (keyMatch) {
                      const sessionKey = keyMatch[1];
                      const dataRes = await fetch(`https://xmldata.qrz.com/xml/current/?s=${sessionKey};callsign=${encodeURIComponent(call)}`);
                      if (dataRes.ok) {
                        const dataXml = await dataRes.text();
                        const xmlEmail = dataXml.match(/<email>([^<]+)<\/email>/);
                        if (xmlEmail && xmlEmail[1]) {
                          email = xmlEmail[1].trim();
                          foundSource = 'qrz-xml';
                        }
                        const xmlFname = dataXml.match(/<fname>([^<]+)<\/fname>/);
                        const xmlName = dataXml.match(/<name>([^<]+)<\/name>/);
                        if (xmlFname || xmlName) {
                          const fNameStr = [xmlFname?.[1], xmlName?.[1]].filter(Boolean).join(' ');
                          if (fNameStr && !name) name = fNameStr;
                        }
                        const xmlGrid = dataXml.match(/<grid>([^<]+)<\/grid>/);
                        if (xmlGrid && xmlGrid[1] && !grid) grid = xmlGrid[1].trim();
                        const xmlCountry = dataXml.match(/<country>([^<]+)<\/country>/);
                        if (xmlCountry && xmlCountry[1] && !country) country = xmlCountry[1].trim();
                      }
                    }
                  }
                } catch (xmlErr) {
                  console.warn('QRZ XML lookup error:', xmlErr);
                }
              }

              // 5. Fallback inteligente de correo para radioaficionados según país si aún no tiene
              // En radioafición, cada asociación tiene forwards estándar
              if (!email && !whatsapp) {
                const callClean = call.toUpperCase();
                if (callClean.startsWith('EA') || callClean.startsWith('EB') || callClean.startsWith('EC')) {
                  email = `${callClean.toLowerCase()}@ure.es`;
                } else if (callClean.startsWith('LU') || callClean.startsWith('LW')) {
                  email = `${callClean.toLowerCase()}@qrz.com`;
                } else if (callClean.startsWith('PY')) {
                  email = `${callClean.toLowerCase()}@labre.org.br`;
                } else if (/^[WKN][A-Z]?[0-9]/.test(callClean)) {
                  email = `${callClean.toLowerCase()}@arrl.net`;
                }
              }

              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(JSON.stringify({
                callsign: call,
                name,
                country,
                grid,
                email,
                whatsapp,
                whatsappRaw,
                foundSource: foundSource || 'inferred',
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Error processing lookup' }));
            }
          });

          // Endpoint proxy directo de QRZ XML
          server.middlewares.use('/api/qrz', async (req, res) => {
            try {
              const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`);
              const targetUrl = `https://xmldata.qrz.com/xml/current/${url.search}`;
              const upstreamRes = await fetch(targetUrl, {
                headers: {
                  'User-Agent': 'LogBook-eQSL-Express/1.0 (LU1TSB)',
                },
              });
              const text = await upstreamRes.text();
              res.setHeader('Content-Type', 'application/xml; charset=utf-8');
              res.setHeader('Access-Control-Allow-Origin', '*');
              res.end(text);
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'text/plain');
              res.end(err?.message || 'Error fetching QRZ data');
            }
          });
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
