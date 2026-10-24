/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef, useEffect, useState } from 'react';
import { QSO } from '../types';
import { getFirma, getUserCallsign } from '../services/qrzService';
import { 
  X, 
  Download, 
  Mail, 
  Share2, 
  Check, 
  Sparkles, 
  Image as ImageIcon, 
  Trash2, 
  Anchor,
  Copy,
  ExternalLink,
  MessageSquare
} from 'lucide-react';

const EQSL_THEMES = [
  { id: 'navy', name: 'Clásico azul', start: '#0f172a', mid: '#1e293b', end: '#090d16', accent: '#f59e0b', motif: '📡' },
  { id: 'gold', name: 'Dorado', start: '#1c1917', mid: '#292524', end: '#0c0a09', accent: '#eab308', motif: '🏆' },
  { id: 'cyber', name: 'Radio digital', start: '#020617', mid: '#0f172a', end: '#030712', accent: '#38bdf8', motif: '〰' },
  { id: 'sunset', name: 'Puesta de sol', start: '#431407', mid: '#9a3412', end: '#111827', accent: '#fdba74', motif: '🌅' },
  { id: 'mountain', name: 'Montaña y antenas', start: '#082f49', mid: '#155e75', end: '#0f172a', accent: '#67e8f9', motif: '🏔️' },
  { id: 'aurora', name: 'Aurora boreal', start: '#052e2b', mid: '#115e59', end: '#111827', accent: '#5eead4', motif: '🌌' },
  { id: 'ocean', name: 'Mar y DX', start: '#082f49', mid: '#075985', end: '#020617', accent: '#7dd3fc', motif: '🌊' },
  { id: 'forest', name: 'Radio en el bosque', start: '#14532d', mid: '#166534', end: '#052e16', accent: '#86efac', motif: '🌲' },
  { id: 'space', name: 'Espacio y satélites', start: '#1e1b4b', mid: '#312e81', end: '#030712', accent: '#c4b5fd', motif: '🛰️' },
  { id: 'world', name: 'Mundo DX', start: '#172554', mid: '#1d4ed8', end: '#0f172a', accent: '#93c5fd', motif: '🌐' },
  { id: 'cw', name: 'Código Morse', start: '#18181b', mid: '#27272a', end: '#09090b', accent: '#f4f4f5', motif: '· − ·' },
  { id: 'field', name: 'Radio portátil', start: '#365314', mid: '#3f6212', end: '#111827', accent: '#d9f99d', motif: '⛺' },
  { id: 'vintage', name: 'Vintage radio', start: '#451a03', mid: '#78350f', end: '#1c1917', accent: '#fcd34d', motif: '📻' },
  { id: 'signal', name: 'Ondas de radio', start: '#164e63', mid: '#155e75', end: '#082f49', accent: '#a5f3fc', motif: '〰️' },
  { id: 'contest', name: 'Concurso y diplomas', start: '#312e81', mid: '#4338ca', end: '#111827', accent: '#fde68a', motif: '🥇' },
  { id: 'moon', name: 'Luna y noche', start: '#0f172a', mid: '#1e293b', end: '#020617', accent: '#e2e8f0', motif: '🌙' },
  { id: 'tropical', name: 'Tropical', start: '#064e3b', mid: '#047857', end: '#022c22', accent: '#a7f3d0', motif: '🌴' },
  { id: 'arctic', name: 'Polar', start: '#164e63', mid: '#0e7490', end: '#082f49', accent: '#cffafe', motif: '❄️' },
  { id: 'red', name: 'Alta potencia', start: '#450a0a', mid: '#991b1b', end: '#1c1917', accent: '#fecaca', motif: '⚡' },
  { id: 'yl-radio', name: 'YL · Ondas y estrellas', start: '#4a044e', mid: '#86198f', end: '#1e1b4b', accent: '#f5d0fe', motif: 'YL' },
  { id: 'yl-dx', name: 'YL · Mundo DX', start: '#172554', mid: '#1d4ed8', end: '#312e81', accent: '#bfdbfe', motif: 'YL' },
  { id: 'yl-portable', name: 'YL · Aurora y naturaleza', start: '#14532d', mid: '#0f766e', end: '#082f49', accent: '#a7f3d0', motif: 'YL' },
  { id: 'yl-contest', name: 'YL · Brillo y concurso', start: '#7f1d1d', mid: '#9d174d', end: '#312e81', accent: '#fbcfe8', motif: 'YL' },
  { id: 'yl-antenna', name: 'YL · Antenas al atardecer', start: '#78350f', mid: '#b45309', end: '#431407', accent: '#fde68a', motif: 'YL' },
];

interface EQSLCardModalProps {
  qso: QSO | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenReply?: (qso: QSO) => void;
}

export const EQSLCardModal: React.FC<EQSLCardModalProps> = ({
  qso,
  isOpen,
  onClose,
  onOpenReply,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('eqsl_theme') || 'navy');
  const [customBgImage, setCustomBgImage] = useState<string | null>(() => localStorage.getItem('eqsl_custom_bg') || null);
  const [imagePositionX, setImagePositionX] = useState<number>(() => Number(localStorage.getItem('eqsl_image_position_x') || 0));
  const [imagePositionY, setImagePositionY] = useState<number>(() => Number(localStorage.getItem('eqsl_image_position_y') || 0));
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; name: string; dataUrl: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]'); } catch { return []; }
  });
  const [copied, setCopied] = useState(false);
  const [themeNotice, setThemeNotice] = useState('');
  const [signatureEnabled, setSignatureEnabled] = useState(() => localStorage.getItem('eqsl_signature_enabled') !== 'false');
  const [signatureText, setSignatureText] = useState(() => (localStorage.getItem('eqsl_signature_text') || getFirma()).slice(0, 30));

  const myCallsign = getUserCallsign();
  const cardSenderCallsign = isCBQSO
    ? (qso?.stationCallsign || localStorage.getItem('cb_station_callsign') || '11 METROS')
    : myCallsign;
  const myName = localStorage.getItem('user_name')?.trim() || '';
  const myQth = localStorage.getItem('user_qth') || 'Argentina';
  const myGrid = localStorage.getItem('user_grid') || 'GF05te';

  // Importar una o varias imágenes a la galería de diseños eQSL sin anclar ninguna automáticamente.
  // El usuario decide después qué miniatura anclar para los próximos envíos.
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;

    const compressImage = (file: File) => new Promise<{ id: string; name: string; dataUrl: string } | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = (event) => {
        const source = event.target?.result as string;
        if (!source) return resolve(null);
        const image = new Image();
        image.onerror = () => resolve(null);
        image.onload = () => {
          // Comprimir con límites más bajos para que varias fotos quepan en el almacenamiento
          // local del navegador, especialmente en móviles Android.
          const maxWidth = 900;
          const maxHeight = 560;
          const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
          const resized = document.createElement('canvas');
          resized.width = Math.max(1, Math.round(image.width * scale));
          resized.height = Math.max(1, Math.round(image.height * scale));
          const context = resized.getContext('2d');
          if (!context) return resolve(null);
          context.drawImage(image, 0, 0, resized.width, resized.height);
          resolve({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`,
            name: file.name,
            dataUrl: resized.toDataURL('image/jpeg', 0.62),
          });
        };
        image.src = source;
      };
      reader.readAsDataURL(file);
    });

    const imported: Array<{ id: string; name: string; dataUrl: string }> = [];
    for (const file of files) {
      const entry = await compressImage(file);
      if (entry) imported.push(entry);
    }
    if (!imported.length) {
      window.alert('No se pudieron leer las imágenes seleccionadas. Probá con archivos JPG o PNG.');
      return;
    }

    const saved = (() => {
      try { return JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]'); }
      catch { return []; }
    })() as Array<{ id: string; name: string; dataUrl: string }>;
    const next = [...saved, ...imported];
    try {
      localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
      setGalleryImages(next);
      setThemeNotice(`Se añadieron ${imported.length} imagen(es) a Diseños eQSL. Tocá “Anclar” en la que quieras usar para enviar.`);
    } catch {
      // No reemplazar ni anclar la selección actual si el almacenamiento está lleno.
      window.alert('No hay espacio suficiente para guardar todas las imágenes. Elegí menos imágenes o archivos más pequeños; no se cambió el diseño anclado.');
    }
  };

  const handleThemeChange = (nextTheme: string) => {
    setTheme(nextTheme);
    localStorage.setItem('eqsl_theme', nextTheme);
    setCustomBgImage(null);
    localStorage.removeItem('eqsl_custom_bg');
    const selected = EQSL_THEMES.find((item) => item.id === nextTheme);
    setThemeNotice(`“${selected?.name || nextTheme}” quedó seleccionada como tu eQSL predeterminada.`);
    window.setTimeout(() => setThemeNotice(''), 3500);
  };

  const handleSelectGalleryImage = (dataUrl: string, name = 'foto de galería') => {
    setCustomBgImage(dataUrl);
    localStorage.setItem('eqsl_custom_bg', dataUrl);
    setImagePositionX(0);
    setImagePositionY(0);
    localStorage.setItem('eqsl_image_position_x', '0');
    localStorage.setItem('eqsl_image_position_y', '0');
    setThemeNotice(`⚓ ANCLADA PARA ENVIAR: ${name}. Se mantendrá seleccionada hasta que elijas otro diseño.`);
  };

  const handleDeleteGalleryImage = (id: string) => {
    const next = galleryImages.filter((item) => item.id !== id);
    setGalleryImages(next);
    localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
    const removed = galleryImages.find((item) => item.id === id);
    if (removed?.dataUrl === customBgImage) {
      setCustomBgImage(null);
      localStorage.removeItem('eqsl_custom_bg');
    }
  };

  const handleRemoveCustomImage = () => {
    setCustomBgImage(null);
    localStorage.removeItem('eqsl_custom_bg');
  };

  // Dibujar la tarjeta eQSL en el canvas HTML5 con máxima calidad (1200x750)
  const renderCard = () => {
    if (!qso || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 1200;
    const height = 750;
    canvas.width = width;
    canvas.height = height;

    const drawCardContent = () => {
      // Cabecera: Título eQSL Express & Indicativo Principal
      ctx.textAlign = 'center';

      // Subtítulo
      ctx.font = 'bold 24px monospace';
      ctx.fillStyle = theme === 'cyber' ? '#38bdf8' : '#fbbf24';
      ctx.fillText('CONFIRMING QSO · OFFICIAL eQSL CARD', width / 2, 85);

      // Indicativo emisor enorme
      ctx.font = '900 96px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
      ctx.shadowBlur = 12;
      ctx.fillText(cardSenderCallsign, width / 2, 190);
      ctx.shadowBlur = 0;

      // Información del emisor (Nombre, QTH, Grid)
      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      const stationDetails = [myName, myQth, myGrid ? `Grid: ${myGrid}` : ''].filter(Boolean).join(' · ');
      if (stationDetails) ctx.fillText(stationDetails, width / 2, 230);

      // Línea separadora
      ctx.strokeStyle = theme === 'cyber' ? 'rgba(56, 189, 248, 0.6)' : 'rgba(245, 158, 11, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(100, 260);
      ctx.lineTo(width - 100, 260);
      ctx.stroke();

      // Bloque central para el corresponsal
      ctx.font = 'bold 26px sans-serif';
      ctx.fillStyle = '#f1f5f9';
      ctx.fillText('CONFIRMING TWO-WAY RADIO CONTACT WITH', width / 2, 310);

      // Indicativo corresponsal destacado
      ctx.font = '900 70px monospace';
      ctx.fillStyle = theme === 'cyber' ? '#38bdf8' : '#f59e0b';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)';
      ctx.shadowBlur = 10;
      ctx.fillText(qso.callsign, width / 2, 385);
      ctx.shadowBlur = 0;

      // Tabla de datos del QSO
      const boxX = 90;
      const boxY = 425;
      const boxW = width - 180;
      const boxH = 160;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      // Columnas de datos: FECHA | HORA UTC | BANDA / FREQ | MODO | RST ENVIADA | RST RECIBIDA
      const cols = [
        { label: 'FECHA (UTC)', val: qso.date },
        { label: 'HORA (UTC)', val: `${qso.time} UTC` },
        { label: 'BANDA / FREQ', val: `${qso.band} (${qso.frequency} MHz)` },
        { label: 'MODO', val: qso.mode },
        { label: 'RST 2-WAY', val: `${qso.rstSent || '59'} / ${qso.rstRcvd || '59'}` },
      ];

      const colWidth = boxW / cols.length;
      cols.forEach((col, idx) => {
        const cx = boxX + idx * colWidth + colWidth / 2;

        ctx.textAlign = 'center';
        ctx.font = 'bold 15px sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(col.label, cx, boxY + 45);

        ctx.font = 'bold 24px monospace';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(col.val, cx, boxY + 95);

        if (idx < cols.length - 1) {
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(boxX + (idx + 1) * colWidth, boxY + 15);
          ctx.lineTo(boxX + (idx + 1) * colWidth, boxY + boxH - 15);
          ctx.stroke();
        }
      });

      // PRIORIDAD 1: Firma dinámica del operador en la tarjeta
      const firma = signatureText.trim().slice(0, 30);
      if (signatureEnabled && firma) {
        ctx.textAlign = 'center';
        ctx.font = 'italic bold 24px serif';
        ctx.fillStyle = theme === 'cyber' ? '#7dd3fc' : '#fde047';
        ctx.fillText(firma, width / 2, 635, width - 120);
      }

      // Marca de agua permanente de la app, incluso sobre imágenes propias de galería.
      ctx.save();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.shadowColor = 'rgba(255,255,255,0.65)';
      ctx.shadowBlur = 2;
      ctx.fillText('LogBook eQSL EXPRESS', width - 24, height - 20);
      ctx.restore();
    };

    if (customBgImage) {
      const img = new Image();
      img.onload = () => {
        // Dibujar imagen cubriendo el canvas respetando proporción
        const scale = Math.max(width / img.width, height / img.height);
        const scaledWidth = img.width * scale;
        const scaledHeight = img.height * scale;
        // Los controles permiten desplazar la foto dentro del recorte sin deformarla.
        const x = (width - scaledWidth) / 2 + ((width - scaledWidth) / 2) * (imagePositionX / 100);
        const y = (height - scaledHeight) / 2 + ((height - scaledHeight) / 2) * (imagePositionY / 100);
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Capa oscura translúcida para legibilidad profesional
        ctx.fillStyle = 'rgba(10, 15, 30, 0.48)';
        ctx.fillRect(0, 0, width, height);

        // Marco
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 6;
        ctx.strokeRect(30, 30, width - 60, height - 60);

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(42, 42, width - 84, height - 84);

        drawCardContent();
      };
      img.src = customBgImage;
    } else {
      // Plantillas temáticas: 19 motivos de radioafición.
      const selectedTheme = EQSL_THEMES.find((item) => item.id === theme) || EQSL_THEMES[0];
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, selectedTheme.start);
      grad.addColorStop(0.52, selectedTheme.mid);
      grad.addColorStop(1, selectedTheme.end);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      // Ondas decorativas y símbolo asociado al motivo elegido.
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = selectedTheme.accent;
      ctx.lineWidth = 3;
      for (let ring = 0; ring < 5; ring++) {
        ctx.beginPath();
        ctx.ellipse(width - 180, 150, 90 + ring * 45, 38 + ring * 25, -0.25, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = selectedTheme.accent;
      ctx.font = 'bold 88px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(selectedTheme.motif, 70, 150);
      ctx.restore();

      ctx.strokeStyle = selectedTheme.accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(30, 30, width - 60, height - 60);
      ctx.strokeStyle = selectedTheme.accent + '66';
      ctx.lineWidth = 2;
      ctx.strokeRect(42, 42, width - 84, height - 84);

      drawCardContent();
    }
  };

  useEffect(() => {
    if (isOpen && qso) {
      // Restaurar el diseño anclado: no cambiarlo automáticamente al abrir otro QSO.
      setTheme(localStorage.getItem('eqsl_theme') || 'navy');
      setCustomBgImage(localStorage.getItem('eqsl_custom_bg') || null);
      try { setGalleryImages(JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]')); } catch { setGalleryImages([]); }
    }
  }, [isOpen, qso]);

  useEffect(() => {
    if (isOpen && qso) {
      const timer = window.setTimeout(renderCard, 50);
      return () => window.clearTimeout(timer);
    }
  }, [isOpen, qso, theme, customBgImage, imagePositionX, imagePositionY]);

  if (!isOpen || !qso) return null;

  // Enlace para que el corresponsal que reciba el mensaje pueda responder con su propia eQSL
  const getReplyUrl = () => {
    const origin = window.location.origin;
    // El enlace de respuesta solo lleva los datos necesarios del QSO; nunca expone correo ni teléfono.
    const params = new URLSearchParams({
      reply_to: cardSenderCallsign,
      to_call: qso.callsign,
      date: qso.date,
      time: qso.time,
      band: qso.band,
      freq: qso.frequency,
      mode: qso.mode,
      rst: qso.rstSent || '59',
    });
    return `${origin}/?${params.toString()}`;
  };

  const getShareInvitation = () => {
    const lang = (navigator.language || 'es').toLowerCase().split('-')[0];
    const copy: Record<string, [string, string]> = {
      es: ['HAY UNA eQSL para ti. Responde de manera rápida y gratuita en eQSL EXPRESS.', 'Abre la tarjeta y pulsa el botón para responder:'],
      en: ['YOU HAVE AN eQSL! Reply quickly and free with eQSL EXPRESS.', 'Open the card and tap the button to reply:'],
      pt: ['VOCÊ TEM UMA eQSL! Responda de forma rápida e gratuita com eQSL EXPRESS.', 'Abra o cartão e toque no botão para responder:'],
      fr: ['VOUS AVEZ REÇU UNE eQSL ! Répondez rapidement et gratuitement avec eQSL EXPRESS.', 'Ouvrez la carte et appuyez sur le bouton pour répondre :'],
      de: ['DU HAST EINE eQSL! Antworte schnell und kostenlos mit eQSL EXPRESS.', 'Öffne die Karte und tippe zum Antworten auf die Schaltfläche:'],
      it: ['HAI RICEVUTO UNA eQSL! Rispondi rapidamente e gratuitamente con eQSL EXPRESS.', 'Apri la cartolina e premi il pulsante per rispondere:'],
      nl: ['JE HEBT EEN eQSL! Reageer snel en gratis met eQSL EXPRESS.', 'Open de kaart en tik op de knop om te antwoorden:'],
      ru: ['ВЫ ПОЛУЧИЛИ eQSL! Ответьте быстро и бесплатно с eQSL EXPRESS.', 'Откройте карточку и нажмите кнопку ответа:'],
      ja: ['eQSLが届きました！eQSL EXPRESSで素早く無料で返信できます。', 'カードを開き、返信ボタンを押してください：'],
      zh: ['您收到了一张 eQSL！使用 eQSL EXPRESS 即可快速免费回复。', '打开卡片并点击回复按钮：'],
      pl: ['MASZ eQSL! Odpowiedz szybko i bezpłatnie dzięki eQSL EXPRESS.', 'Otwórz kartę i naciśnij przycisk odpowiedzi:'],
      sv: ['DU HAR FÅTT EN eQSL! Svara snabbt och gratis med eQSL EXPRESS.', 'Öppna kortet och tryck på svarsknappen:'],
      no: ['DU HAR FÅTT EN eQSL! Svar raskt og gratis med eQSL EXPRESS.', 'Åpne kortet og trykk på svarknappen:'],
      da: ['DU HAR MODTAGET EN eQSL! Svar hurtigt og gratis med eQSL EXPRESS.', 'Åbn kortet, og tryk på svarknappen:'],
      fi: ['SAIT eQSL-KORTIN! Vastaa nopeasti ja maksutta eQSL EXPRESSillä.', 'Avaa kortti ja paina vastauspainiketta:'],
      cs: ['DOSTALI JSTE eQSL! Odpovězte rychle a zdarma s eQSL EXPRESS.', 'Otevřete kartu a stiskněte tlačítko odpovědi:'],
      sk: ['DOSTALI STE eQSL! Odpovedzte rýchlo a zadarmo s eQSL EXPRESS.', 'Otvorte kartu a stlačte tlačidlo odpovede:'],
      hu: ['eQSL-T KAPTÁL! Válaszolj gyorsan és ingyen az eQSL EXPRESS segítségével.', 'Nyisd meg a kártyát, és koppints a válasz gombra:'],
      ro: ['AI PRIMIT O eQSL! Răspundeți rapid și gratuit cu eQSL EXPRESS.', 'Deschideți cardul și apăsați butonul de răspuns:'],
      tr: ['BİR eQSL ALDINIZ! eQSL EXPRESS ile hızlı ve ücretsiz yanıt verin.', 'Kartı açın ve yanıtlamak için düğmeye dokunun:'],
      el: ['ΛΑΒΑΤΕ ΜΙΑ eQSL! Απαντήστε γρήγορα και δωρεάν με το eQSL EXPRESS.', 'Ανοίξτε την κάρτα και πατήστε το κουμπί απάντησης:'],
      uk: ['ВИ ОТРИМАЛИ eQSL! Відповідайте швидко й безкоштовно через eQSL EXPRESS.', 'Відкрийте картку й натисніть кнопку відповіді:'],
      hr: ['PRIMILI STE eQSL! Odgovorite brzo i besplatno uz eQSL EXPRESS.', 'Otvorite karticu i pritisnite gumb za odgovor:'],
      sr: ['DOBILI STE eQSL! Odgovorite brzo i besplatno uz eQSL EXPRESS.', 'Otvorite karticu i pritisnite dugme za odgovor:'],
      ca: ['HAS REBUT UNA eQSL! Respon ràpidament i gratuïtament amb eQSL EXPRESS.', 'Obre la targeta i prem el botó per respondre:'],
    };
    return copy[lang] || copy.en;
  };

  // Crear un enlace público corto. Los datos del QSO se guardan temporalmente en el servidor,
  // no se codifican dentro de la URL ni se incluyen datos privados de contacto.
  const getReceivedCardUrl = async () => {
    const cardData = {
      from: cardSenderCallsign,
      to: qso.callsign,
      date: qso.date,
      time: qso.time,
      band: qso.band,
      frequency: qso.frequency,
      mode: qso.mode,
      rstSent: qso.rstSent || '59',
      rstRcvd: qso.rstRcvd || '59',
      qth: myQth,
      grid: myGrid,
    };
    const response = await fetch('/api/eqsl-share', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cardData),
    });
    const result = await response.json();
    if (!response.ok || !result.id) {
      throw new Error(result.error || 'No se pudo crear el enlace corto de la eQSL.');
    }
    return `${window.location.origin}/?e=${encodeURIComponent(result.id)}`;
  };

  // Descargar archivo PNG
  const handleDownloadPNG = () => {
    if (!isQsoValidForEQSL() || !canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `eQSL_${myCallsign}_${qso.callsign}_${qso.date}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // Registra la estación que inicia una acción eQSL. No afirma que el proveedor externo haya entregado el mensaje.
  const trackEQSLActivity = () => {
    const callsign = String(myCallsign || '').trim().toUpperCase();
    if (!callsign) return;
    fetch('/api/directory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'activity', callsign }),
    }).catch(() => {});
  };

  // Guardar los datos introducidos en la pantalla de envío, solo en la libreta privada local.
  // PRIORIDAD 1: Compartir por WhatsApp con firma dinámica y link de respuesta eQSL
  const handleShareWhatsApp = async () => {
    if (!isQsoValidForEQSL()) return;
    trackEQSLActivity();
    let receivedCardLink = '';
    try {
      receivedCardLink = await getReceivedCardUrl();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace corto. Intentá nuevamente.');
      return;
    }
    const [invite, openToReply] = getShareInvitation();
    const message = invite + '\n' + openToReply + '\n' + receivedCardLink;
    const canvas = canvasRef.current;
    if (canvas && typeof navigator.share === 'function' && typeof File !== 'undefined') {
      try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const imageFile = new File([blob], `eQSL_${myCallsign}_${qso.callsign}.png`, { type: 'image/png' });
          if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [imageFile] })) {
            await navigator.share({ files: [imageFile], title: 'Tarjeta eQSL', text: message });
            return;
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
  };

  const handleShareTelegram = async () => {
    if (!isQsoValidForEQSL()) return;
    trackEQSLActivity();
    let receivedCardLink = '';
    try {
      receivedCardLink = await getReceivedCardUrl();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace corto. Intentá nuevamente.');
      return;
    }
    const [invite, openToReply] = getShareInvitation();
    const text = invite + '\n' + openToReply + '\n' + getFirma();
    const url = 'https://t.me/share/url?url=' + encodeURIComponent(receivedCardLink) + '&text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleSendEmail = async () => {
    if (!isQsoValidForEQSL()) return;
    const targetEmail = window.prompt(`Pegá el correo de ${qso.callsign} (por ejemplo, obtenido en QRZ):`, '')?.trim() || '';
    if (!targetEmail) return;
    if (!/^[^\s@]+@[^\s@]+\\.[^\s@]+$/.test(targetEmail)) {
      window.alert('La dirección de correo no parece válida. Revisala y volvé a intentarlo.');
      return;
    }
    trackEQSLActivity();
    let receivedCardLink = '';
    try {
      receivedCardLink = await getReceivedCardUrl();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace corto. Intentá nuevamente.');
      return;
    }
    const firma = getFirma();
    const subject = encodeURIComponent(`Tarjeta eQSL de ${myCallsign} para ${qso.callsign} [${qso.band} ${qso.mode}]`);
    const body = encodeURIComponent(
      getShareInvitation()[0] + '\n\n' +
      getShareInvitation()[1] + '\n' +
      receivedCardLink + '\n\n' + firma + '\nLogBook eQSL Express'
    );
    window.location.href = `mailto:${encodeURIComponent(targetEmail)}?subject=${subject}&body=${body}`;
  };

  const isQsoValidForEQSL = () => {
    const call = qso?.callsign?.trim().toUpperCase() || '';
    const date = qso?.date || '';
    const time = qso?.time || '';
    const frequency = Number(String(qso?.frequency || '').trim().replace(',', '.'));
    const mode = qso?.mode || '';
    const validCall = /^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/.test(call);
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const validFrequency = Number.isFinite(frequency) && frequency > 0 && frequency <= 100000;
    const validMode = ['SSB', 'CW', 'FT8', 'FT4', 'AM', 'FM', 'RTTY', 'PSK31', 'SSTV', 'JS8', 'D-STAR', 'DMR'].includes(mode);
    if (!(validCall && validDate && validTime && validFrequency && validMode)) {
      window.alert('No se puede emitir la eQSL: el QSO tiene un campo obligatorio vacío o incorrecto. Revisá indicativo, fecha, hora UTC, frecuencia y modo.');
      return false;
    }
    return true;
  };

  const handleShareTelegram = () => {
    if (!isQsoValidForEQSL()) return;
    trackEQSLActivity();
    const text = 'HAY UNA eQSL para ti. Responde de manera rápida y gratuita en eQSL EXPRESS.\n' +
      'Abre la tarjeta y pulsa el botón para responder.\n' + getFirma();
    // Abrir el selector de Telegram para que el operador elija a quién enviarla.
    const url = 'https://t.me/share/url?url=' + encodeURIComponent(getReceivedCardUrl()) + '&text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Enviar por Email (con link de respuesta eQSL y firma dinámica)
  const handleSendEmail = () => {
    if (!isQsoValidForEQSL()) return;
    trackEQSLActivity();
    const firma = getFirma();
    const replyLink = getReplyUrl();
    const receivedCardLink = getReceivedCardUrl();
    const subject = encodeURIComponent(`Tarjeta eQSL de ${myCallsign} para ${qso.callsign} [${qso.band} ${qso.mode}]`);
    const body = encodeURIComponent(
      `HAY UNA eQSL para ti. Responde de manera rápida y gratuita en eQSL EXPRESS.\n\n` +
      `Abre esta tarjeta y pulsa el botón para descargarla y responder con tu propio diseño:\n` +
      `${receivedCardLink}\n\n` +
      `${firma}\n` +
      `LogBook eQSL Express`
    );

    // El correo solo se pide si el usuario elige este canal; puede pegarlo desde QRZ.
    const targetEmail = window.prompt(`Pegá el correo de ${qso.callsign} (por ejemplo, obtenido en QRZ):`, '')?.trim() || '';
    if (!targetEmail) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
      window.alert('La dirección de correo no parece válida. Revisala y volvé a intentarlo.');
      return;
    }
    window.open(`mailto:${encodeURIComponent(targetEmail)}?subject=${subject}&body=${body}`);
  };


  // Copiar resumen del QSO con link de respuesta
  const handleCopyText = async () => {
    try {
      const receivedCardLink = await getReceivedCardUrl();
      const text = `QSO Confirmado: ${myCallsign} <-> ${qso.callsign} | ${qso.date} ${qso.time} UTC | ${qso.band} ${qso.frequency}MHz ${qso.mode} | RST: ${qso.rstSent || '59'}/${qso.rstRcvd || '59'} | ${getFirma()} | Responder con eQSL: ${receivedCardLink}`;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace corto.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl text-slate-100 my-auto">
        {/* Cabecera del modal */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Tarjeta eQSL Express · {qso.callsign}
              </h2>
              <p className="text-xs text-slate-400">
                Generador de tarjeta gráfica con foto personalizada y opción de respuesta recíproca
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Cerrar */}

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Galería unificada: diseños incluidos en la app y fotos subidas por el usuario. */}
        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-slate-200">Diseños eQSL predeterminados</p>
            <span className="text-[10px] text-slate-500">{EQSL_THEMES.length + galleryImages.length} diseños</span>
          </div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/80 p-2">
            <p className="text-[11px] text-slate-300">Todas las fotos que cargues aparecerán en esta galería. Cargar una foto no la ancla automáticamente.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Añadir fotos de galería
            </button>
          </div>
          <div className="mb-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
            {EQSL_THEMES.map((item) => {
              const selected = !customBgImage && theme === item.id;
              return (
                <button key={item.id} type="button" onClick={() => handleThemeChange(item.id)} className={`relative overflow-hidden rounded-lg border text-left transition ${selected ? 'border-amber-400 ring-2 ring-amber-400/60' : 'border-slate-700 hover:border-slate-500'}`} title={`Seleccionar ${item.name} para enviar`}>
                  <span className="flex h-24 flex-col items-center justify-center gap-1" style={{ background: `linear-gradient(135deg, ${item.start}, ${item.mid}, ${item.end})` }}>
                    <span className="text-3xl" style={{ color: item.accent }}>{item.motif}</span>
                    <span className="text-[10px] font-bold text-white">{item.name}</span>
                  </span>
                  {selected && <span className="block bg-amber-400 px-2 py-1 text-center text-[10px] font-black text-slate-950">⚓ ANCLADA PARA ENVIAR</span>}
                </button>
              );
            })}
          </div>
          <p className="mb-2 text-[11px] text-slate-400">Fotos guardadas de tu galería</p>
          {galleryImages.length === 0 ? (
            <p className="text-xs text-slate-400">Podés cargar varias imágenes juntas. Aparecerán aquí como diseños disponibles; elegí “Anclar” en la que quieras usar para enviar.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {galleryImages.map((item) => {
                const selected = customBgImage === item.dataUrl;
                return (
                  <div key={item.id} className={`overflow-hidden rounded-lg border ${selected ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-slate-700'}`}>
                    <div className="block w-full text-left" title={item.name}>
                      <img src={item.dataUrl} alt={item.name} className="h-24 w-full object-cover" />
                      <span className="block truncate px-2 pt-1 text-[10px] text-slate-200">{item.name}</span>
                    </div>
                    <div className="flex items-center justify-between gap-1 border-t border-slate-800 p-1.5">
                      <button type="button" onClick={() => handleSelectGalleryImage(item.dataUrl, item.name)} className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-amber-300 hover:bg-slate-700'}`} title="Anclar esta imagen para enviar">
                        <Anchor className="h-3 w-3" /> {selected ? 'Anclada' : 'Anclar'}
                      </button>
                      <button type="button" onClick={() => handleDeleteGalleryImage(item.id)} className="rounded-md px-1.5 py-1 text-[10px] text-rose-300 hover:bg-rose-950/50" title="Eliminar imagen">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                    {selected && <span className="block bg-amber-400/10 px-2 pb-1.5 text-[10px] font-semibold text-amber-300">⚓ ANCLADA PARA ENVIAR</span>}
                  </div>
                );
              })}
            </div>
          )}
          {themeNotice && <p className="mt-2 text-[11px] text-amber-300">{themeNotice}</p>}
        </div>





        {/* Controles para centrar y encuadrar la foto personalizada en la vista previa. */}
        {customBgImage && (
          <div className="mb-3 rounded-xl border border-sky-500/30 bg-slate-950/80 p-3 space-y-3">
            <div>
              <p className="text-sm font-bold text-white">Ajustar posición de la imagen</p>
              <p className="text-xs text-slate-400">Mové la foto horizontal o verticalmente y mirá el resultado en la vista previa. La imagen no se deforma.</p>
            </div>
            <div>
              <label htmlFor="eqsl-image-position-x" className="flex justify-between text-xs text-slate-300 mb-1"><span>Horizontal</span><span>{imagePositionX === 0 ? 'Centro' : imagePositionX < 0 ? 'Izquierda' : 'Derecha'}</span></label>
              <input id="eqsl-image-position-x" type="range" min={-100} max={100} step={1} value={imagePositionX} onChange={(e) => { const value = Number(e.target.value); setImagePositionX(value); localStorage.setItem('eqsl_image_position_x', String(value)); }} className="w-full accent-sky-400" />
            </div>
            <div>
              <label htmlFor="eqsl-image-position-y" className="flex justify-between text-xs text-slate-300 mb-1"><span>Vertical</span><span>{imagePositionY === 0 ? 'Centro' : imagePositionY < 0 ? 'Arriba' : 'Abajo'}</span></label>
              <input id="eqsl-image-position-y" type="range" min={-100} max={100} step={1} value={imagePositionY} onChange={(e) => { const value = Number(e.target.value); setImagePositionY(value); localStorage.setItem('eqsl_image_position_y', String(value)); }} className="w-full accent-sky-400" />
            </div>
            <button type="button" onClick={() => { setImagePositionX(0); setImagePositionY(0); localStorage.setItem('eqsl_image_position_x', '0'); localStorage.setItem('eqsl_image_position_y', '0'); }} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800">Centrar imagen</button>
          </div>
        )}

        {/* Configuración de firma personalizada por usuario; la marca de agua de la app no se puede desactivar. */}
        <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <input
              type="checkbox"
              checked={signatureEnabled}
              onChange={(e) => {
                const enabled = e.target.checked;
                setSignatureEnabled(enabled);
                localStorage.setItem('eqsl_signature_enabled', String(enabled));
              }}
              className="h-4 w-4 accent-amber-400"
            />
            Firma activa en la tarjeta
          </label>
          <label htmlFor="eqsl-signature-text" className="block text-xs text-slate-400">Texto de firma (máximo 30 caracteres)</label>
          <input
            id="eqsl-signature-text"
            type="text"
            maxLength={30}
            value={signatureText}
            onChange={(e) => {
              const value = e.target.value.slice(0, 30);
              setSignatureText(value);
              localStorage.setItem('eqsl_signature_text', value);
            }}
            placeholder="Ej. 73 cordiales de LU1TSB"
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white"
          />
          <p className="text-[11px] text-slate-500">La firma se guarda en este dispositivo. La marca de agua «LogBook eqsl app.» se mantiene siempre, también sobre fotos propias.</p>
        </div>

        {/* Vista previa Canvas */}
        <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner flex items-center justify-center p-2 mb-4">
          <canvas
            ref={canvasRef}
            className="w-full h-auto max-h-[440px] object-contain rounded-lg shadow-2xl"
          />
        </div>

        {/* Destinatario y opción de respuesta */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Destinatario:</span>
              <strong className="text-amber-300 font-mono text-sm">{qso.callsign}</strong>
            </div>
            <p className="text-slate-500">No necesitás cargar su teléfono ni usuario. Elegilo directamente en WhatsApp o Telegram.</p>
          </div>

          <div className="flex items-center gap-2">
            {onOpenReply && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenReply(qso);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-950 hover:bg-sky-900 text-sky-300 text-xs font-medium rounded-lg border border-sky-500/30 transition-colors cursor-pointer"
                title="Emitir confirmación recíproca con datos invertidos"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Responder eQSL
              </button>
            )}

            <button
              type="button"
              onClick={handleCopyText}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors cursor-pointer"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? '¡Copiado!' : 'Copiar enlace y datos'}
            </button>
          </div>
        </div>

        {/* Elección explícita del canal después de revisar la vista previa */}
        <div className="pt-3 border-t border-slate-800">
          <h3 className="text-sm font-bold text-white mb-1">¿Por cuál medio querés enviar esta eQSL?</h3>
          <p className="text-xs text-slate-400 mb-3">Revisá la tarjeta y elegí WhatsApp o Telegram para seleccionar allí al destinatario. Si preferís correo, pegá la dirección que encuentres en QRZ cuando se solicite.</p>
        </div>

        {/* Botones de acción principales */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2">
          <div className="text-xs text-slate-400">
            Firma: <span className="text-amber-300 font-semibold">{signatureEnabled ? (signatureText || 'sin texto') : 'desactivada'}</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Descargar PNG */}
            <button
              type="button"
              onClick={handleDownloadPNG}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-amber-400" />
              Descargar PNG
            </button>

            {/* Enviar por Email */}
            <button
              type="button"
              onClick={handleSendEmail}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              Enviar por Email
            </button>

            <button type="button" onClick={handleShareTelegram} className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"><MessageSquare className="w-4 h-4" /> Telegram</button>
            {/* Compartir por WhatsApp con firma dinámica y link para responder */}
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
