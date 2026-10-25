/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, MessageCircle, Download, Smartphone, Share2, Copy, ChevronDown } from 'lucide-react';

interface HeaderProps {
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
}) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const shareUrl = 'https://logbook-eqsl-express-lu-1-tsb.vercel.app/';
  const shareText = 'Compartí LogBook eQSL Express: registrá tus contactos de radio y enviá eQSL fácilmente.';
  const shareOptions = [
    { name: 'WhatsApp', mark: 'wa', color: 'bg-green-600', url: () => 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + shareUrl) },
    { name: 'Telegram', mark: 'tg', color: 'bg-sky-500', url: () => 'https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText) },
    { name: 'Instagram', mark: 'ig', color: 'bg-pink-600', url: () => 'https://www.instagram.com/' },
    { name: 'X', mark: 'X', color: 'bg-black', url: () => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(shareUrl) },
    { name: 'Facebook', mark: 'f', color: 'bg-blue-700', url: () => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl) },
    { name: 'TikTok', mark: '♪', color: 'bg-black', url: () => 'https://www.tiktok.com/' },
    { name: 'Messenger', mark: 'm', color: 'bg-blue-600', url: () => 'https://www.facebook.com/dialog/send?link=' + encodeURIComponent(shareUrl) },
    { name: 'Gmail', mark: 'M', color: 'bg-red-600', url: () => 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent('LogBook eQSL Express') + '&body=' + encodeURIComponent(shareText + '\\n' + shareUrl) },
    { name: 'Outlook', mark: 'O', color: 'bg-sky-700', url: () => 'https://outlook.live.com/mail/0/deeplink/compose?subject=' + encodeURIComponent('LogBook eQSL Express') + '&body=' + encodeURIComponent(shareText + '\\n' + shareUrl) },
  ];
  const handleShareChoice = async (name: string, url: string) => {
    setShareMenuOpen(false);
    if (name === 'Instagram' || name === 'TikTok') {
      try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); } catch { /* El usuario puede copiar el enlace manualmente si el navegador lo permite. */ }
      window.open(url, '_blank', 'noopener,noreferrer');
      window.alert('Copiá el enlace de LogBook eQSL Express y pegalo en tu publicación.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const [callsign, setCallsign] = useState(() => localStorage.getItem('user_callsign')?.trim().toUpperCase() || '');
  const [country, setCountry] = useState(() => localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
  // El encabezado queda bloqueado en la imagen que ya estaba mostrándose.
  // La galería de eQSL es independiente y nunca debe reemplazar esta imagen.
  const readHeaderImage = () => {
    // El encabezamiento queda fijo y separado de los fondos eQSL.
    // Si existe una copia protegida, se restaura incluso si se eliminó de la galería.
    const locked = localStorage.getItem('app_header_image_locked');
    if (locked) return locked;
    const explicitlyChosen = localStorage.getItem('app_header_image');
    if (explicitlyChosen) {
      localStorage.setItem('app_header_image_locked', explicitlyChosen);
      return explicitlyChosen;
    }
    return '';
  };
  const [headerImage, setHeaderImage] = useState(() => readHeaderImage());
  const [appIcon, setAppIcon] = useState(() => localStorage.getItem('app_icon_image') || '');

  useEffect(() => {
    const syncCallsign = () => {
      setCallsign(localStorage.getItem('user_callsign')?.trim().toUpperCase() || '');
      setCountry(localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
      setHeaderImage(readHeaderImage());
      const nextIcon = localStorage.getItem('app_icon_image') || '';
      setAppIcon(nextIcon);
      document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((link) => { link.href = nextIcon || '/icon.svg'; });
    };
    syncCallsign();
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
    document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
      link.href = appIcon || '/icon.svg';
    });
  }, [appIcon]);

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
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="shrink-0 p-1 bg-white rounded-xl shadow-lg">
            <img src={appIcon || "/icon.svg"} alt="LB EQSL EXPRESS" className="w-10 h-10 rounded-lg object-contain" />
          </div>
          <div className="min-w-0 flex-1 flex justify-center">
            {headerImage ? (
              <img src={headerImage} alt="Encabezamiento de LogBook eQSL Express" className="block h-20 sm:h-24 md:h-28 w-full max-w-[min(75vw,48rem)] rounded-lg bg-white p-1 object-contain object-center mx-auto" />
            ) : (
              <div className="h-20 sm:h-24 md:h-28 w-full max-w-[min(75vw,48rem)]" aria-hidden="true" />
            )}
          </div>
        </div>

        {/* Zona derecha: instalación, compartir app y ajustes */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={() => { void handleInstall(); }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
            title="Instalar LB EQSL EXPRESS en este equipo"
          >
            {isInstalled ? <Smartphone className="w-4 h-4" /> : <Download className="w-4 h-4" />}
            <span className="flex flex-col items-start leading-tight">
              <span>{isInstalled ? 'App instalada' : 'Instalar app'}</span>
              <span className="text-[10px] font-medium opacity-90">Muy liviana: ocupa muy poco espacio</span>
            </span>
          </button>

          {/* Compartir la aplicación en redes y correo */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShareMenuOpen((open) => !open)}
              aria-expanded={shareMenuOpen}
              aria-haspopup="menu"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer"
              title="Compartir LogBook eQSL Express en tus redes"
            >
              <Share2 className="w-4 h-4" />
              <span>Comparte esta app en tus redes</span>
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {shareMenuOpen && (
              <div role="menu" className="absolute right-0 top-full mt-2 z-50 w-60 rounded-xl border border-slate-700 bg-slate-900 p-2 shadow-2xl">
                <p className="px-2 py-1.5 text-[11px] text-slate-400">Elegí dónde compartir</p>
                <div className="grid grid-cols-2 gap-1">
                  {shareOptions.map((option) => (
                    <button key={option.name} type="button" role="menuitem"
                      onClick={() => handleShareChoice(option.name, option.url())}
                      className="flex items-center gap-2 rounded-lg px-2 py-2 text-left text-xs text-slate-100 hover:bg-slate-800">
                      <span className={option.color + " flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold text-white"}>{option.mark}</span>
                      <span>{option.name}</span>
                    </button>
                  ))}
                </div>
                <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); window.alert('Enlace copiado.'); } catch { window.prompt('Copiá el enlace de la app:', shareUrl); } setShareMenuOpen(false); }}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-xs text-slate-300 hover:bg-slate-800">
                  <Copy className="h-4 w-4" /> Copiar enlace de la app
                </button>
              </div>
            )}
          </div>

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
