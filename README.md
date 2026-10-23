# LogBook eQSL Express 📻

Aplicación web para radioaficionados: libro de guardia de contactos (QSOs), importación/exportación ADIF y generador de tarjetas eQSL con fotos personalizadas y respuestas recíprocas 2-Way. No requiere conexión con la API XML de QRZ para registrar contactos.

Desarrollado con dedicación para la comunidad de radioaficionados por **LU1TSB**.

---

## 🚀 Características Principales

- **Registro en Vivo (Live Log):**
  - Reloj UTC en vivo sincronizado en cabecera.
  - Precarga automática de Banda, Frecuencia, Modo, Fecha y Hora del QSO anterior.
  - Columna **Email editable directamente** en la tabla con persistencia local.
  - Búsqueda en tiempo real por indicativo, país, email o grid locator.
  - Exportación e importación en formato estándar **ADIF (.adi)** (compatible con LoTW, eQSL.cc y ClubLog).

- **Integración con QRZ.com:**
  - Consulta automática vía XML API de datos de corresponsales al ingresar el indicativo (nombre, país, grid y correo electrónico).
  - Almacenamiento 100% local y seguro de credenciales en tu navegador.

- **Diseñador y Emisor de Tarjetas eQSL:**
  - Renderizado gráfico en alta definición (1200x750 px).
  - **Carga de foto personalizada desde la galería / archivo** (tu estación, shack, antenas o paisaje local).
  - Temas clásicos: Clásico Navy, Dorado DX y Cibernético.
  - Descarga en formato PNG para enviar o imprimir.
  - Envío directo por Email (`mailto`) y compartición formateada por **WhatsApp**.
  - **Firma dinámica:** `73 cordiales de ${callsign}` (por defecto `LU1TSB`).

- **Confirmación y Respuesta Recíproca (Responder eQSL):**
  - Cada eQSL compartida incluye un enlace interactivo para que el corresponsal receptor pueda responder con su propia eQSL y su propia fotografía desde cualquier dispositivo.

---

## 🛠️ Tecnologías

- **React 19** + **TypeScript**
- **Vite**
- **Tailwind CSS v4**
- **Lucide Icons**
- **HTML5 Canvas API** (para generación de tarjetas gráficas)

---

## 💻 Instalación y Desarrollo Local

1. Clonar el repositorio:
   ```bash
   git clone https://github.com/Dogonik1912/LU1TSB-Logbook.git
   cd LU1TSB-Logbook
   ```

2. Instalar dependencias:
   ```bash
   npm install
   ```

3. Iniciar el servidor de desarrollo:
   ```bash
   npm run dev
   ```

4. Abrir en el navegador en `http://localhost:3000`.

---

## 🌐 Publicación gratuita en GitHub Pages

Para publicar tu aplicación gratis y para siempre con GitHub:
1. En GitHub, ve a **Settings** > **Pages**.
2. En **Build and deployment** > **Source**, selecciona **GitHub Actions**.
3. Selecciona la plantilla de **Vite / Static Web** y ¡listo!

---

Desarrollado por LU1TSB · LogBook eQSL Express
