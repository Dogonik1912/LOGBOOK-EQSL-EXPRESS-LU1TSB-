/**
 * Proxy de solo lectura para el catálogo público oficial de LLOTA.
 * Mantiene la llamada en el mismo origen de LogBook y evita depender de CORS.
 */
const OFFICIAL_LLOTA_URL = 'https://llota.app/api/public/references?version=lite';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Método no permitido.' });
  }

  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=43200');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(OFFICIAL_LLOTA_URL, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error('[llota-references] official catalogue returned', response.status);
      return res.status(502).json({ error: 'El catálogo oficial LLOTA no está disponible temporalmente.' });
    }
    const catalogue = await response.json();
    return res.status(200).json(catalogue);
  } catch (error) {
    console.error('[llota-references] official catalogue request failed:', String(error?.message || error));
    return res.status(502).json({ error: 'No se pudo consultar el catálogo oficial LLOTA.' });
  } finally {
    clearTimeout(timeout);
  }
}
