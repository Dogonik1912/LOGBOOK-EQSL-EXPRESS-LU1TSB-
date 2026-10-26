/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Settings, MessageCircle, Download, Smartphone, Share2, Copy, ChevronDown, Thermometer, Droplets } from 'lucide-react';
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
  const [localWeather, setLocalWeather] = useState<{ temperature: number; humidity: number } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const loadWeather = async () => {
      try {
        // Ubicación aproximada por IP: no solicita permiso de geolocalización al navegador.
        const locationResponse = await fetch('https://ipapi.co/json/');
        if (!locationResponse.ok) throw new Error('Location unavailable');
        const location = await locationResponse.json();
        // Si el operador no configuró un país, usar el código aproximado por IP
        // para elegir los colores de la bandera. No se solicita GPS ni permiso.
        if (!localStorage.getItem('user_country') && typeof location?.country_code === 'string' && location.country_code.trim()) {
          const detectedCountry = location.country_code.trim().toLowerCase();
          localStorage.setItem('user_country', detectedCountry);
          setCountry(detectedCountry);
        }
        const latitude = Number(location?.latitude);
        const longitude = Number(location?.longitude);
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new Error('Location unavailable');
        const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(String(latitude)) +
          '&longitude=' + encodeURIComponent(String(longitude)) +
          '&current=temperature_2m,relative_humidity_2m&timezone=auto';
        const weatherResponse = await fetch(url);
        if (!weatherResponse.ok) throw new Error('Weather unavailable');
        const data = await weatherResponse.json();
        if (cancelled) return;
        const temperature = Number(data?.current?.temperature_2m);
        const humidity = Number(data?.current?.relative_humidity_2m);
        if (Number.isFinite(temperature) && Number.isFinite(humidity)) {
          setLocalWeather({ temperature: Math.round(temperature), humidity: Math.round(humidity) });
        }
      } catch {
        // Si los servicios no responden, ocultamos los valores en vez de inventarlos.
        if (!cancelled) setLocalWeather(null);
      }
    };
    void loadWeather();
    const refreshTimer = window.setInterval(() => { void loadWeather(); }, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, []);
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

  // Colores del indicativo inspirados en la bandera del país seleccionado.
  // Se admiten nombres habituales y códigos de país guardados por la app.
  const getCallsignCharacterClass = (character: string, countryValue: string) => {
    const key = (countryValue || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const palettes: Record<string, { letters: string; digits: string }> = {
      argentina: { letters: 'text-sky-500', digits: 'text-yellow-500' }, ar: { letters: 'text-sky-500', digits: 'text-yellow-500' }, arg: { letters: 'text-sky-500', digits: 'text-yellow-500' },
      brasil: { letters: 'text-green-600', digits: 'text-yellow-500' }, brazil: { letters: 'text-green-600', digits: 'text-yellow-500' }, br: { letters: 'text-green-600', digits: 'text-yellow-500' },
      espana: { letters: 'text-red-600', digits: 'text-yellow-500' }, spain: { letters: 'text-red-600', digits: 'text-yellow-500' }, es: { letters: 'text-red-600', digits: 'text-yellow-500' },
      uruguay: { letters: 'text-sky-500', digits: 'text-yellow-500' }, uy: { letters: 'text-sky-500', digits: 'text-yellow-500' },
      colombia: { letters: 'text-blue-600', digits: 'text-yellow-500' }, co: { letters: 'text-blue-600', digits: 'text-yellow-500' },
      venezuela: { letters: 'text-blue-600', digits: 'text-yellow-500' }, ve: { letters: 'text-blue-600', digits: 'text-yellow-500' },
      ecuador: { letters: 'text-blue-700', digits: 'text-yellow-500' }, ec: { letters: 'text-blue-700', digits: 'text-yellow-500' },
      chile: { letters: 'text-red-600', digits: 'text-blue-600' }, cl: { letters: 'text-red-600', digits: 'text-blue-600' },
      mexico: { letters: 'text-green-600', digits: 'text-red-600' }, mx: { letters: 'text-green-600', digits: 'text-red-600' },
      portugal: { letters: 'text-green-600', digits: 'text-red-600' }, pt: { letters: 'text-green-600', digits: 'text-red-600' },
      italia: { letters: 'text-green-600', digits: 'text-red-600' }, italy: { letters: 'text-green-600', digits: 'text-red-600' }, it: { letters: 'text-green-600', digits: 'text-red-600' },
      francia: { letters: 'text-blue-700', digits: 'text-red-600' }, france: { letters: 'text-blue-700', digits: 'text-red-600' }, fr: { letters: 'text-blue-700', digits: 'text-red-600' },
      alemania: { letters: 'text-red-600', digits: 'text-yellow-500' }, germany: { letters: 'text-red-600', digits: 'text-yellow-500' }, de: { letters: 'text-red-600', digits: 'text-yellow-500' },
      'estados unidos': { letters: 'text-blue-700', digits: 'text-red-600' }, usa: { letters: 'text-blue-700', digits: 'text-red-600' }, us: { letters: 'text-blue-700', digits: 'text-red-600' },
      'reino unido': { letters: 'text-blue-700', digits: 'text-red-600' }, uk: { letters: 'text-blue-700', digits: 'text-red-600' }, gb: { letters: 'text-blue-700', digits: 'text-red-600' },
      canada: { letters: 'text-red-600', digits: 'text-red-600' }, ca: { letters: 'text-red-600', digits: 'text-red-600' },
      japon: { letters: 'text-red-600', digits: 'text-slate-950' }, japan: { letters: 'text-red-600', digits: 'text-slate-950' }, jp: { letters: 'text-red-600', digits: 'text-slate-950' },
      australia: { letters: 'text-blue-700', digits: 'text-red-600' }, au: { letters: 'text-blue-700', digits: 'text-red-600' },
      'nueva zelanda': { letters: 'text-blue-700', digits: 'text-red-600' }, 'new zealand': { letters: 'text-blue-700', digits: 'text-red-600' }, nz: { letters: 'text-blue-700', digits: 'text-red-600' },
      paraguay: { letters: 'text-red-600', digits: 'text-blue-700' }, py: { letters: 'text-red-600', digits: 'text-blue-700' },
      bolivia: { letters: 'text-green-600', digits: 'text-red-600' }, bo: { letters: 'text-green-600', digits: 'text-red-600' },
      peru: { letters: 'text-red-600', digits: 'text-red-600' }, pe: { letters: 'text-red-600', digits: 'text-red-600' },
      // Países adicionales (códigos ISO y nombres comunes); los tonos representan colores de sus banderas.
      af: { letters: 'text-green-600', digits: 'text-red-600' }, al: { letters: 'text-red-600', digits: 'text-slate-950' },
      dz: { letters: 'text-green-600', digits: 'text-red-600' }, ad: { letters: 'text-red-600', digits: 'text-yellow-500' },
      ao: { letters: 'text-red-600', digits: 'text-yellow-500' }, ag: { letters: 'text-red-600', digits: 'text-blue-700' },
      am: { letters: 'text-red-600', digits: 'text-blue-700' }, az: { letters: 'text-blue-700', digits: 'text-red-600' },
      bs: { letters: 'text-blue-700', digits: 'text-yellow-500' }, bh: { letters: 'text-red-600', digits: 'text-slate-950' },
      bd: { letters: 'text-green-600', digits: 'text-red-600' }, bb: { letters: 'text-blue-700', digits: 'text-yellow-500' },
      by: { letters: 'text-red-600', digits: 'text-green-600' }, bz: { letters: 'text-blue-700', digits: 'text-red-600' },
      bj: { letters: 'text-green-600', digits: 'text-yellow-500' }, bt: { letters: 'text-yellow-500', digits: 'text-orange-600' },
      ba: { letters: 'text-blue-700', digits: 'text-yellow-500' }, bw: { letters: 'text-sky-500', digits: 'text-slate-950' },
      bn: { letters: 'text-yellow-500', digits: 'text-slate-950' }, bg: { letters: 'text-red-600', digits: 'text-green-600' },
      bf: { letters: 'text-red-600', digits: 'text-green-600' }, bi: { letters: 'text-red-600', digits: 'text-green-600' },
      kh: { letters: 'text-blue-700', digits: 'text-red-600' }, cm: { letters: 'text-green-600', digits: 'text-red-600' },
      cv: { letters: 'text-blue-700', digits: 'text-red-600' }, cf: { letters: 'text-blue-700', digits: 'text-green-600' },
      td: { letters: 'text-blue-700', digits: 'text-red-600' }, cn: { letters: 'text-red-600', digits: 'text-yellow-500' },
      km: { letters: 'text-green-600', digits: 'text-yellow-500' }, cg: { letters: 'text-green-600', digits: 'text-red-600' },
      cd: { letters: 'text-blue-700', digits: 'text-red-600' }, ci: { letters: 'text-orange-600', digits: 'text-green-600' },
      hr: { letters: 'text-red-600', digits: 'text-blue-700' }, cy: { letters: 'text-orange-500', digits: 'text-green-600' },
      dj: { letters: 'text-sky-500', digits: 'text-green-600' }, dm: { letters: 'text-green-600', digits: 'text-yellow-500' },
      eg: { letters: 'text-red-600', digits: 'text-slate-950' }, sv: { letters: 'text-blue-700', digits: 'text-yellow-500' },
      er: { letters: 'text-red-600', digits: 'text-green-600' }, ee: { letters: 'text-blue-700', digits: 'text-slate-950' },
      et: { letters: 'text-blue-700', digits: 'text-slate-950' }, fj: { letters: 'text-sky-500', digits: 'text-red-600' },
      ga: { letters: 'text-green-600', digits: 'text-yellow-500' }, gm: { letters: 'text-red-600', digits: 'text-green-600' },
      ge: { letters: 'text-red-600', digits: 'text-slate-950' }, gh: { letters: 'text-green-600', digits: 'text-yellow-500' },
      gd: { letters: 'text-red-600', digits: 'text-yellow-500' }, gt: { letters: 'text-sky-500', digits: 'text-slate-950' },
      gn: { letters: 'text-green-600', digits: 'text-yellow-500' }, gw: { letters: 'text-red-600', digits: 'text-green-600' },
      gy: { letters: 'text-green-600', digits: 'text-yellow-500' }, ht: { letters: 'text-blue-700', digits: 'text-red-600' },
      hn: { letters: 'text-sky-500', digits: 'text-slate-950' }, is: { letters: 'text-blue-700', digits: 'text-red-600' },
      ir: { letters: 'text-green-600', digits: 'text-red-600' }, iq: { letters: 'text-red-600', digits: 'text-green-600' },
      il: { letters: 'text-blue-700', digits: 'text-slate-950' }, jm: { letters: 'text-green-600', digits: 'text-yellow-500' },
      jo: { letters: 'text-red-600', digits: 'text-green-600' }, kz: { letters: 'text-sky-500', digits: 'text-yellow-500' },
      ke: { letters: 'text-red-600', digits: 'text-green-600' }, kw: { letters: 'text-green-600', digits: 'text-red-600' },
      kg: { letters: 'text-red-600', digits: 'text-yellow-500' }, la: { letters: 'text-red-600', digits: 'text-blue-700' },
      lv: { letters: 'text-red-600', digits: 'text-slate-950' }, lb: { letters: 'text-red-600', digits: 'text-green-600' },
      ls: { letters: 'text-blue-700', digits: 'text-green-600' }, lr: { letters: 'text-red-600', digits: 'text-blue-700' },
      ly: { letters: 'text-green-600', digits: 'text-red-600' }, li: { letters: 'text-red-600', digits: 'text-blue-700' },
      lt: { letters: 'text-yellow-500', digits: 'text-green-600' }, lu: { letters: 'text-sky-500', digits: 'text-red-600' },
      mg: { letters: 'text-red-600', digits: 'text-green-600' }, mw: { letters: 'text-red-600', digits: 'text-slate-950' },
      my: { letters: 'text-blue-700', digits: 'text-red-600' }, mv: { letters: 'text-red-600', digits: 'text-green-600' },
      ml: { letters: 'text-green-600', digits: 'text-yellow-500' }, mt: { letters: 'text-red-600', digits: 'text-slate-950' },
      mr: { letters: 'text-green-600', digits: 'text-yellow-500' }, mu: { letters: 'text-red-600', digits: 'text-green-600' },
      md: { letters: 'text-blue-700', digits: 'text-red-600' }, mc: { letters: 'text-red-600', digits: 'text-slate-950' },
      mn: { letters: 'text-red-600', digits: 'text-blue-700' }, me: { letters: 'text-red-600', digits: 'text-yellow-500' },
      ma: { letters: 'text-red-600', digits: 'text-green-600' }, mz: { letters: 'text-green-600', digits: 'text-red-600' },
      mm: { letters: 'text-yellow-500', digits: 'text-green-600' }, na: { letters: 'text-blue-700', digits: 'text-red-600' },
      np: { letters: 'text-red-600', digits: 'text-blue-700' }, ne: { letters: 'text-orange-600', digits: 'text-green-600' },
      ng: { letters: 'text-green-600', digits: 'text-slate-950' }, kp: { letters: 'text-red-600', digits: 'text-blue-700' },
      mk: { letters: 'text-red-600', digits: 'text-yellow-500' }, om: { letters: 'text-red-600', digits: 'text-green-600' },
      pk: { letters: 'text-green-600', digits: 'text-slate-950' }, ps: { letters: 'text-red-600', digits: 'text-green-600' },
      ph: { letters: 'text-blue-700', digits: 'text-red-600' }, qa: { letters: 'text-purple-800', digits: 'text-slate-950' },
      rw: { letters: 'text-sky-500', digits: 'text-yellow-500' }, kn: { letters: 'text-green-600', digits: 'text-red-600' },
      lc: { letters: 'text-sky-500', digits: 'text-yellow-500' }, vc: { letters: 'text-blue-700', digits: 'text-green-600' },
      ws: { letters: 'text-red-600', digits: 'text-blue-700' }, sm: { letters: 'text-blue-700', digits: 'text-red-600' },
      st: { letters: 'text-green-600', digits: 'text-yellow-500' }, sa: { letters: 'text-green-600', digits: 'text-slate-950' },
      sn: { letters: 'text-green-600', digits: 'text-yellow-500' }, rs: { letters: 'text-red-600', digits: 'text-blue-700' },
      sc: { letters: 'text-sky-500', digits: 'text-yellow-500' }, sl: { letters: 'text-green-600', digits: 'text-blue-700' },
      sg: { letters: 'text-red-600', digits: 'text-slate-950' }, sk: { letters: 'text-blue-700', digits: 'text-red-600' },
      si: { letters: 'text-blue-700', digits: 'text-red-600' }, so: { letters: 'text-sky-500', digits: 'text-slate-950' },
      za: { letters: 'text-green-600', digits: 'text-yellow-500' }, ss: { letters: 'text-red-600', digits: 'text-green-600' },
      lk: { letters: 'text-orange-600', digits: 'text-green-600' }, sd: { letters: 'text-red-600', digits: 'text-green-600' },
      sr: { letters: 'text-green-600', digits: 'text-red-600' }, sz: { letters: 'text-blue-700', digits: 'text-red-600' },
      sy: { letters: 'text-red-600', digits: 'text-green-600' }, tj: { letters: 'text-red-600', digits: 'text-green-600' },
      tz: { letters: 'text-green-600', digits: 'text-yellow-500' }, th: { letters: 'text-red-600', digits: 'text-blue-700' },
      tl: { letters: 'text-red-600', digits: 'text-yellow-500' }, tg: { letters: 'text-green-600', digits: 'text-yellow-500' },
      to: { letters: 'text-red-600', digits: 'text-slate-950' }, tt: { letters: 'text-red-600', digits: 'text-slate-950' },
      tn: { letters: 'text-red-600', digits: 'text-slate-950' }, tm: { letters: 'text-green-600', digits: 'text-slate-950' },
      ug: { letters: 'text-yellow-500', digits: 'text-black' }, ae: { letters: 'text-green-600', digits: 'text-red-600' },
      uz: { letters: 'text-sky-500', digits: 'text-green-600' }, vu: { letters: 'text-green-600', digits: 'text-red-600' },
      ye: { letters: 'text-red-600', digits: 'text-slate-950' }, zm: { letters: 'text-green-600', digits: 'text-orange-600' },
      zw: { letters: 'text-green-600', digits: 'text-yellow-500' }
    };
    const palette = palettes[key] || { letters: 'text-slate-950', digits: 'text-slate-950' };
    return /\d/.test(character) ? palette.digits : palette.letters;
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
      <div className="relative w-full px-2 sm:px-4 pt-3.5 pb-3.5 flex flex-col gap-3">
        {/* Fila superior reservada para reloj, clima e indicativo; no se superpone con el logo. */}
        <div className="w-full flex items-start justify-between gap-3">
          <div className="min-w-0 flex flex-col items-start gap-1" title="Hora UTC y fecha local de este dispositivo">
            <div className="flex items-center gap-2 rounded-md border border-black bg-black px-2 sm:px-3 py-1.5 sm:py-2 font-mono text-xl sm:text-3xl font-extrabold shadow-sm"><span className="rounded-sm bg-white px-1.5 py-0.5 text-black">UTC</span><span className="text-white">{utcClock}</span></div>
            <div className="rounded border border-slate-300 bg-white px-2 py-0.5 font-mono text-xs sm:text-sm font-extrabold shadow-sm"><span className="text-black">{localDate.split("/").slice(0, 2).join("/")}/</span><span className="text-red-600">{localDate.split("/")[2]}</span></div>
            {localWeather && <div className="flex items-center gap-2 sm:gap-3 rounded border border-slate-700 bg-slate-800/95 px-2 py-1.5 shadow-sm" title="Clima local aproximado por Internet; ubicación estimada por IP, no GPS"><span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2 py-1" title="Temperatura actual aproximada"><Thermometer className="h-5 w-5 shrink-0 text-red-400" /><span className="font-mono text-sm sm:text-base font-bold text-white">{localWeather.temperature}°C</span></span><span className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-2 py-1" title="Humedad relativa actual aproximada"><Droplets className="h-5 w-5 shrink-0 text-sky-400" /><span className="font-mono text-sm sm:text-base font-bold text-white">{localWeather.humidity}%</span></span></div>}
          </div>
          {callsign && (
            <div className="min-w-0 max-w-[58%] sm:max-w-none shrink-0">
              <span className="inline-flex min-h-11 sm:min-h-14 min-w-[7rem] sm:min-w-[10rem] max-w-full items-center justify-center rounded-lg border-2 border-slate-300 bg-white px-3 sm:px-4 py-2 font-mono text-lg sm:text-2xl font-black shadow-md break-all" title={`Señal distintiva: ${callsign}`}>
                {callsign.split('').map((character, index) => (
                  <span key={index} className={getCallsignCharacterClass(character, country)}>{character}</span>
                ))}
              </span>
            </div>
          )}
        </div>
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
