# LogBook eQSL EXPRESS — seguridad

## Cambios preparados en esta rama

- Cabeceras HTTP defensivas para reducir MIME sniffing, framing/clickjacking, filtración innecesaria del referer y permisos de geolocalización/cámara/micrófono.
- Política CSP inicial limitada a impedir framing, objetos incrustados y cambios de base/formulario. Se mantiene deliberadamente conservadora para no romper integraciones sin probarlas.
- Flujo de GitHub Actions para auditoría de dependencias, comprobación TypeScript y compilación de producción.
- Migración SQL opcional para limitar el chat público: un mensaje por indicativo cada 2 segundos y hasta 120 por hora, con bloqueo transaccional para evitar saltarse el límite mediante solicitudes simultáneas.

## Reglas que no deben romperse

1. Nunca incluir `SUPABASE_SERVICE_ROLE_KEY`, tokens de Vercel Blob, contraseñas SMTP, credenciales QRZ ni claves privadas en código cliente, repositorio o variables `VITE_*`.
2. La clave Supabase publicable/anon puede estar en el navegador, pero la seguridad real debe residir en RLS, permisos SQL y funciones RPC verificadas en el servidor.
3. No confiar en roles, indicativos, puntuaciones ni permisos guardados únicamente en `localStorage` o calculados en React.
4. Mantener las escrituras directas a tablas de moderación revocadas para `anon` y `authenticated`; las acciones privilegiadas deben validar rol y token en SQL.
5. No habilitar un directorio público de contactos sin verificación de titularidad, consentimiento y mecanismos para corregir/eliminar datos.

## Pasos antes de producción

- Revisar el resultado de GitHub Actions; no considerar la seguridad validada si el análisis de dependencias, TypeScript o build falla.
- Revisar los ajustes de secretos y permisos del repositorio GitHub y Vercel.
- En Supabase, verificar RLS y privilegios reales de cada tabla y función; una migración guardada en GitHub no se ejecuta automáticamente en la base remota.
- Si se decide activar el límite antispam, revisar y ejecutar manualmente `supabase/migrations/202610260001_community_chat_rate_limit.sql` en el proyecto Supabase correcto. No se ha aplicado a la base remota por este cambio.
- Probar el chat desde dos dispositivos, el alta/recuperación de indicativo, la moderación, el envío/recepción de eQSL y la carga de la app antes de publicar.

## Limitaciones conocidas

- Un indicativo público sin verificación externa de titularidad no puede probar por sí solo quién es su dueño. La unicidad de la base impide duplicados, pero no impide que alguien reclame primero un indicativo ajeno aún no registrado.
- El límite SQL es por indicativo, no por IP/dispositivo. Un límite por IP necesita un componente confiable del lado servidor o de borde.
- Los enlaces compartidos eQSL funcionan como enlaces portadores: quien tenga el enlace puede ver la tarjeta hasta que caduque. No incluir datos privados que el remitente no quiera compartir.
- Estas medidas reducen riesgos; no equivalen a una auditoría externa ni garantizan inviolabilidad absoluta.
