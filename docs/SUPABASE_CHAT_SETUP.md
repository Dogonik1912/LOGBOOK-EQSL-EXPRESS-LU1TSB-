# Configurar el chat real de LogBook eQSL EXPRESS

Esta rama prepara el código; el chat **no queda activo** hasta conectar un proyecto Supabase y completar la prueba desde dos sesiones distintas.

## 1. Crear el proyecto
1. Entrá en https://supabase.com/ y creá un proyecto nuevo con tu cuenta.
2. Guardá la contraseña de la base de datos en un lugar seguro. No la pegues en el chat.
3. En **Project Settings → API** copiá el **Project URL** y la **publishable key** (o la clave anon heredada, si el panel muestra esa opción). Nunca uses `service_role` en el frontend.

## 2. Crear la tabla protegida
1. Abrí **SQL Editor** en el panel del proyecto.
2. Ejecutá en orden `supabase/migrations/202610250001_community_chat.sql` y luego `supabase/migrations/202610250002_public_device_chat.sql` en el SQL Editor. La segunda migración habilita lectura pública sin cuenta, registro único del indicativo por dispositivo y publicación de mensajes mediante RPC.
3. No hace falta activar autenticación por correo para el chat comunitario: el acceso es público y sin registro. El indicativo queda bloqueado con un token persistente del dispositivo; no se usa la IP como identificador único porque puede cambiar o compartirse.

## 3. Configurar Vercel
En el proyecto `logbook-eqsl-express-lu-1-tsb`, abrí **Settings → Environment Variables** y agregá:
- `VITE_SUPABASE_URL`: Project URL.
- `VITE_SUPABASE_ANON_KEY`: publishable/anon key.

Aplicá las variables al entorno Preview primero. Después de verificar, se podrán agregar a Production. Nunca agregues una clave `service_role` a variables `VITE_` ni al frontend.

## 4. Verificación antes de publicar
- Abrir el chat en dos dispositivos o navegadores diferentes, sin iniciar sesión.
- Registrar indicativos distintos y comprobar que un indicativo no se puede reclamar dos veces.
- Enviar un mensaje desde el primer dispositivo y comprobar que aparece en el segundo en tiempo real o, como respaldo, en un máximo aproximado de cinco segundos.
- Recargar el dispositivo original y comprobar que su indicativo sigue bloqueado.

## Seguridad y límites
Las tablas aplican RLS; los visitantes solo pueden leer mensajes y publicar mediante funciones SQL que verifican el token persistente del dispositivo. El cliente no recibe ninguna clave de administrador. La migración debe ejecutarse en el proyecto Supabase conectado a Vercel antes de que el chat funcione entre dispositivos. Antes de abrir el chat masivamente, conviene agregar límites antiabuso y herramientas de moderación del lado del servidor. No publicar datos personales en mensajes.
