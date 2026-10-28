/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { QSO, DEFAULT_CALLSIGN } from '../types';
import { getFirma, getUserCallsign } from '../services/qrzService';
import { requestChatInvitation } from '../services/chatInvitation';
import { getRecipientLanguage, getLocalizedEQSLNotification } from '../services/appLanguage';
import {
  X,
  Download,
  Mail,
  MessageSquare,
  Share2,
  Image as ImageIcon,
  Check,
  Radio,
  Sparkles,
  ArrowRightLeft,
  Trash2,
  Palette
} from 'lucide-react';

const isCBStationBand = (value?: string) => /11\\s*metros|11m|27\\s*mhz|banda ciudadana|\\bcb\\b/i.test(String(value || ''));

const REPLY_EQSL_THEMES = [
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

interface ReplyEQSLModalProps {
  initialData: {
    replyToCall: string;      // A quién se le responde (ej. LU1TSB)
    myCall?: string;          // Indicativo de quien responde
    date?: string;
    time?: string;
    band?: string;
    frequency?: string;
    mode?: string;
    rst?: string;
    email?: string;
    whatsapp?: string;
    whatsappUsername?: string;
    telegram?: string;
    originalEqslId?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSaveQSO?: (qso: QSO) => void;
}

export const ReplyEQSLModal: React.FC<ReplyEQSLModalProps> = ({
  initialData,
  isOpen,
  onClose,
  onSaveQSO,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [myCall, setMyCall] = useState('');
  const [replyToCall, setReplyToCall] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [band, setBand] = useState('40m');
  const [frequency, setFrequency] = useState('7.120');
  const [mode, setMode] = useState('SSB');
  const [rstSent, setRstSent] = useState('59');
  const [rstRcvd, setRstRcvd] = useState('59');
  const [emailTo, setEmailTo] = useState('');
  const [customBgImage, setCustomBgImage] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; name: string; dataUrl: string }>>(() => { try { return JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]'); } catch { return []; } });
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('eqsl_theme') || 'navy');
  const [savedToLog, setSavedToLog] = useState(false);
  const [eqslPostSending, setEqslPostSending] = useState(false);
  const [eqslPostStatus, setEqslPostStatus] = useState('');
  const [imagePositionX, setImagePositionX] = useState(0);
  const [imagePositionY, setImagePositionY] = useState(0);
  const [imageZoom, setImageZoom] = useState(0);
  const gesturePointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const lastDragPoint = useRef<{ x: number; y: number } | null>(null);
  const pinchStartDistance = useRef(0);
  const pinchStartZoom = useRef(0);

  // Control táctil directo: un dedo mueve la imagen y dos dedos hacen zoom.
  const handleImagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    gesturePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesturePointers.current.size === 1) {
      lastDragPoint.current = { x: event.clientX, y: event.clientY };
    } else if (gesturePointers.current.size === 2) {
      const points = Array.from(gesturePointers.current.values());
      pinchStartDistance.current = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      pinchStartZoom.current = imageZoom;
      lastDragPoint.current = null;
    }
  };

  const handleImagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!gesturePointers.current.has(event.pointerId)) return;
    event.preventDefault();
    gesturePointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (gesturePointers.current.size >= 2) {
      const points = Array.from(gesturePointers.current.values());
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (pinchStartDistance.current > 0) {
        setImageZoom(Math.max(-50, Math.min(200, pinchStartZoom.current + (distance - pinchStartDistance.current) / 2)));
      }
      return;
    }
    if (lastDragPoint.current) {
      const dx = event.clientX - lastDragPoint.current.x;
      const dy = event.clientY - lastDragPoint.current.y;
      const previewWidth = Math.max(1, event.currentTarget.clientWidth);
      const previewHeight = Math.max(1, event.currentTarget.clientHeight);
      setImagePositionX((value) => Math.max(-100, Math.min(100, value + dx * 100 / previewWidth)));
      setImagePositionY((value) => Math.max(-100, Math.min(100, value + dy * 100 / previewHeight)));
      lastDragPoint.current = { x: event.clientX, y: event.clientY };
    }
  };

  const handleImagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    gesturePointers.current.delete(event.pointerId);
    if (gesturePointers.current.size === 1) {
      const remaining = Array.from(gesturePointers.current.values())[0];
      lastDragPoint.current = remaining;
    } else {
      lastDragPoint.current = null;
    }
    if (gesturePointers.current.size < 2) pinchStartDistance.current = 0;
  };

  useEffect(() => {
    if (isOpen && initialData) {
      setReplyToCall(String(initialData.replyToCall || '').trim().toUpperCase());
      const defaultUser = getUserCallsign();
      // Si el usuario actual es el mismo que replyToCall, sugerimos dejar vacío o el otro
      setMyCall(initialData.myCall || (/11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(initialData.band || '')) ? (localStorage.getItem('cb_station_callsign') || '') : (defaultUser !== initialData.replyToCall ? defaultUser : '')));
      setDate(initialData.date || new Date().toISOString().slice(0, 10));
      setTime(initialData.time || '12:00');
      setBand(initialData.band || '40m');
      setFrequency(initialData.frequency || '7.120');
      setMode(initialData.mode || 'SSB');
      setRstSent(initialData.rst || '59');
      setRstRcvd(initialData.rst || '59');
      setEmailTo(initialData.email || '');
      setCustomBgImage(localStorage.getItem('eqsl_custom_bg') || null);
      try { setGalleryImages(JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]')); } catch { setGalleryImages([]); }
      setImagePositionX(Number(localStorage.getItem('eqsl_reply_image_position_x') || 0));
      setImagePositionY(Number(localStorage.getItem('eqsl_reply_image_position_y') || 0));
      setImageZoom(Number(localStorage.getItem('eqsl_reply_image_zoom') || 0));
      setTheme(localStorage.getItem('eqsl_theme') || 'navy');
      setSavedToLog(false);
    }
  }, [isOpen, initialData]);

  // Manejo de carga de imagen desde galería
  const handleUploadImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) return;
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1600 / image.width, 1000 / image.height);
        const resized = document.createElement('canvas');
        resized.width = Math.max(1, Math.round(image.width * scale));
        resized.height = Math.max(1, Math.round(image.height * scale));
        const context = resized.getContext('2d');
        if (!context) return;
        context.drawImage(image, 0, 0, resized.width, resized.height);
        setCustomBgImage(resized.toDataURL('image/jpeg', 0.82));
        setImagePositionX(0); setImagePositionY(0); setImageZoom(0);
      };
      image.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Renderizar la tarjeta de respuesta
  const renderReplyCard = () => {
    if (!canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 1200;
    const height = 750;
    canvas.width = width;
    canvas.height = height;

    const activeMyCall = myCall.trim().toUpperCase() || (isCBStationBand(band) ? 'ESTACIÓN 11 METROS' : 'MI INDICATIVO');
    const activeTarget = replyToCall.trim().toUpperCase() || 'CORRESPONSAL';

    const drawCard = () => {
      // Franja inferior compacta: la imagen queda libre de leyendas.
      const footerH = 112;
      const footerY = height - footerH;

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, footerY, width, footerH);

      const cols = [
        { label: 'FECHA (UTC)', val: date },
        { label: 'HORA (UTC)', val: `${time} UTC` },
        { label: 'BANDA / FREQ', val: `${band} (${frequency} MHz)` },
        { label: 'MODO', val: mode },
        { label: 'RST ENVIADA / REC.', val: `${rstSent} / ${rstRcvd}` },
      ];

      const colW = width / cols.length;
      cols.forEach((col, idx) => {
        const cx = idx * colW + colW / 2;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 13px sans-serif';
        ctx.fillText(col.label, cx, footerY + 29, colW - 12);
        ctx.font = 'bold 19px monospace';
        ctx.fillText(col.val, cx, footerY + 62, colW - 12);

        if (idx < cols.length - 1) {
          ctx.strokeStyle = '#d1d5db';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo((idx + 1) * colW, footerY + 12);
          ctx.lineTo((idx + 1) * colW, footerY + 78);
          ctx.stroke();
        }
      });

      // Marca de agua obligatoria, discreta y dentro de la franja blanca.
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText('LogBook eQSL EXPRESS', width - 12, height - 5);
      ctx.restore();
    };

    if (customBgImage) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(width / img.width, height / img.height) * Math.max(0.5, 1 + imageZoom / 100);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, width, height);
        const overflowX = Math.max(0, img.width * scale - width);
        const overflowY = Math.max(0, img.height * scale - height);
        const x = (width - img.width * scale) / 2 - (imagePositionX / 100) * overflowX / 2;
        const y = (height - img.height * scale) / 2 - (imagePositionY / 100) * overflowY / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Conservar la imagen elegida sin oscurecerla ni añadir marcos.

        drawCard();
      };
      img.src = customBgImage;
    } else {
      const selectedTheme = REPLY_EQSL_THEMES.find((item) => item.id === theme) || REPLY_EQSL_THEMES[0];
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, selectedTheme.start);
      grad.addColorStop(0.5, selectedTheme.mid);
      grad.addColorStop(1, selectedTheme.end);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.strokeStyle = selectedTheme.accent;
      ctx.lineWidth = 3;
      for (let ring = 0; ring < 5; ring++) {
        ctx.beginPath();
        ctx.ellipse(width - 180, 150, 90 + ring * 45, 38 + ring * 25, -0.25, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = selectedTheme.accent;
      ctx.font = 'bold 88px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(selectedTheme.motif, 70, 150);
      ctx.restore();

      ctx.strokeStyle = selectedTheme.accent;
      ctx.lineWidth = 6;
      ctx.strokeRect(30, 30, width - 60, height - 60);

      drawCard();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(renderReplyCard, 50);
    }
  }, [isOpen, myCall, replyToCall, date, time, band, frequency, mode, rstSent, rstRcvd, customBgImage, theme, imagePositionX, imagePositionY, imageZoom]);

  useEffect(() => {
    if (!customBgImage) return;
    localStorage.setItem('eqsl_reply_image_position_x', String(imagePositionX));
    localStorage.setItem('eqsl_reply_image_position_y', String(imagePositionY));
    localStorage.setItem('eqsl_reply_image_zoom', String(imageZoom));
  }, [customBgImage, imagePositionX, imagePositionY, imageZoom]);

  if (!isOpen) return null;

  const handleDownloadReplyPNG = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `eQSL_Respuesta_${myCall || 'OP'}_para_${replyToCall}_${date}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  const handleThemeChange = (nextTheme: string) => {
    setTheme(nextTheme);
    localStorage.setItem('eqsl_theme', nextTheme);
    setCustomBgImage(null);
    localStorage.removeItem('eqsl_custom_bg');
  };

  const createReplyCardLink = async (sendToInbox = false): Promise<string> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error('La vista previa de la eQSL todavía no está lista.');
    const activeMyCall = myCall.trim().toUpperCase() || (isCBStationBand(band) ? (localStorage.getItem('cb_station_callsign') || '') : DEFAULT_CALLSIGN);
    const response = await fetch('/api/eqsl-share', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: activeMyCall, to: replyToCall.trim().toUpperCase(), date, time, band, frequency, mode, rstSent, rstRcvd, isResponse: true, imageDataUrl: canvas.toDataURL('image/jpeg', 0.72) }),
    });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error(result.error || 'No se pudo preparar el enlace de la respuesta eQSL.');
    // Si la respuesta nace de una eQSL recibida en el casillero, entregarla automáticamente
    // al casillero del corresponsal. Las respuestas a eQSL externas no generan avisos de app.
    if (sendToInbox || initialData?.originalEqslId) {
      const identityToken = localStorage.getItem('community_chat_identity_token') || '';
      const identityCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (identityToken && identityCallsign) {
        try {
          const inboxResponse = await fetch('/api/eqsl-inbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: result.id, token: identityToken, callsign: identityCallsign, from: activeMyCall, to: replyToCall.trim().toUpperCase(), isResponse: true, date, band, mode }),
          });
          if (!inboxResponse.ok) {
            const deliveryError = await inboxResponse.json().catch(() => ({}));
            if (sendToInbox) throw new Error(deliveryError.error || 'El servidor no pudo entregar la respuesta al buzón eQSL POST.');
          }
          if (inboxResponse.ok && initialData?.originalEqslId) {
            await fetch('/api/eqsl-inbox', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ action: 'mark-answered', id: initialData.originalEqslId, token: identityToken, callsign: identityCallsign }),
            });
            window.dispatchEvent(new Event('eqsl-pending-count-updated'));
          }
        } catch (error) {
          if (sendToInbox) throw error;
          /* El enlace de respuesta se mantiene disponible si el buzón no responde. */
        }
      } else if (sendToInbox) {
        throw new Error('Primero guardá y verificá tu señal distintiva en el chat comunitario de este dispositivo.');
      }
  
    }
    return window.location.origin + '/?e=' + encodeURIComponent(result.id);
  };
  const handleSendReplyByEQSLPost = async () => {
    if (eqslPostSending) return;
    const identityToken = localStorage.getItem('community_chat_identity_token') || '';
    const identityCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    if (!identityToken || !identityCallsign) {
      setEqslPostStatus('Para enviar por eQSL POST, primero guardá y verificá tu señal distintiva en el chat comunitario de este dispositivo.');
      return;
    }
    if (!replyToCall.trim()) {
      setEqslPostStatus('Falta la señal distintiva del destinatario. Abrí la eQSL original desde su enlace para completar ese dato.');
      return;
    }
    setEqslPostSending(true);
    setEqslPostStatus('');
    try {
      await createReplyCardLink(true);
      setEqslPostStatus('Respuesta enviada al eQSL POST de ' + replyToCall.trim().toUpperCase() + '.');
      window.dispatchEvent(new Event('eqsl-pending-count-updated'));
    } catch (error) {
      setEqslPostStatus(error instanceof Error ? error.message : 'No se pudo enviar la respuesta por eQSL POST.');
    } finally {
      setEqslPostSending(false);
    }
  };

  // Intenta compartir siempre la misma tarjeta PNG mediante la hoja nativa del teléfono.
  // El navegador permite elegir WhatsApp, Telegram o correo si esas apps aceptan archivos.
  const shareReplyCardFile = async (text: string): Promise<boolean> => {
    const canvas = canvasRef.current;
    if (!canvas || typeof navigator.share !== 'function') return false;
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return false;
      const activeMyCall = myCall.trim().toUpperCase() || (isCBStationBand(band) ? (localStorage.getItem('cb_station_callsign') || '') : DEFAULT_CALLSIGN);
      const file = new File([blob], `eQSL_Respuesta_${activeMyCall}_para_${replyToCall}.png`, { type: 'image/png' });
      if (typeof navigator.canShare !== 'function' || !navigator.canShare({ files: [file] })) return false;
      await navigator.share({ files: [file], title: 'Respuesta eQSL', text });
      requestChatInvitation('reply');
      return true;
    } catch (error: any) {
      if (error?.name === 'AbortError') return true;
      return false;
    }
  };

  // Compartir la respuesta como tarjeta eQSL (imagen) y texto. El enlace lleva
  // siempre a la página principal: esta tarjeta ya es una confirmación recibida.
  const handleShareWhatsApp = async () => {
    if (!handleSaveToLocalLog()) return;
    const activeMyCall = myCall.trim().toUpperCase() || (isCBStationBand(band) ? (localStorage.getItem('cb_station_callsign') || '') : DEFAULT_CALLSIGN);
    let cardUrl = '';
    try { cardUrl = await createReplyCardLink(); } catch (error) { window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace de la tarjeta.'); return; }
    const text = getLocalizedEQSLNotification(getRecipientLanguage(initialData?.whatsapp, initialData?.replyToCall), 'reply', cardUrl);
    const rawPhone = String(initialData?.whatsapp || '').trim();
    const digits = rawPhone.replace(/[^0-9]/g, '');
    const cleanPhone = !rawPhone.startsWith('@') && digits.length >= 7 && digits.length <= 15 ? digits : '';

    // Mostrar la invitación antes de salir a WhatsApp; así no depende de que
    // el navegador conserve el evento después de cambiar de aplicación.
    requestChatInvitation('reply');

    // Si la eQSL original contiene el número, abrir directamente ese chat.
    // No usamos primero la hoja genérica de compartir, que obliga a elegir contacto.
    if (cleanPhone) {
      window.location.href = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
      return;
    }

    // Sin número verificado no es posible seleccionar automáticamente un destinatario.
    // Dejamos la respuesta preparada y explicamos por qué hace falta elegir contacto.
    if (await shareReplyCardFile(text)) return;
    window.location.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
  };

  const handleShareTelegram = async () => {
    if (!handleSaveToLocalLog()) return;
    const activeMyCall = myCall.trim().toUpperCase() || (isCBStationBand(band) ? (localStorage.getItem('cb_station_callsign') || '') : DEFAULT_CALLSIGN);
    let cardUrl = '';
    try { cardUrl = await createReplyCardLink(); } catch (error) { window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace de la tarjeta.'); return; }
    const text = getLocalizedEQSLNotification(getRecipientLanguage(initialData?.whatsapp, initialData?.replyToCall), 'reply', cardUrl);
    if (await shareReplyCardFile(text)) return;
    const username = String(initialData?.telegram || '').replace(/^@+/, '');
    const url = username
      ? 'https://t.me/' + encodeURIComponent(username) + '?text=' + encodeURIComponent(text)
      : 'https://t.me/share/url?url=' + encodeURIComponent(cardUrl) + '&text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener,noreferrer');
    requestChatInvitation('reply');
  };

  // El correo incluye el enlace a la tarjeta visual completa para verla y descargarla.
  const handleSendEmail = async () => {
    if (!emailTo.trim()) { window.alert('Ingresá el correo del remitente original o elegí WhatsApp o Telegram para responder.'); return; }
    if (!handleSaveToLocalLog()) return;
    const activeMyCall = myCall.trim().toUpperCase() || (isCBStationBand(band) ? (localStorage.getItem('cb_station_callsign') || '') : DEFAULT_CALLSIGN);
    let cardUrl = '';
    try { cardUrl = await createReplyCardLink(); } catch (error) { window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace de la tarjeta.'); return; }
    const subject = encodeURIComponent(`Respuesta a tu eQSL de ${activeMyCall}`);
    const body = encodeURIComponent(getLocalizedEQSLNotification(getRecipientLanguage(initialData?.whatsapp, initialData?.replyToCall), 'reply', cardUrl));
    requestChatInvitation('reply');
    window.location.href = `mailto:${emailTo.trim()}?subject=${subject}&body=${body}`;
  };
  // Guardar automáticamente el QSO de respuesta antes de abrir el canal externo.
  // La aplicación no puede confirmar si WhatsApp, Telegram o el cliente de correo terminó enviándolo.
  const handleSaveToLocalLog = (): boolean => {
    if (!onSaveQSO) return false;
    const normalizedCall = replyToCall.trim().toUpperCase();
    const normalizedMyCall = myCall.trim().toUpperCase() || (isCBStationBand(band) ? (localStorage.getItem('cb_station_callsign') || '') : DEFAULT_CALLSIGN);
    if (!normalizedCall || !normalizedMyCall || !date || !time || !frequency.trim() || !mode) {
      window.alert('Completá indicativos, fecha, hora, frecuencia y modo antes de guardar o enviar la eQSL.');
      return false;
    }
    const newQSO: QSO = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      callsign: normalizedCall,
      ...(/11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(band)) ? { stationCallsign: localStorage.getItem('cb_station_callsign') || normalizedMyCall } : {}),
      date,
      time,
      band,
      frequency: frequency.trim().replace(',', '.'),
      mode,
      rstSent: rstSent.trim() || '59',
      rstRcvd: rstRcvd.trim() || '59',
      email: emailTo.trim(),
      notes: `Respuesta recíproca a eQSL recibida de ${normalizedCall}`,
      qslSent: true,
      qslRcvd: true,
    };
    onSaveQSO(newQSO);
    // En la próxima entrada, ignorar cualquier enlace antiguo y abrir siempre Inicio.
    localStorage.setItem('logbook_return_home_after_reply', '1');
    setSavedToLog(true);
    return true;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-xs overflow-y-auto">
      <div className="bg-slate-900 border border-sky-500/30 rounded-2xl max-w-4xl w-full p-5 sm:p-6 shadow-2xl text-slate-100 my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Encabezado */}
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-sky-500/10 text-sky-400 rounded-lg">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Responder con mi eQSL · {replyToCall}
              </h2>
              <p className="text-xs text-slate-400">
                Emití tu tarjeta eQSL de respuesta con tu propia foto de fondo y confirmación 2-Way
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Inputs de confirmación rápida */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3 p-3 bg-slate-950/70 rounded-xl border border-slate-800">
          <div>
            <label className="block text-[11px] font-bold text-sky-400 uppercase mb-1">
              Mi Indicativo (Quien responde) *
            </label>
            <input
              type="text"
              value={myCall}
              onChange={(e) => setMyCall(e.target.value.toUpperCase())}
              placeholder="ej. LU1TSB, EA1EXP"
              className="w-full px-3 py-1.5 bg-slate-900 border border-sky-500/40 rounded-lg text-sm font-mono font-bold text-sky-300 focus:outline-hidden focus:border-sky-400"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-amber-400 uppercase mb-1">
              Responder a (Destinatario) *
            </label>
            <input
              type="text"
              value={replyToCall}
              onChange={(e) => setReplyToCall(e.target.value.toUpperCase())}
              placeholder="ej. LU1TSB"
              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-sm font-mono font-bold text-amber-300 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-300 mb-1">Email para responder (editable)</label>
            <input type="email" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} placeholder="correo del remitente original" className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white" />
          </div>
          <div>
            <label className="block text-[11px] text-slate-300 mb-1">
              Banda / Frecuencia
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={band}
                onChange={(e) => setBand(e.target.value)}
                className="w-20 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
              />
              <input
                type="text"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-white"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] text-slate-300 mb-1">
              RST Enviada / Recibida
            </label>
            <div className="flex gap-1">
              <input
                type="text"
                value={rstSent}
                onChange={(e) => setRstSent(e.target.value)}
                placeholder="59"
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-center text-white"
              />
              <input
                type="text"
                value={rstRcvd}
                onChange={(e) => setRstRcvd(e.target.value)}
                placeholder="59"
                className="w-full px-2 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-center text-white"
              />
            </div>
          </div>
        </div>

        {/* Selector de plantillas disponibles también en la respuesta */}
        <div className="mb-3">
          <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-300"><Palette className="w-4 h-4 text-sky-400" /> Elegí un diseño para tu eQSL de respuesta</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {REPLY_EQSL_THEMES.map((item) => (
              <button key={item.id} type="button" onClick={() => handleThemeChange(item.id)} aria-pressed={theme === item.id && !customBgImage}
                className={`rounded-xl border p-2.5 text-left transition-all ${theme === item.id && !customBgImage ? 'border-sky-400 ring-2 ring-sky-400/60 scale-[1.01]' : 'border-slate-700 hover:border-slate-500'}`}
                title={item.name}>
                <span className="block relative overflow-hidden rounded-lg border border-white/25 mb-2 aspect-[8/5] w-full shadow-md" style={{ background: `linear-gradient(135deg, ${item.start}, ${item.mid}, ${item.end})` }}>
                  <span className="absolute inset-x-0 top-2 text-[10px] sm:text-xs font-bold tracking-wider text-white/85 text-center">eQSL · RADIO</span>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-3xl sm:text-4xl leading-none drop-shadow">{item.motif}</span>
                  <span className="absolute right-2 bottom-2 text-[10px] sm:text-xs font-mono font-bold text-white/95">59 · 73</span>
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full border-2 opacity-50" style={{ borderColor: item.accent }} />
                  <span className="absolute inset-x-0 bottom-0 h-1" style={{ backgroundColor: item.accent }} />
                </span>
                <span className="block text-xs sm:text-sm leading-tight font-medium text-white/95">{item.name}</span>
                {theme === item.id && !customBgImage && <span className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-sky-300"><Check className="w-3 h-3" /> Seleccionado</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Foto desde la galería del dispositivo para la eQSL de respuesta */}
        <div className="mb-3 p-3 bg-slate-950/80 rounded-xl border border-sky-500/30 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-sky-400" />
            <div>
              <span className="block text-slate-100 font-semibold">Personalizá tu respuesta con una foto</span>
              <span className="block text-slate-400">Elegí una imagen de la galería de tu teléfono o dispositivo.</span>
            {customBgImage ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                ✓ Foto de galería cargada
              </span>
            ) : (
              <span className="text-slate-500">Fondo estándar azul</span>
            )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleUploadImage}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300 font-medium rounded-lg border border-sky-500/30 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {customBgImage ? 'Cambiar foto del dispositivo' : 'Elegir foto de la galería'}
            </button>

            {customBgImage && (
              <button
                type="button"
                onClick={() => setCustomBgImage(null)}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Quitar
              </button>
            )}
          </div>
        </div>

        {customBgImage && (
          <div className="mb-3 rounded-xl border border-sky-500/30 bg-slate-950/80 p-3 space-y-3">
            <p className="text-sm font-bold text-white">Ajuste táctil de la imagen</p>
            <p className="text-xs text-slate-300">Sobre la vista previa: arrastrá con un dedo para mover la foto y juntá/separá dos dedos para achicarla o ampliarla. También podés usar estos controles.</p>
            <div className="flex items-center gap-3">
              <button type="button" aria-label="Achicar imagen" onClick={() => setImageZoom((value) => Math.max(-50, value - 10))} className="min-w-11 rounded-lg border border-slate-700 px-3 py-2 text-lg font-bold text-white hover:bg-slate-800">−</button>
              <input aria-label="Tamaño de la imagen" type="range" min="-50" max="200" step="1" value={imageZoom} onChange={(event) => setImageZoom(Number(event.target.value))} className="w-full accent-sky-400" />
              <button type="button" aria-label="Ampliar imagen" onClick={() => setImageZoom((value) => Math.min(200, value + 10))} className="min-w-11 rounded-lg border border-slate-700 px-3 py-2 text-lg font-bold text-white hover:bg-slate-800">+</button>
              <span className="min-w-12 text-right text-xs tabular-nums text-sky-300">{Math.round(Math.max(0.5, 1 + imageZoom / 100) * 100)}%</span>
            </div>
            <button type="button" onClick={() => { setImagePositionX(0); setImagePositionY(0); setImageZoom(0); localStorage.setItem('eqsl_reply_image_position_x','0'); localStorage.setItem('eqsl_reply_image_position_y','0'); localStorage.setItem('eqsl_reply_image_zoom','0'); }} className="rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800">Centrar y restablecer tamaño</button>
          </div>
        )}

        {galleryImages.length > 0 && (
          <div className="mb-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
            <p className="mb-2 text-xs font-semibold text-slate-300">O elegir una foto guardada en Diseños eQSL</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {galleryImages.map((item) => (
                <button key={item.id} type="button" onClick={() => { setCustomBgImage(item.dataUrl); setImagePositionX(0); setImagePositionY(0); setImageZoom(0); }} className={`overflow-hidden rounded-lg border text-left ${customBgImage === item.dataUrl ? 'border-sky-400 ring-2 ring-sky-400/50' : 'border-slate-700'}`}>
                  <img src={item.dataUrl} alt={item.name} className="h-20 w-full object-cover" />
                  <span className="block truncate px-2 py-1 text-[10px] text-slate-200">{item.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Vista previa Canvas */}
        <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner flex items-center justify-center p-2 mb-4">
          <canvas
            ref={canvasRef}
            className="w-full h-auto max-h-[420px] object-contain rounded-lg shadow-2xl"
          />
          {customBgImage && (
            <div
              role="application"
              aria-label="Ajustar encuadre de la foto: arrastrá para mover y usá dos dedos para cambiar el zoom"
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onPointerCancel={handleImagePointerUp}
              onLostPointerCapture={handleImagePointerUp}
              className="absolute inset-2 z-10 rounded-lg cursor-grab active:cursor-grabbing"
              data-image-gesture="enabled"
              style={{ touchAction: 'none', userSelect: 'none' }}
            />
          )}
        </div>

        {/* Botones de acción */}
        {eqslPostStatus && <p role="status" className="mt-2 rounded-lg border border-amber-400/30 bg-amber-950/40 p-3 text-xs text-amber-100">{eqslPostStatus}</p>}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800">
          <div>
            {onSaveQSO && (
              <button
                type="button"
                onClick={handleSaveToLocalLog}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                {savedToLog ? <Check className="w-4 h-4 text-emerald-400" /> : <Radio className="w-4 h-4 text-amber-400" />}
                {savedToLog ? '¡Guardado en tu Logbook!' : 'Guardar en mi Logbook'}
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleSendReplyByEQSLPost} disabled={eqslPostSending} className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold rounded-lg shadow-sm disabled:opacity-60"><Mail className="w-4 h-4" />{eqslPostSending ? 'ENVIANDO…' : 'ENVIAR RESPUESTA POR eQSL POST'}</button>
            <button
              type="button"
              onClick={handleDownloadReplyPNG}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-lg border border-slate-700 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-sky-400" />
              Descargar PNG
            </button>

            <button
              type="button"
              onClick={handleSendEmail}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"
            >
              <Mail className="w-4 h-4" />
              Enviar por Email
            </button>

            <button type="button" onClick={handleShareTelegram} className="inline-flex items-center gap-1.5 px-4 py-2 bg-sky-700 hover:bg-sky-600 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors cursor-pointer"><MessageSquare className="w-4 h-4" /> Telegram</button>
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
