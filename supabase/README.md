# Directorio mundial de LogBook eQSL Express

## Activación de la base de datos

La API y los archivos SQL por sí solos no crean la base remota. Para activar el directorio:

1. Abrí el proyecto Supabase que se usará para LogBook.
2. En **SQL Editor**, ejecutá primero `migrations/202610230001_worldwide_directory.sql` y después `migrations/202610230002_directory_stats.sql`.
3. En Vercel, configurá `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` en Production y Preview. La clave `service_role` es secreta: nunca debe incluirse en código del navegador ni publicarse.
4. Volvé a desplegar y probá `/api/directory?action=count`; una respuesta correcta tiene `activeUsers` y `totalActions`. Sin variables o sin migraciones, la API debe informar que el directorio no está configurado.

## Qué contabiliza

- `activeUsers`: indicativos únicos con al menos una acción eQSL registrada.
- `totalActions`: acciones explícitas registradas por la aplicación al iniciar un envío/compartición eQSL.
- El registro es atómico en la base de datos para evitar perder incrementos simultáneos.
- Estos números describen acciones iniciadas desde la app, no confirman que WhatsApp, Telegram o el proveedor de correo hayan entregado el mensaje.

## Privacidad y publicación de contactos

- Las consultas públicas solo devuelven registros con `contact_public = true`.
- No se deben publicar los datos de un corresponsal porque otra persona los haya escrito en su QSO.
- La publicación necesita consentimiento explícito del titular de la estación. Antes de habilitarla mundialmente, también debe implementarse una comprobación razonable de titularidad y una forma segura de corregir o retirar los datos; una casilla de consentimiento por sí sola no impide la suplantación de indicativos.
- No cargues datos de prueba inventados en el directorio real.

## Estado de implementación

Los archivos SQL preparan la tabla y funciones atómicas. Las migraciones deben ejecutarse en el proyecto Supabase real y las variables de Vercel deben verificarse antes de declarar operativo el directorio mundial.
