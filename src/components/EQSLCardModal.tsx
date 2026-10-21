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
  Copy,
  ExternalLink,
  MessageSquare
} from 'lucide-react';

interface EQSLCardModalProps {
  qso: QSO | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkSent: (qsoId: string) => void;
  onOpenReply?: (qso: QSO) => void;
}

export const EQSLCardModal: React.FC<EQSLCardModalProps> = ({
  qso,
  isOpen,
  onClose,
  onMarkSent,
  onOpenReply,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [theme, setTheme] = useState<'navy' | 'gold' | 'cyber'>('navy');
  const [customBgImage, setCustomBgImage] = useState<string | null>(() => {
    return localStorage.getItem('eqsl_custom_bg') || null;
  });
  const [copied, setCopied] = useState(false);

  const myCallsign = getUserCallsign();
  const myName = localStorage.getItem('user_name') || 'Operador LU1TSB';
  const myQth = localStorage.getItem('user_qth') || 'Argentina';
  const myGrid = localStorage.getItem('user_grid') || 'GF05te';

  // Cargar imagen personalizada desde la galería/dispositivo
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        setCustomBgImage(dataUrl);
        localStorage.setItem('eqsl_custom_bg', dataUrl);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
      ctx.fillText(myCallsign, width / 2, 190);
      ctx.shadowBlur = 0;

      // Información del emisor (Nombre, QTH, Grid)
      ctx.font = '22px sans-serif';
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(`${myName} · ${myQth} · Grid: ${myGrid}`, width / 2, 230);

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
        { label: 'RST 2-WAY', val: `${qso.rstSent} / ${qso.rstRcvd}` },
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
      const firma = getFirma();
      ctx.textAlign = 'center';
      ctx.font = 'italic bold 24px serif';
      ctx.fillStyle = theme === 'cyber' ? '#7dd3fc' : '#fde047';
      ctx.fillText(firma, width / 2, 635);

      // Marca de agua y crédito inferior
      ctx.font = '16px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Desarrollado por LU1TSB · LogBook eQSL Express', width / 2, 680);
    };

    if (customBgImage) {
      const img = new Image();
      img.onload = () => {
        // Dibujar imagen cubriendo el canvas respetando proporción
        const scale = Math.max(width / img.width, height / img.height);
        const x = (width - img.width * scale) / 2;
        const y = (height - img.height * scale) / 2;
        ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

        // Capa oscura translúcida para legibilidad profesional
        ctx.fillStyle = 'rgba(10, 15, 30, 0.72)';
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
      // Fondo según tema
      if (theme === 'navy') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1e293b');
        grad.addColorStop(1, '#090d16');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 6;
        ctx.strokeRect(30, 30, width - 60, height - 60);

        ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(42, 42, width - 84, height - 84);
      } else if (theme === 'gold') {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#1c1917');
        grad.addColorStop(0.5, '#292524');
        grad.addColorStop(1, '#0c0a09');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 8;
        ctx.strokeRect(30, 30, width - 60, height - 60);
      } else {
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#020617');
        grad.addColorStop(0.5, '#0f172a');
        grad.addColorStop(1, '#030712');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 6;
        ctx.strokeRect(30, 30, width - 60, height - 60);
      }

      drawCardContent();
    }
  };

  useEffect(() => {
    if (isOpen && qso) {
      setTimeout(renderCard, 50);
    }
  }, [isOpen, qso, theme, customBgImage]);

  if (!isOpen || !qso) return null;

  // Enlace para que el corresponsal que reciba el mensaje pueda responder con su propia eQSL
  const getReplyUrl = () => {
    const origin = window.location.origin;
    const params = new URLSearchParams({
      reply_to: myCallsign,
      to_call: qso.callsign,
      date: qso.date,
      time: qso.time,
      band: qso.band,
      freq: qso.frequency,
      mode: qso.mode,
      rst: qso.rstSent,
      email: qso.email || '',
      wa: qso.whatsapp || '',
    });
    return `${origin}/?${params.toString()}`;
  };

  // Descargar archivo PNG
  const handleDownloadPNG = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `eQSL_${myCallsign}_${qso.callsign}_${qso.date}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
    onMarkSent(qso.id);
  };

  // PRIORIDAD 1: Compartir por WhatsApp con firma dinámica y link de respuesta eQSL
  const handleShareWhatsApp = () => {
    const firma = getFirma();
    const replyLink = getReplyUrl();
    const text = `📻 *Tarjeta eQSL Oficial*\n` +
      `De: *${myCallsign}* para: *${qso.callsign}*\n` +
      `📅 Contacto: ${qso.date} ${qso.time} UTC\n` +
      `📡 ${qso.band} (${qso.frequency} MHz) · Modo: ${qso.mode}\n` +
      `📶 RST: ${qso.rstSent}/${qso.rstRcvd}\n` +
      (qso.grid ? `🌐 Grid: ${qso.grid}\n` : '') +
      `\n${firma}\n\n` +
      `💌 *¿Querés responder con tu eQSL?*\n` +
      `Ingresá aquí para emitir tu confirmación recíproca gratuita:\n${replyLink}`;

    const cleanPhone = qso.whatsapp ? qso.whatsapp.replace(/[^0-9]/g, '') : '';
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    onMarkSent(qso.id);
  };

  // Enviar por Email (con link de respuesta eQSL y firma dinámica)
  const handleSendEmail = () => {
    const firma = getFirma();
    const replyLink = getReplyUrl();
    const subject = encodeURIComponent(`Tarjeta eQSL de ${myCallsign} para ${qso.callsign} [${qso.band} ${qso.mode}]`);
    const body = encodeURIComponent(
      `Hola colega ${qso.callsign},\n\n` +
      `Te confirmo con mucho agrado nuestro contacto en radio:\n\n` +
      `• Mi Indicativo: ${myCallsign} (${myName})\n` +
      `• Tu Indicativo: ${qso.callsign}\n` +
      `• Fecha: ${qso.date}\n` +
      `• Hora: ${qso.time} UTC\n` +
      `• Banda: ${qso.band} (${qso.frequency} MHz)\n` +
      `• Modo: ${qso.mode}\n` +
      `• Reporte RST: ${qso.rstSent} / ${qso.rstRcvd}\n` +
      (qso.grid ? `• Mi Grid: ${myGrid}\n` : '') +
      `\n¡Gracias por el QSO y espero reencontrarte en el éter!\n\n` +
      `💌 RESPONDER CON TU eQSL:\n` +
      `Podés generar y enviarme tu eQSL de respuesta con tu propia foto haciendo clic aquí:\n` +
      `${replyLink}\n\n` +
      `${firma}\n` +
      `LogBook eQSL Express`
    );

    const targetEmail = qso.email || '';
    window.open(`mailto:${targetEmail}?subject=${subject}&body=${body}`);
    onMarkSent(qso.id);
  };

  // Copiar resumen del QSO con link de respuesta
  const handleCopyText = () => {
    const firma = getFirma();
    const replyLink = getReplyUrl();
    const text = `QSO Confirmado: ${myCallsign} <-> ${qso.callsign} | ${qso.date} ${qso.time} UTC | ${qso.band} ${qso.frequency}MHz ${qso.mode} | RST: ${qso.rstSent}/${qso.rstRcvd} | ${firma} | Responder con eQSL: ${replyLink}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
            {/* Selector de tema o foto */}
            <div className="hidden sm:flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setTheme('navy')}
                className={`px-2 py-0.5 text-xs rounded-md transition-colors cursor-pointer ${
                  theme === 'navy' && !customBgImage ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Navy
              </button>
              <button
                type="button"
                onClick={() => setTheme('gold')}
                className={`px-2 py-0.5 text-xs rounded-md transition-colors cursor-pointer ${
                  theme === 'gold' && !customBgImage ? 'bg-amber-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Dorado
              </button>
              <button
                type="button"
                onClick={() => setTheme('cyber')}
                className={`px-2 py-0.5 text-xs rounded-md transition-colors cursor-pointer ${
                  theme === 'cyber' && !customBgImage ? 'bg-sky-500 text-slate-950 font-bold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Cyber
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Barra de personalización de imagen de fondo desde Galería */}
        <div className="mb-3 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-amber-400" />
            <span className="text-slate-300 font-medium">Foto de fondo para tu tarjeta:</span>
            {customBgImage ? (
              <span className="text-emerald-400 font-semibold flex items-center gap-1">
                ✓ Imagen de galería activa
              </span>
            ) : (
              <span className="text-slate-500">Diseño por defecto activo</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-medium rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              {customBgImage ? 'Cambiar foto de galería' : 'Cargar foto desde mi galería'}
            </button>

            {customBgImage && (
              <button
                type="button"
                onClick={handleRemoveCustomImage}
                className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 rounded-lg border border-slate-700 transition-colors cursor-pointer"
                title="Quitar foto y volver al diseño clásico"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Quitar foto
              </button>
            )}
          </div>
        </div>

        {/* Vista previa Canvas */}
        <div className="relative w-full rounded-xl overflow-hidden border border-slate-800 bg-slate-950 shadow-inner flex items-center justify-center p-2 mb-4">
          <canvas
            ref={canvasRef}
            className="w-full h-auto max-h-[440px] object-contain rounded-lg shadow-2xl"
          />
        </div>

        {/* Destinatario, correo y opción de respuesta */}
        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="text-xs text-slate-300 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-slate-400">Destinatario:</span>
              <strong className="text-amber-300 font-mono text-sm">{qso.callsign}</strong>
              {qso.email ? (
                <span className="text-sky-400">({qso.email})</span>
              ) : (
                <span className="text-slate-500 italic">(Sin email)</span>
              )}
            </div>
            {qso.whatsapp && (
              <div className="flex items-center gap-1.5 text-emerald-400 font-mono text-[11px]">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>WhatsApp: +{qso.whatsapp}</span>
              </div>
            )}
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

        {/* Botones de acción principales */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            Firma activa: <span className="text-amber-300 font-semibold">{getFirma()}</span>
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
