// Directorio comunitario y estadísticas: deshabilitados hasta completar verificación,
// límites antiabuso, consentimiento y protección frente a consultas masivas.
// No se devuelven correos ni se registran indicativos desde una ruta pública.
const json = (res, status, body) => res.status(status).json(body);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');

  if (req.method === 'GET') {
    const action = String(req.query?.action || '');
    if (action === 'lookup') {
      return json(res, 503, {
        error: 'El directorio comunitario aún no está disponible: falta completar la verificación de titulares y la protección contra consultas masivas.',
      });
    }
    if (action === 'count') {
      return json(res, 503, {
        error: 'Las estadísticas compartidas no están disponibles hasta contar con eventos verificables y un registro agregado seguro.',
      });
    }
    return json(res, 400, { error: 'Acción no válida' });
  }

  if (req.method === 'POST') {
    const action = String(req.body?.action || '');
    if (action === 'activity' || action === 'contact') {
      return json(res, 501, {
        error: 'La escritura compartida está deshabilitada hasta implementar consentimiento, verificación y controles antiabuso.',
      });
    }
    return json(res, 400, { error: 'Acción no válida' });
  }

  res.setHeader('Allow', 'GET, POST');
  return json(res, 405, { error: 'Método no permitido' });
}
