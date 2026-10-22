/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Radio, Settings, Clock, Share2, ShieldCheck, AlertCircle, MessageCircle } from 'lucide-react';
import { getUserCallsign } from '../services/qrzService';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenQRZModal: () => void;
  onOpenReplyModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenQRZModal,
  onOpenReplyModal,
}) => {
  const [utcTime, setUtcTime] = useState('');
  const [utcDate, setUtcDate] = useState('');

  const callsign = getUserCallsign();
  const qrzUser = sessionStorage.getItem('qrz_user') || localStorage.getItem('qrz_user') || '';
  const qrzPass = sessionStorage.getItem('qrz_pass') || localStorage.getItem('qrz_pass') || '';
  const hasQRZ = Boolean(qrzUser && qrzPass);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const hh = String(now.getUTCHours()).padStart(2, '0');
      const mm = String(now.getUTCMinutes()).padStart(2, '0');
      const ss = String(now.getUTCSeconds()).padStart(2, '0');
      setUtcTime(`${hh}:${mm}:${ss}`);

      const y = now.getUTCFullYear();
      const m = String(now.getUTCMonth() + 1).padStart(2, '0');
      const d = String(now.getUTCDate()).padStart(2, '0');
      setUtcDate(`${y}-${m}-${d}`);
    };

    updateClock();
    const interval = setInterval(updateClock, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Marca y Callsign */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 rounded-xl shadow-lg shadow-amber-500/20">
            <Radio className="w-6 h-6 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                LogBook <span className="text-amber-400">eQSL Express</span>
              </h1>
              <span className="px-2 py-0.5 bg-amber-400/10 border border-amber-400/30 text-amber-300 font-mono text-xs font-bold rounded-md">
                {callsign}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Libro de Guardia y Generador de Tarjetas eQSL
            </p>
          </div>
        </div>

        {/* Zona derecha: Reloj UTC, QRZ Status, Compartir App WhatsApp y Ajustes */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Reloj UTC en Vivo */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl font-mono text-xs shadow-inner">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-slate-400 hidden sm:inline">{utcDate}</span>
            <span className="text-amber-300 font-bold">{utcTime} UTC</span>
          </div>

          {/* PRIORIDAD 2: Botón Compartir app por WhatsApp */}
          <a
            href="https://wa.me/?text=LogBook%20eQSL%20Express%20-%20https://logbook-eqsl-express.ai.studio/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-sm hover:shadow-emerald-500/20 transition-all cursor-pointer"
            title="Compartir app por WhatsApp"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
            <span>Compartir app por WhatsApp</span>
          </a>

          {/* Botón Responder eQSL */}
          {onOpenReplyModal && (
            <button
              type="button"
              onClick={onOpenReplyModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              title="Responder o confirmar una eQSL recibida de otro colega"
            >
              <span>Responder eQSL</span>
            </button>
          )}

          {/* Estado de conexión QRZ */}
          <button
            type="button"
            onClick={onOpenQRZModal}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
              hasQRZ
                ? 'bg-slate-950 border-emerald-500/30 text-emerald-400 hover:bg-emerald-950/20'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
            title="Configurar credenciales de QRZ.com para autocompletar correos"
          >
            {hasQRZ ? (
              <>
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">QRZ:</span> {qrzUser}
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                <span>Conectar QRZ</span>
              </>
            )}
          </button>

          {/* Botón Ajustes */}
          <button
            type="button"
            onClick={onOpenSettings}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer"
            title="Ajustes de estación"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
