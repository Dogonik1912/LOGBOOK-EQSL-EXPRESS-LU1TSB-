/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Radio, Settings, Clock, MessageCircle, Download, Smartphone } from 'lucide-react';
import { getUserCallsign } from '../services/qrzService';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenReplyModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenReplyModal,
}) => {
  const [utcTime, setUtcTime] = useState('');
  const [utcDate, setUtcDate] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const callsign = getUserCallsign();

  useEffect(() => {
    const checkInstalled = () => setIsInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true);
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    checkInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', checkInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', checkInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice?.outcome === 'accepted') setIsInstalled(true);
      setInstallPrompt(null);
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.alert(isInstalled
      ? 'LB EQSL EXPRESS ya está instalada en este equipo.'
      : isIOS
        ? 'Para instalar en iPhone/iPad: tocá Compartir en Safari y elegí “Agregar a pantalla de inicio”.'
        : 'Para instalar: abrí el menú del navegador (⋮ o …) y elegí “Instalar aplicación” o “Agregar a pantalla de inicio”. En PC, buscá el icono de instalación en la barra de direcciones.');
  };

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
            <img src="/icon.svg" alt="LB EQSL EXPRESS" className="w-10 h-10 rounded-lg" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-white tracking-tight">
                LB <span className="text-amber-400">EQSL EXPRESS</span>
              </h1>
              <span className="px-2 py-0.5 bg-amber-400/10 border border-amber-400/30 text-amber-300 font-mono text-xs font-bold rounded-md">
                {callsign}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Libro de guardia y tarjetas eQSL
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

          <button
            type="button"
            onClick={() => { void handleInstall(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            title="Instalar LB EQSL EXPRESS en este equipo"
          >
            {isInstalled ? <Smartphone className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span>{isInstalled ? 'App instalada' : 'Instalar app'}</span>
          </button>

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
