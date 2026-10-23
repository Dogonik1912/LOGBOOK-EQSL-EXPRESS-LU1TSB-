/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, MessageCircle, Download, Smartphone } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
  onOpenReplyModal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
  onOpenReplyModal,
}) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const [callsign, setCallsign] = useState(() => localStorage.getItem('user_callsign')?.trim().toUpperCase() || '');
  const [country, setCountry] = useState(() => localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
  const [headerImage, setHeaderImage] = useState(() => localStorage.getItem('app_header_image') || '');
  const [appIcon, setAppIcon] = useState(() => localStorage.getItem('app_icon_image') || '');

  useEffect(() => {
    const syncCallsign = () => {
      setCallsign(localStorage.getItem('user_callsign')?.trim().toUpperCase() || '');
      setCountry(localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
      setHeaderImage(localStorage.getItem('app_header_image') || '');
      const nextIcon = localStorage.getItem('app_icon_image') || '';
      setAppIcon(nextIcon);
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((link) => { link.href = nextIcon || '/icon.svg'; });
    };
    window.addEventListener('user-profile-updated', syncCallsign);
    window.addEventListener('storage', syncCallsign);
    window.addEventListener('user-branding-updated', syncCallsign);
    return () => {
      window.removeEventListener('user-profile-updated', syncCallsign);
      window.removeEventListener('storage', syncCallsign);
      window.removeEventListener('user-branding-updated', syncCallsign);
    };
  }, []);

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

  const handleInstall = () => {
    if (isInstalled) {
      window.alert('LogBook eQSL Express ya está instalada en este equipo.');
      return;
    }
    if (installPrompt) {
      void (async () => {
        try {
          await installPrompt.prompt();
          const choice = await installPrompt.userChoice;
          if (choice?.outcome === 'accepted') setIsInstalled(true);
        } finally {
          setInstallPrompt(null);
        }
      })();
      return;
    }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    window.alert(isIOS
      ? 'Para instalar en iPhone/iPad: tocá Compartir en Safari y elegí “Agregar a pantalla de inicio”.'
      : 'No hace falta ingresar correo ni teléfono. Para instalar, abrí el menú del navegador (⋮) y elegí “Instalar aplicación” o “Agregar a pantalla de inicio”. Si esa opción no aparece, la app puede seguir usándose desde el navegador.');
  };

  return (
    <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 sticky top-0 z-40">
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-3.5 md:pt-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3">
      {callsign && (
        <div className="absolute right-4 top-2 md:top-3 z-10">
          <span className="inline-flex min-w-[5.5rem] justify-center rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-sm sm:text-base font-extrabold shadow-sm" title={`Señal distintiva: ${callsign}`}>
            {callsign.split('').map((character, index) => (
              <span key={index} className={/^(argentina|ar|arg)$/.test(country) ? (/\d/.test(character) ? 'text-yellow-500' : 'text-sky-500') : 'text-slate-950'}>{character}</span>
            ))}
          </span>
        </div>
      )}
        {/* Marca */}
        <div className="flex items-center gap-3">
          <div className="p-1 bg-white rounded-xl shadow-lg">
            <img src={appIcon || "/icon.svg"} alt="LB EQSL EXPRESS" className="w-10 h-10 rounded-lg object-contain" />
          </div>
          <div className="min-w-0">
            {headerImage ? (
              <img src={headerImage} alt="Encabezamiento de LogBook eQSL Express" className="block max-h-20 max-w-full rounded-lg bg-white object-contain object-left" />
            ) : (
              <div className="rounded-lg bg-white px-3 py-1.5">
                <div className="text-center text-lg sm:text-xl font-extrabold tracking-tight text-sky-500 whitespace-nowrap">LOG BOOK</div>
                <h1 className="flex items-center justify-center gap-2 text-lg sm:text-xl font-extrabold tracking-tight whitespace-nowrap">
                  <span className="text-black font-black text-3xl sm:text-4xl leading-none" style={{ fontWeight: 900, WebkitTextStroke: '1px currentColor' }}>ℒ 𝔅</span><span className="text-sky-500">EQSL EXP<span className="text-3xl sm:text-4xl leading-none">R</span>ESS</span>
                </h1>
              </div>
            )}
            <p className="text-xs text-slate-400">Libro de guardia y tarjetas eQSL</p>
          </div>
        </div>

        {/* Zona derecha: instalación, compartir app, responder eQSL y ajustes */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
            href="https://wa.me/?text=LogBook%20eQSL%20Express%20-%20https%3A%2F%2Flogbook-eqsl-express-lu-1-tsb.vercel.app%2F"
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
