# Buzón compartido eQSL POST

## Flujo programado en esta rama

- El acceso al buzón aparece junto al indicativo del perfil en el encabezado solo cuando el dispositivo tiene un indicativo registrado mediante el mismo mecanismo del chat comunitario.
- La identidad es la combinación del indicativo registrado en `community_call_signs` y el token de identidad de ese dispositivo. El servidor verifica el token con la RPC `resolve_community_callsign` antes de listar tarjetas; conocer solo el indicativo no habilita la consulta.
- Al compartir una eQSL, el servidor conserva el enlace compartido existente y deposita una copia en el buzón POST privado de Vercel Blob del indicativo destinatario.
- El botón de buzón aparece junto al indicativo en el encabezado. Un contador rojo muestra la cantidad de eQSL nuevas sin leer; no se muestra si el contador es cero.
- Al abrir el buzón, las tarjetas que ya estaban recibidas se marcan como leídas y el contador desaparece. Cada eQSL nueva vuelve a incrementar el contador.
- El buzón permite ver las tarjetas y responder usando el editor eQSL existente.
- El almacenamiento utiliza la variable `BLOB_READ_WRITE_TOKEN` y la configuración de Supabase ya utilizada por el chat. No requiere una migración nueva de Supabase.
- Las tarjetas compartidas caducan a los 180 días; no se eliminan ni reemplazan los canales de WhatsApp, Telegram o correo.

## Pruebas pendientes antes de producción

1. Ejecutar `npm run lint` y `npm run build`.
2. Registrar una señal distintiva en el chat en el dispositivo A y verificar que aparece el botón de buzón junto al indicativo.
3. Enviar una eQSL a esa señal desde el dispositivo B y verificar que el contador rojo aparece con 1 y aumenta con nuevas tarjetas.
4. Abrir el buzón y confirmar que el contador desaparece; enviar otra tarjeta y comprobar que vuelve a aparecer.
5. Confirmar que una consulta con el indicativo correcto pero con token incorrecto es rechazada.
6. Abrir la tarjeta, comprobar la imagen y los datos, responder y verificar que la respuesta llega al buzón del remitente.

## Configuración requerida

El servidor necesita `BLOB_READ_WRITE_TOKEN`, `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (o sus equivalentes `SUPABASE_URL` y `SUPABASE_ANON_KEY`) para guardar las tarjetas y comprobar la identidad del dispositivo.

Esta rama está preparada para revisión; aún no se ha confirmado la compilación ni el funcionamiento entre dos dispositivos y no está publicada en producción.
