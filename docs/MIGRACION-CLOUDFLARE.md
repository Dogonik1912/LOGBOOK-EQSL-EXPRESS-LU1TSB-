# Prueba de compatibilidad de LogBook eQSL Express en Cloudflare Pages

## Copia segura
- La rama `backup-full-advances-2026-10-24` conserva el estado completo del repositorio en el commit `c34a5c31d7a2e7434969ccbe2e9f9a6aefef7e93`.
- Esta prueba está aislada en `cloudflare-compat-test-2026-10-24`.
- No cambiar ni borrar el proyecto ni el dominio de Vercel. Vercel sigue siendo el alojamiento principal mientras se prueba el alternativo.

## Compilación del frontend
- Framework: Vite + React.
- Comando de compilación: `npm install && npm run build`.
- Directorio de salida: `dist`.
- No existe `package-lock.json` en la rama base; por eso la primera instalación usa `npm install`, no `npm ci`.

## Funciones de servidor
Cloudflare Pages no ejecuta automáticamente las funciones del directorio `api/` de Vercel. Las rutas `functions/api/eqsl-share.js`, `functions/api/lookup.js`, `functions/api/qrz.js` y `functions/api/directory.js` son adaptadores iniciales de las rutas de Vercel para Cloudflare Pages Functions. Se agregó `wrangler.toml` con compatibilidad Node.js para la consulta QRZ heredada.

**Migración aún no validada de extremo a extremo:** falta probar las rutas contra el proyecto Supabase real, QRZ y el flujo completo de envío/recepción/respuesta. No publicar como reemplazo principal ni dar por probado el servicio hasta completar esas pruebas.

## Configuración al crear un proyecto Pages de prueba
1. Importar el repositorio `Dogonik1912/LOGBOOK-EQSL-EXPRESS-LU1TSB-` desde GitHub.
2. Elegir únicamente la rama `cloudflare-compat-test-2026-10-24`.
3. Build command: `npm install && npm run build`; output directory: `dist`.
4. Añadir como secretos de Pages `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, con los mismos valores que usa el backend actual. No guardarlos en GitHub ni en archivos del repositorio.
5. No cambiar DNS ni dominio de Vercel. Probar primero la URL temporal de Pages.
6. Verificar pantalla inicial, recarga, modo instalado, generación y descarga de eQSL, envío/recepción por enlace, respuesta, imagen personalizada, marca de agua permanente, QRZ, directorio y persistencia.
7. Si alguna prueba falla, dejar Pages como prueba y continuar en Vercel. La copia de respaldo permanece intacta.

## Criterio de aceptación
No considerar la migración completa hasta que la compilación termine correctamente y todas las rutas de servidor estén adaptadas y verificadas. Las credenciales y el almacenamiento de Supabase no deben exponerse al navegador.
