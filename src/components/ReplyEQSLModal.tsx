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
  Share2,
  Image as ImageIcon,
  Check,
  Radio,
  Sparkles,
  ArrowRightLeft,
  Trash2
} from 'lucide-react';

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

      ctx.font = '16px monospace';
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('Desarrollado por LU1TSB · LogBook eQSL Express', width / 2, 680);
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
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, '#0c4a6e');
      grad.addColorStop(0.5, '#0f172a');
      grad.addColorStop(1, '#020617');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 6;
      ctx.strokeRect(30, 30, width - 60, height - 60);

      drawCard();
    }
  };

  useEffect(() => {
    if (isOpen) {
      setTimeout(renderReplyCard, 50);
    }
  }, [isOpen, myCall, replyToCall, date, time, band, frequency, mode, rstSent, rstRcvd, customBgImage]);

  if (!isOpen) return null;

  const handleDownloadReplyPNG = () => {
    if (!canvasRef.current) return;
    const link = document.createElement('a');
    link.download = `eQSL_Respuesta_${myCall || 'OP'}_para_${replyToCall}_${date}.png`;
    link.href = canvasRef.current.toDataURL('image/png');
    link.click();
  };

  // PRIORIDAD 1: Compartir respuesta por WhatsApp con firma dinámica
  const handleShareWhatsApp = () => {
    const activeMyCall = myCall.trim().toUpperCase() || DEFAULT_CALLSIGN;
    const firma = `73 cordiales de ${activeMyCall}`;
    const text = `📻 *Respuesta a tu Tarjeta eQSL*\n` +
      `De: *${activeMyCall}* para: *${replyToCall}*\n` +
      `🤝 ¡Contacto 2-Way Confirmado!\n` +
      `📅 Fecha: ${date} ${time} UTC\n` +
      `📡 Banda: ${band} (${frequency} MHz) · Modo: ${mode}\n` +
      `📶 RST: ${rstSent} / ${rstRcvd}\n\n` +
      `${firma}\n` +
      `LogBook eQSL Express`;

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  // Enviar respuesta por Email
  const handleSendEmail = () => {
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

    window.open(`mailto:${emailTo}?subject=${subject}&body=${body}`);
  };

  // Guardar en el Logbook local
  const handleSaveToLocalLog = () => {
    if (!onSaveQSO) return;
    const newQSO: QSO = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      callsign: replyToCall.trim().toUpperCase(),
      date,
      time,
      band,
      frequency,
      mode,
      rstSent,
      rstRcvd,
      email: emailTo.trim(),
      notes: `Respuesta recíproca a eQSL recibida de ${replyToCall}`,
      qslSent: true,
      qslRcvd: true,
    };
    onSaveQSO(newQSO);
    setSavedToLog(true);
    setTimeout(() => setSavedToLog(false), 2500);
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
