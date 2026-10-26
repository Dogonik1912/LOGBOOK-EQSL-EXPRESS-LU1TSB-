/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, MessageCircle, Download, Smartphone, Share2, Copy, ChevronDown } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { getInitialAppLanguage, getLocalizedShareText } from '../services/appLanguage';

interface HeaderProps {
  onOpenSettings: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenSettings,
}) => {
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [utcClock, setUtcClock] = useState(() => new Date().toISOString().slice(11, 19));
  const formatLocalDate = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`;
  };
  const [localDate, setLocalDate] = useState(() => formatLocalDate());
  useEffect(() => {
    const updateClocks = () => {
      const now = new Date();
      setUtcClock(now.toISOString().slice(11, 19));
      setLocalDate(formatLocalDate());
    };
    updateClocks();
    const timer = window.setInterval(updateClocks, 1000);
    return () => window.clearInterval(timer);
  }, []);
  const [isInstalled, setIsInstalled] = useState(false);
  const [shareMenuOpen, setShareMenuOpen] = useState(false);
  const [shareLanguage, setShareLanguage] = useState(() => getInitialAppLanguage());
  const shareUrl = 'https://logbook-eqsl-express-lu-1-tsb.vercel.app/';
  const shareText = getLocalizedShareText(shareLanguage);
  const shareOptions = [
    { name: 'WhatsApp', mark: 'wa', color: 'bg-green-600', url: () => 'https://wa.me/?text=' + encodeURIComponent(shareText + ' ' + shareUrl) },
    { name: 'Telegram', mark: 'tg', color: 'bg-sky-500', url: () => 'https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText) },
    { name: 'Instagram', mark: 'ig', color: 'bg-pink-600', url: () => 'https://www.instagram.com/' },
    { name: 'X', mark: 'X', color: 'bg-black', url: () => 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(shareText) + '&url=' + encodeURIComponent(shareUrl) },
    { name: 'Facebook', mark: 'f', color: 'bg-blue-700', url: () => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(shareUrl) },
    { name: 'TikTok', mark: '♪', color: 'bg-black', url: () => 'https://www.tiktok.com/' },
    { name: 'Messenger', mark: 'm', color: 'bg-blue-600', url: () => 'https://www.facebook.com/dialog/send?link=' + encodeURIComponent(shareUrl) },
    { name: 'Gmail', mark: 'M', color: 'bg-red-600', url: () => 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent('LogBook eQSL EXPRESS') + '&body=' + encodeURIComponent(shareText + '\\n' + shareUrl) },
    { name: 'Outlook', mark: 'O', color: 'bg-sky-700', url: () => 'https://outlook.live.com/mail/0/deeplink/compose?subject=' + encodeURIComponent('LogBook eQSL Express') + '&body=' + encodeURIComponent(shareText + '\\n' + shareUrl) },
  ];
  const handleShareChoice = async (name: string, url: string) => {
    setShareMenuOpen(false);
    if (name === 'Facebook' || name === 'Messenger') {
      // En móviles, el menú nativo permite compartir y volver a la app sin
      // navegar la pestaña actual hacia el diálogo externo de Facebook.
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ title: 'LogBook eQSL Express', text: shareText, url: shareUrl });
          return;
        } catch (error) {
          // Cancelar el menú de compartir no debe sacar al usuario de LogBook.
          if ((error as Error)?.name === 'AbortError') return;
        }
      }
      try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); } catch { /* Se ofrece copiar manualmente abajo. */ }
      window.alert('No se abrió el menú para compartir. El enlace está copiado si tu navegador lo permite; seguís en LogBook.');
      return;
    }
    if (name === 'Instagram' || name === 'TikTok') {
      try { await navigator.clipboard.writeText(shareText + ' ' + shareUrl); } catch { /* El usuario puede copiar el enlace manualmente si el navegador lo permite. */ }
      window.open(url, '_blank', 'noopener,noreferrer');
      window.alert('Copiá el enlace de LogBook eQSL Express y pegalo en tu publicación.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const readCallsign = () => (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
  const [callsign, setCallsign] = useState(() => readCallsign());
  const [country, setCountry] = useState(() => localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
  // El encabezado queda bloqueado en la imagen que ya estaba mostrándose.
  // La galería de eQSL es independiente y nunca debe reemplazar esta imagen.
  const readHeaderImage = () => {
    // El encabezamiento usa exclusivamente su propia imagen, no la imagen anclada
    // como fondo eQSL. La selección explícita tiene prioridad sobre copias antiguas.
    const explicitlyChosen = localStorage.getItem('app_header_image');
    if (explicitlyChosen) {
      if (localStorage.getItem('app_header_image_locked') !== explicitlyChosen) {
        localStorage.setItem('app_header_image_locked', explicitlyChosen);
      }
      return explicitlyChosen;
    }
    return localStorage.getItem('app_header_image_locked') || '';
  };
  const [headerImage, setHeaderImage] = useState(() => readHeaderImage());
  const [appIcon, setAppIcon] = useState(() => localStorage.getItem('app_icon_image') || '');

  useEffect(() => {
    const syncCallsign = async () => {
      const savedCallsign = readCallsign();
      setCallsign(savedCallsign);
      // If the local label was lost but this device still has its identity token,
      // recover the callsign associated with that token from the public-chat RPC.
      if (!savedCallsign && supabase) {
        const token = localStorage.getItem('community_chat_identity_token') || '';
        if (token) {
          const { data, error } = await supabase.rpc('resolve_community_callsign', { p_token: token });
          const recovered = !error && typeof data === 'string' ? data.trim().toUpperCase() : '';
          if (recovered) {
            localStorage.setItem('community_chat_sd', recovered);
            setCallsign(recovered);
            window.dispatchEvent(new Event('user-profile-updated'));
          }
        }
      }
      setCountry(localStorage.getItem('user_country')?.trim().toLowerCase() || 'argentina');
      setShareLanguage(getInitialAppLanguage());
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
    const checkInstalled = () => {
      const runningStandalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
      const previouslyInstalled = localStorage.getItem('logbook_pwa_installed') === '1';
      if (runningStandalone || previouslyInstalled) setIsInstalled(true);
    };
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event);
    };
    const onAppInstalled = () => {
      localStorage.setItem('logbook_pwa_installed', '1');
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    checkInstalled();
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onAppInstalled);
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
      <div className="relative w-full px-2 sm:px-4 pt-12 pb-3.5 md:pt-3.5 flex flex-col gap-3">
      <div className="absolute left-2 top-2 md:top-3 z-10 flex flex-col items-start gap-1" title="Hora UTC y fecha local de este dispositivo"><div className="flex items-center gap-2 rounded-md border border-black bg-black px-3 py-2 font-mono text-2xl sm:text-3xl font-extrabold shadow-sm"><span className="rounded-sm bg-white px-1.5 py-0.5 text-black">UTC</span><span className="text-white">{utcClock}</span></div><div className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs sm:text-sm font-extrabold shadow-sm"><span className="text-black">{localDate.split("/").slice(0, 2).join("/")}/</span><span className="text-red-600">{localDate.split("/")[2]}</span></div></div>
      {callsign && (
        <div className="absolute right-2 top-2 md:top-3 z-10">
          <span className="inline-flex min-w-[5.5rem] justify-center rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-sm sm:text-base font-extrabold shadow-sm" title={`Señal distintiva: ${callsign}`}>
            {callsign.split('').map((character, index) => (
              <span key={index} className={/^(argentina|ar|arg)$/.test(country) ? (/\d/.test(character) ? 'text-yellow-500' : 'text-sky-500') : 'text-slate-950'}>{character}</span>
            ))}
          </span>
        </div>
      )}
        {/* Encabezamiento panorámico LogBook eQSL EXPRESS */}
        <div className="w-full overflow-hidden">
          <img src="/logbook-header.svg" alt="LogBook eQSL EXPRESS" className="block w-full h-auto max-h-44 sm:max-h-52 object-contain object-center mx-auto" />
        </div>

        {/* Zona derecha: instalación, compartir app y ajustes */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {!isInstalled && <button
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
          </button>}

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
