# LogBook eQSL Express 📻

Aplicación web para radioaficionados, desarrollada para facilitar el registro de contactos (QSOs) y la preparación e intercambio de tarjetas eQSL.

## Estado actual del proyecto

Este repositorio contiene una base React + TypeScript + Vite. La presencia de código no garantiza por sí sola que una función esté terminada: las funciones deben probarse en navegador móvil y computadora antes de anunciarse como disponibles.

### Funciones identificables en el código

- Formulario y libro de guardia con almacenamiento local en el navegador.
- Valores RST predeterminados 59, editables.
- Generación de tarjetas eQSL, descarga PNG y flujo de respuesta mediante enlace.
- Importación ADIF y exportación ADIF; exportación Cabrillo básica, pendiente de validación por concurso.
- Ajustes locales para indicativo, datos de respuesta, diseño e idioma.
- Soporte PWA opcional mediante service worker, sujeto a pruebas de instalación y actualización.

### Funciones deshabilitadas o todavía pendientes

- **QRZ:** la aplicación no debe consultar la API XML de QRZ ni extraer automáticamente datos de sus páginas. El endpoint de extracción automática fue retirado. Si el usuario encuentra un correo visible en un perfil público, puede copiarlo y pegarlo manualmente, respetando las restricciones del servicio.
- **Directorio comunitario de correos:** temporalmente deshabilitado hasta completar verificación de titularidad, privacidad, límites de consultas y protección contra scraping/spam.
- **Estadísticas compartidas:** no disponibles mientras no exista un registro agregado, verificable y protegido contra abuso.
- **Mapamundi en tiempo real:** se muestra como función prevista. No se simula actividad mundial ni se envían QSOs al mapa.
- **Pronóstico de propagación, distancia/rumbo, formatos adicionales de importación/exportación, sincronización entre dispositivos y traducción integral a 25 idiomas:** requieren implementación y pruebas adicionales.

El directorio comunitario, el mapa compartido y las estadísticas no deben activarse solo con almacenamiento público del frontend. Requieren un backend seguro, consentimiento apropiado, controles de acceso y medidas antiabuso.

## Chat comunitario público: configuración obligatoria

El chat compartido utiliza Supabase como base de datos central. Para que dos visitantes en dispositivos distintos vean los mismos mensajes, las migraciones SQL deben ejecutarse una vez en el **proyecto Supabase correcto**:

1. Abrir el SQL Editor de Supabase.
2. Ejecutar el contenido de `supabase/migrations/202610250001_community_chat.sql`.
3. Ejecutar después `supabase/migrations/202610250002_public_device_chat.sql`.
4. En Vercel, verificar que `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` correspondan a ese mismo proyecto Supabase y estén configuradas para el entorno desplegado.
5. Abrir la aplicación en dos dispositivos o navegadores distintos y enviar mensajes de prueba en ambos sentidos.

El chat consulta la tabla `public.community_messages`, usa las funciones RPC `register_community_callsign` y `post_community_message`, y utiliza Realtime con consulta periódica de respaldo. Si las migraciones no están aplicadas, o las variables apuntan a otro proyecto, publicar una nueva versión del frontend por sí solo no arreglará la sincronización.

La señal distintiva queda asociada a un token guardado en el almacenamiento local del navegador y la base de datos impide reutilizarla con otro token. Esto no equivale a una verificación de identidad real: borrar los datos del navegador o cambiar de dispositivo puede generar otra identidad local; no debe prometerse protección absoluta contra duplicados o suplantación.

## Desarrollo local

Requisitos: Node.js compatible con la versión de Vite instalada.

```bash
npm install
npm run dev
```

Para validar el proyecto:

```bash
npm run build
npm run lint
```

En este repositorio, `npm run lint` ejecuta TypeScript con `tsc --noEmit`; no sustituye pruebas funcionales en navegador.

## Documentación de planificación

Consultar [docs/PLAN_FUNCIONES_PREVISTAS.md](docs/PLAN_FUNCIONES_PREVISTAS.md) para ver la separación entre la base actual y las funciones previstas, incluyendo propagación, mapa mundial, directorio comunitario, privacidad, manual y texto de “Acerca de”.

## Principios del proyecto

- Gratuito y útil para la comunidad internacional de radioaficionados.
- Sin cuentas ni instalación obligatorias para comenzar a usar las funciones locales.
- No inventar correos, estadísticas, contactos ni información en tiempo real.
- No afirmar que un mensaje fue enviado solo porque se abrió WhatsApp o el cliente de correo.
- Privacidad primero: no publicar datos personales ni registros individuales sin consentimiento.
- Mantener el repositorio principal y el repositorio de respaldo; no eliminar el respaldo.

Tecnologías principales: React 19, TypeScript, Vite, Tailwind CSS y Lucide Icons.
