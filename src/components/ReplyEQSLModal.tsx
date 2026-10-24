/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { QSO, DEFAULT_CALLSIGN } from '../types';
import { getFirma, getUserCallsign } from '../services/qrzService';
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
  const [theme, setTheme] = useState<string>(() => localStorage.getItem('eqsl_theme') || 'navy');
  const [savedToLog, setSavedToLog] = useState(false);

  useEffect(() => {
    if (isOpen && initialData) {
      setReplyToCall(initialData.replyToCall || DEFAULT_CALLSIGN);
      const defaultUser = getUserCallsign();
      // Si el usuario actual es el mismo que replyToCall, sugerimos dejar vacío o el otro
      setMyCall(initialData.myCall || (defaultUser !== initialData.replyToCall ? defaultUser : ''));
      setDate(initialData.date || new Date().toISOString().slice(0, 10));
      setTime(initialData.time || '12:00');
      setBand(initialData.band || '40m');
      setFrequency(initialData.frequency || '7.120');
      setMode(initialData.mode || 'SSB');
      setRstSent(initialData.rst || '59');
      setRstRcvd(initialData.rst || '59');
      setEmailTo(initialData.email || '');
      setCustomBgImage(localStorage.getItem('eqsl_custom_bg') || null);
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
      if (dataUrl) {
        setCustomBgImage(dataUrl);
      }
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

    const activeMyCall = myCall.trim().toUpperCase() || 'MI INDICATIVO';
    const activeTarget = replyToCall.trim().toUpperCase() || 'CORRESPONSAL';

    const drawCard = () => {
      ctx.textAlign = 'center';

      // Etiqueta de eQSL de Respuesta
      ctx.font = 'bold 22px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('CONFIRMING TWO-WAY RADIO CONTACT · eQSL DE RESPUESTA', width / 2, 80);

      // Indicativo enorme de quien responde
      ctx.font = '900 96px sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = 12;
      ctx.fillText(activeMyCall, width / 2, 190);
      ctx.shadowBlur = 0;

      // Subtítulo
      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`Radioaficionado Operador · Confirmación Recíproca de Contacto`, width / 2, 230);

      // Línea
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(100, 260);
      ctx.lineTo(width - 100, 260);
      ctx.stroke();

      // En respuesta a:
      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText('EN RESPUESTA Y CONFIRMACIÓN A LA eQSL DE:', width / 2, 310);

      // Indicativo del destinatario
      ctx.font = '900 70px monospace';
      ctx.fillStyle = '#fbbf24';
      ctx.shadowColor = 'rgba(0,0,0,0.9)';
      ctx.shadowBlur = 10;
      ctx.fillText(activeTarget, width / 2, 385);
      ctx.shadowBlur = 0;

      // Tabla de datos
      const boxX = 90;
      const boxY = 425;
      const boxW = width - 180;
      const boxH = 160;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(boxX, boxY, boxW, boxH);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.strokeRect(boxX, boxY, boxW, boxH);

      const cols = [
        { label: 'FECHA (UTC)', val: date },
        { label: 'HORA (UTC)', val: `${time} UTC` },
        { label: 'BANDA / FREQ', val: `${band} (${frequency} MHz)` },
        { label: 'MODO', val: mode },
        { label: 'RST ENVIADA / REC.', val: `${rstSent} / ${rstRcvd}` },
      ];

      const colW = boxW / cols.length;
      cols.forEach((col, idx) => {
        const cx = boxX + idx * colW + colW / 2;
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
          ctx.moveTo(boxX + (idx + 1) * colW, boxY + 15);
          ctx.lineTo(boxX + (idx + 1) * colW, boxY + boxH - 15);
          ctx.stroke();
        }
      });

      // PRIORIDAD 1: Firma dinámica
      const firma = `73 cordiales de ${activeMyCall || DEFAULT_CALLSIGN}`;
      ctx.textAlign = 'center';
      ctx.font = 'italic bold 24px serif';
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(firma, width / 2, 635);

      // Marca de agua obligatoria, negra e integrada en la imagen final.
      ctx.save();
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.shadowColor = 'rgba(255,255,255,0.85)';
      ctx.shadowBlur = 2;
      ctx.fillText('LogBook eQSL EXPRESS', width - 24, height - 18);
      ctx.restore();

    };

    if (customBgImage) {
      const img = new Image();
      img.onload = () => {
        const scale = Math.max(width / img.width, height / img.height);
        const x = (width - img.width * scale) / 2;
        const y = (height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        ctx.fillStyle = 'rgba(10, 15, 30, 0.75)';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 6;
        ctx.strokeRect(30, 30, width - 60, height - 60);

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(42, 42, width - 84, height - 84);

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
  }, [isOpen, myCall, replyToCall, date, time, band, frequency, mode, rstSent, rstRcvd, customBgImage, theme]);

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

  // Compartir la respuesta como tarjeta eQSL (imagen) y texto. El enlace lleva
  // siempre a la página principal: esta tarjeta ya es una confirmación recibida.
  const handleShareWhatsApp = async () => {
    if (!handleSaveToLocalLog()) return;
    const activeMyCall = myCall.trim().toUpperCase() || DEFAULT_CALLSIGN;
    const text = `📻 *Respuesta a tu Tarjeta eQSL*\\n` +
      `De: *${activeMyCall}* para: *${replyToCall}*\\n` +
      `🤝 ¡Contacto 2-Way Confirmado!\\n` +
      `📅 Fecha: ${date} ${time} UTC\\n` +
      `📡 Banda: ${band} (${frequency} MHz) · Modo: ${mode}\\n` +
      `📶 RST: ${rstSent} / ${rstRcvd}\\n\\n` +
      `73 cordiales de ${activeMyCall}\\n` +
      `LogBook eQSL Express\\n` +
      `Abrir la aplicación: ${window.location.origin}/`;

    const canvas = canvasRef.current;
    if (canvas && typeof navigator.share === 'function') {
      try {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (blob) {
          const file = new File([blob], `eQSL_Respuesta_${activeMyCall}_para_${replyToCall}.png`, { type: 'image/png' });
          if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Respuesta eQSL', text, url: window.location.origin + '/' });
            return;
          }
        }
      } catch (error: any) {
        if (error?.name === 'AbortError') return;
        // Si el navegador no permite compartir archivos, continuar con el enlace de texto.
      }
    }

    const rawPhone = String(initialData?.whatsapp || '').trim();
    const digits = rawPhone.replace(/[^0-9]/g, '');
    const cleanPhone = !rawPhone.startsWith('@') && digits.length >= 7 && digits.length <= 15 ? digits : '';
    const username = String(initialData?.whatsappUsername || '').replace(/^@+/, '');
    const message = (username ? 'Alias de WhatsApp del destinatario: @' + username + '\\n\\n' : '') + text;
    if (cleanPhone) {
      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    } else {
      window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer');
    }
  };

  const handleShareTelegram = () => {
    if (!handleSaveToLocalLog()) return;
    const activeMyCall = myCall.trim().toUpperCase() || DEFAULT_CALLSIGN;
    const text = '📻 Respuesta a tu eQSL\nDe: ' + activeMyCall + ' para: ' + replyToCall + '\n' +
      '🤝 Contacto confirmado · ' + date + ' ' + time + ' UTC\n' +
      '📡 ' + band + ' (' + frequency + ' MHz) · ' + mode + '\n' +
      '📶 RST: ' + rstSent + '/' + rstRcvd + '\n73 cordiales de ' + activeMyCall + '\nLogBook eQSL Express';
    const username = String(initialData?.telegram || '').replace(/^@+/, '');
    const url = username
      ? 'https://t.me/' + encodeURIComponent(username) + '?text=' + encodeURIComponent(text)
      : 'https://t.me/share/url?url=' + encodeURIComponent(window.location.origin) + '&text=' + encodeURIComponent(text);
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Enviar respuesta por Email
  const handleSendEmail = () => {
    if (!emailTo.trim()) {
      window.alert('Ingresá el correo del remitente original o elegí WhatsApp o Telegram para responder.');
      return;
    }
    if (!handleSaveToLocalLog()) return;
    const activeMyCall = myCall.trim().toUpperCase() || DEFAULT_CALLSIGN;
    const firma = `73 cordiales de ${activeMyCall}`;
    const subject = encodeURIComponent(`Respuesta eQSL de ${activeMyCall} para ${replyToCall} [${band} ${mode}]`);
    const body = encodeURIComponent(
      `Estimado colega de ${replyToCall},\n\n` +
      `He recibido tu confirmación y con gusto te respondo con mi eQSL recíproca:\n\n` +
      `• Mi Indicativo: ${activeMyCall}\n` +
      `• Tu Indicativo: ${replyToCall}\n` +
      `• Fecha: ${date} ${time} UTC\n` +
      `• Banda: ${band} (${frequency} MHz)\n` +
      `• Modo: ${mode}\n` +
      `• Reporte RST: ${rstSent} / ${rstRcvd}\n\n` +
      `¡Muchas gracias por el contacto y nos escuchamos en las frecuencias!\n\n` +
      `${firma}\n` +
      `LogBook eQSL Express`
    );

    const targetEmail = emailTo.trim();
    window.location.href = `mailto:${targetEmail}?subject=${subject}&body=${body}`;
  };

  // Guardar automáticamente el QSO de respuesta antes de abrir el canal externo.
  // La aplicación no puede confirmar si WhatsApp, Telegram o el cliente de correo terminó enviándolo.
  const handleSaveToLocalLog = (): boolean => {
    if (!onSaveQSO) return false;
    const normalizedCall = replyToCall.trim().toUpperCase();
    const normalizedMyCall = myCall.trim().toUpperCase() || DEFAULT_CALLSIGN;
    if (!normalizedCall || !normalizedMyCall || !date || !time || !frequency.trim() || !mode) {
      window.alert('Completá indicativos, fecha, hora, frecuencia y modo antes de guardar o enviar la eQSL.');
      return false;
    }
    const newQSO: QSO = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      callsign: normalizedCall,
      ...(band === '11 metros' ? { stationCallsign: localStorage.getItem('cb_station_callsign') || normalizedMyCall } : {}),
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

        {/* Barra de foto de fondo personalizada */}
        <div className="mb-3 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-sky-400" />
            <span className="text-slate-300 font-medium">Foto personalizada para tu eQSL:</span>
            {customBgImage ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                ✓ Foto de galería cargada
              </span>
            ) : (
              <span className="text-slate-500">Fondo estándar azul</span>
            )}
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
              {customBgImage ? 'Cambiar foto de galería' : 'Subir foto desde mi galería'}
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

        {/* Vista previa Canvas */}
        <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner flex items-center justify-center p-2 mb-4">
          <canvas
            ref={canvasRef}
            className="w-full h-auto max-h-[420px] object-contain rounded-lg shadow-2xl"
          />
        </div>

        {/* Botones de acción */}
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
