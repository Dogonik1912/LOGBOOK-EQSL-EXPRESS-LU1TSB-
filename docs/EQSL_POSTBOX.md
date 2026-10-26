# Buzón compartido eQSL POST

## Flujo implementado en esta rama

- Al crear un enlace eQSL con `POST /api/eqsl-share`, el servidor guarda la tarjeta en Vercel Blob privado y deposita una copia en `eqsl-inbox/<sha256-del-indicativo>/<id>.json`.
- La bandeja consulta `GET /api/eqsl-share?inbox=<INDICATIVO>`, lista las tarjetas vigentes y carga la imagen completa solamente cuando se abre una tarjeta.
- La pantalla principal reemplaza el recuadro «Estaciones activas · sin datos verificados» por un acceso amarillo «POST».
- La bandeja reúne el indicativo principal y el de 11 metros si ambos están guardados en el dispositivo.
- «Responder con mi eQSL» abre el editor de respuesta existente y precarga remitente, destinatario y datos del QSO. No se elimina ni reemplaza el flujo de envío actual por WhatsApp, Telegram o correo.
- Las tarjetas caducan a los 180 días, igual que los enlaces eQSL existentes.

## Requisito de Vercel

La función usa la misma variable `BLOB_READ_WRITE_TOKEN` que ya utiliza `api/eqsl-share.js`. El almacenamiento privado debe estar conectado al proyecto de Vercel. No requiere una migración de Supabase.

## Pruebas pendientes antes de producción

1. Ejecutar `npm run lint` y `npm run build`.
2. En un despliegue Preview, enviar una eQSL a un indicativo de prueba y comprobar que aparece en POST en otro navegador/dispositivo.
3. Abrir la tarjeta, comprobar imagen y datos, responderla y verificar que la respuesta llega al buzón del remitente.
4. Comprobar las dos identidades (indicativo principal y 11 m), caducidad y errores de almacenamiento.

## Consideración de privacidad

Los archivos de Blob se guardan como privados y la API no entrega la imagen en el listado inicial. Sin embargo, en esta versión la consulta de la bandeja se identifica solo por indicativo, sin cuenta ni secreto de buzón; por tanto, alguien que conozca un indicativo podría consultar el listado de sus tarjetas. No debe describirse como una bandeja privada frente a terceros hasta añadir una forma de reclamar/proteger el buzón compatible con el requisito de no exigir registro.
