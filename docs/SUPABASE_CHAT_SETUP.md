# Configurar el chat real de LogBook eQSL EXPRESS

Esta rama prepara el código; el chat **no queda activo** hasta conectar un proyecto Supabase y completar la prueba desde dos sesiones distintas.

## 1. Crear el proyecto
1. Entrá en https://supabase.com/ y creá un proyecto nuevo con tu cuenta.
2. Guardá la contraseña de la base de datos en un lugar seguro. No la pegues en el chat.
3. En **Project Settings → API** copiá el **Project URL** y la **publishable key** (o la clave anon heredada, si el panel muestra esa opción). Nunca uses `service_role` en el frontend.

## 2. Crear la tabla protegida
1. Abrí **SQL Editor** en el panel del proyecto.
2. Copiá y ejecutá `supabase/migrations/202610250001_community_chat.sql`.
3. En **Authentication → URL Configuration**, configurá como Site URL el dominio de producción de Vercel y agregá también el dominio de preview que vayas a probar a Redirect URLs.
4. En **Authentication → Sign In / Providers**, verificá que Email esté habilitado. El componente enviará un enlace mágico por correo.

## 3. Configurar Vercel
En el proyecto `logbook-eqsl-express-lu-1-tsb`, abrí **Settings → Environment Variables** y agregá:
- `VITE_SUPABASE_URL`: Project URL.
- `VITE_SUPABASE_ANON_KEY`: publishable/anon key.

Aplicá las variables al entorno Preview primero. Después de verificar, se podrán agregar a Production. Nunca agregues una clave `service_role` a variables `VITE_` ni al frontend.

## 4. Verificación antes de publicar
- Abrir una preview y confirmar que el enlace por correo llega y crea una sesión.
- Abrir una segunda sesión/dispositivo con otra cuenta autenticada.
- Enviar un mensaje y comprobar que aparece en la otra sesión sin recargar.
- Confirmar que un visitante sin sesión no puede leer ni escribir mensajes.
- Revisar el dominio de retorno del enlace mágico y probar cerrar sesión.

## Seguridad y límites
La tabla aplica RLS y solo permite leer mensajes y escribir al usuario autenticado bajo su propio ID. El cliente no recibe ninguna clave de administrador. Antes de abrir el chat masivamente, conviene agregar límites antiabuso y herramientas de moderación del lado del servidor. No publicar datos personales en mensajes.
