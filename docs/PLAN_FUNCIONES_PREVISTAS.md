# LogBook eQSL Express — plan de trabajo

## Estado y criterio de publicación

Este documento distingue la base de código observada de las funciones que todavía deben implementarse o verificarse. Ninguna función debe anunciarse como terminada hasta pasar pruebas funcionales y comprobarse en el deployment.

## Base actual identificable en el código

- Libro de guardia local y formulario para registrar QSOs.
- RST enviado/recibido con valor predeterminado 59.
- Generación de tarjeta eQSL, descarga PNG y flujo de respuesta por enlace.
- Importación ADIF y exportación ADIF; exportación Cabrillo básica que aún requiere validación por formato de concurso.
- Ajustes locales de estación, canales de respuesta, diseños e idioma.
- Service worker para instalación/offline opcional, pendiente de pruebas en dispositivos reales.

Los datos del log se guardan localmente en el navegador. No se debe asumir sincronización entre dispositivos ni una cuenta compartida si no se implementa y verifica un backend.

## Cambios de seguridad aplicados

- Se retiró el endpoint que consultaba páginas de QRZ automáticamente.
- El servicio de indicativos ya no llama a QRZ ni a servicios externos; solo puede devolver información local de prefijo.
- Se retiró la lectura automática del portapapeles y el puente de importación automática desde QRZ. El usuario puede pegar manualmente un correo visible que haya comprobado.
- El directorio compartido, las estadísticas y el registro de actividad quedan deshabilitados hasta contar con verificación, consentimiento y controles antiabuso.
- La página de eQSL recibida ya no registra automáticamente el indicativo al abrir una tarjeta.
- El mapa dejó de dibujar QSOs locales como si fueran actividad mundial compartida; ahora indica claramente que es una función prevista.

## Funciones previstas

### 1. Logbook y eQSL

- Mantener un flujo rápido para registrar contactos, editar y eliminar QSOs.
- Conservar RST 59 como valor inicial modificable.
- Añadir progresivos enviados/recibidos opcionales para concursos, sin imprimirlos en la eQSL por defecto.
- Permitir elegir diseños desde una galería, también al responder, y guardar una preferencia con confirmación.
- Compartir un enlace copiable de eQSL y permitir verla/descargarla como PNG en móvil y computadora.
- Diferenciar tarjeta preparada, enlace abierto, acción de compartir y envío confirmado. Abrir WhatsApp o correo no prueba que el mensaje se haya enviado.

### 2. Importación y exportación

- IMPORTAR y EXPORTAR deben ser acciones separadas, reales y probadas.
- ADIF (.adi/.adif), CSV, Excel (.xlsx/.xls), TXT delimitado y Cabrillo (.log/.cbr) según formatos de concurso identificados y probados.
- Incluir vista previa, asignación de columnas para CSV/Excel, validación de fechas y horas UTC, indicativos, bandas, frecuencias, modos y RST, mensajes de error claros y revisión de duplicados.
- Probar ida/vuelta, archivos vacíos, malformados, grandes y con caracteres internacionales.
- Procesar localmente cuando sea posible y no enviar archivos a terceros sin consentimiento.
- No prometer compatibilidad universal con Cabrillo.

### 3. Directorio comunitario de correos para eQSL

Objetivo: al escribir un indicativo en un QSO o eQSL, sugerir una dirección de correo legítimamente aportada o confirmada para evitar búsquedas y copias repetidas.

- Guardar únicamente direcciones introducidas o confirmadas legítimamente durante una interacción relacionada con eQSL; nunca inventarlas ni extraerlas ocultamente de cuentas ajenas.
- Validar el formato, registrar origen/fecha y diferenciar correos verificados de los no verificados.
- Evitar que una persona pueda asociar libremente un correo con el indicativo de otra; preferir confirmación del titular cuando sea posible.
- Resolver conflictos entre direcciones sin asumir que una es correcta.
- Permitir corrección, revocación, exclusión y eliminación.
- Ofrecer autocompletado rápido por indicativo solo dentro de la aplicación.
- Sin listados descargables, indexación pública, scraping, consultas masivas, campañas de correo ni envío automático.
- Exigir backend seguro, controles de acceso, cifrado en tránsito y reposo, límites de consultas/altas, detección de abuso y política de retención/borrado.
- Informar brevemente sobre la finalidad y las opciones del usuario. El uso debe ser discreto, pero no secreto.
- Mantenerlo deshabilitado hasta que los controles anteriores estén implementados y probados.

### 4. Propagación y datos de estación

- Permitir que el usuario introduzca voluntariamente locator Maidenhead o localidad; no pedir ni exponer coordenadas precisas sin consentimiento.
- Calcular distancia y rumbo solo cuando haya datos suficientes.
- Ofrecer pronóstico para hoy, mañana y pasado mañana si una fuente fiable proporciona información pertinente para la zona y las bandas.
- Diferenciar observaciones y pronósticos; mostrar fuente, hora de actualización, cobertura e incertidumbre.
- Evaluar fuentes reconocidas, como NOAA/SWPC, sin prometer que el clima espacial garantice una apertura concreta de banda o ruta.
- Si no hay fuente fiable o ubicación suficiente, indicar la limitación en lugar de inventar datos.

### 5. Mapamundi de actividad

- Función futura que muestre QSOs y eQSL compartidas mediante la aplicación, con eventos reales y estados diferenciados.
- Requerir participación explícita y permitir desactivarla.
- Utilizar ubicación aproximada por locator/país; no exponer coordenadas exactas ni datos personales por defecto.
- Dibujar líneas entre estaciones solo si se conocen ambos extremos y existe consentimiento.
- Requiere backend seguro, retención limitada y controles antiabuso. No simular actividad si no existe infraestructura en tiempo real.

### 6. Idiomas

- Objetivo de 25 idiomas: es, en, fr, de, it, pt, nl, ru, ja, zh, pl, sv, no, da, fi, cs, sk, hu, ro, tr, el, uk, hr, sr y ca.
- Traducir de forma integral labels, botones, ajustes, ayuda, errores, confirmaciones, manual, FAQ y mensajes de eQSL; conservar el idioma elegido.
- Adaptar mensajes al idioma del destinatario solo cuando el país se infiera con fiabilidad. Verificar prefijos oficiales y no asumir idioma en casos ambiguos.

### 7. Interfaz, compartir y estadísticas

- Auditar navegación y acciones duplicadas/confusas; agrupar herramientas por tareas y conservar prestaciones útiles.
- Mantener diseño sencillo, legible y accesible en móvil y computadora.
- Añadir “Compartir aplicación” con WhatsApp y copia del enlace oficial.
- Mostrar estadísticas solo cuando sean reales, agregadas, anónimas y verificables: usuarios registrados/activos con definición precisa, eQSL compartidas y países.
- No contar visitas anónimas como usuarios, no mostrar indicativos/correos/teléfonos/QSOs y no inventar cifras.
- Ranking dinámico de cinco países solo si existen datos válidos y deduplicados.

### 8. Manual y “Acerca de”

Ambos deben indicar qué funciones están disponibles y cuáles son futuras.

**Texto propuesto para “Acerca de”:**

> LogBook eQSL Express es un proyecto creado con dedicación por un radioaficionado argentino para compartir una herramienta práctica con la comunidad mundial de radioaficionados. La idea es facilitar el registro de contactos y el intercambio de eQSL de una forma sencilla, accesible y gratuita. El proyecto seguirá mejorando con cuidado por la privacidad, la fiabilidad y las necesidades de quienes lo usan. Las funciones que todavía están en desarrollo se identificarán claramente y no se presentarán como terminadas antes de probarlas.

**Manual breve previsto:**

1. Configurar el indicativo propio y revisar las preferencias.
2. Registrar un QSO y comprobar fecha/hora UTC, banda, modo y RST.
3. Preparar una eQSL, revisar el diseño y descargar la imagen.
4. Compartir el enlace o abrir WhatsApp/correo; confirmar manualmente el envío en la aplicación externa.
5. Abrir una eQSL recibida desde su enlace y descargarla.
6. Importar/exportar ADIF según las funciones probadas. Las funciones de CSV/Excel/TXT/Cabrillo se documentarán solo cuando estén verificadas.
7. Entender que el log local permanece en ese navegador hasta que exista sincronización segura.
8. Consultar la política de privacidad antes de aportar datos al futuro directorio comunitario.

### 9. Seguridad y pruebas antes de publicar

- Revisar secretos, dependencias, permisos, copias de seguridad, protección de la rama principal y revisiones de cambios.
- Verificar que las claves privadas nunca estén en el frontend.
- Probar flujos móviles y de escritorio, enlaces eQSL, descarga PNG, importación/exportación y errores de red.
- Probar directorio con correos no verificados, conflictos, corrección/eliminación, rate limits y resistencia a consultas masivas antes de habilitarlo.
- Probar el mapa con consentimiento apagado/encendido, ubicación aproximada y eventos reales.
- Verificar el build y el deployment de Vercel antes de anunciar una versión publicada.

## No disponible por ahora

El directorio comunitario compartido, las estadísticas verificadas, el mapa mundial en vivo y los pronósticos de propagación no deben mostrarse como funciones activas hasta que se implementen, se prueben y exista infraestructura segura para respaldarlas.
