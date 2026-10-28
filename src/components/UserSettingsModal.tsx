/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { Settings, Check, X, Image as ImageIcon, Trash2, Mail, Copy, Trophy, TentTree, ChevronDown, MessageCircle, Camera, Link as LinkIcon } from 'lucide-react';

interface UserSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export const UserSettingsModal: React.FC<UserSettingsModalProps> = ({
  isOpen,
  onClose,
  onUpdate,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profilePhotoInputRef = useRef<HTMLInputElement>(null);
  const [callsign, setCallsign] = useState('');
  const [gridLocator, setGridLocator] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [isVerifiedCallsign, setIsVerifiedCallsign] = useState(false);
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [galleryImages, setGalleryImages] = useState<Array<{ id: string; name: string; dataUrl: string }>>([]);
  const [defaultEQSLTheme, setDefaultEQSLTheme] = useState('navy');
  const [eqslSoundAlerts, setEqslSoundAlerts] = useState(true);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState('');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [communitySection, setCommunitySection] = useState<'competitions' | 'llota' | null>(null);
  const [weeklyHistoryOpen, setWeeklyHistoryOpen] = useState(false);
  const [weeklyHistory, setWeeklyHistory] = useState<Array<{
    week_start: string;
    callsign: string;
    station_callsign: string;
    qso_date: string;
    qso_time: string;
    band: string;
    frequency: string;
    mode: string;
    votes: number;
    published_at: string;
  }>>([]);
  const [weeklyHistoryLoading, setWeeklyHistoryLoading] = useState(false);
  const [weeklyHistoryError, setWeeklyHistoryError] = useState('');

  useEffect(() => {
    if (isOpen) {
      const verifiedCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      const identityToken = localStorage.getItem('community_chat_identity_token') || '';
      const verifiedOnThisDevice = Boolean(verifiedCallsign && identityToken);
      setIsVerifiedCallsign(verifiedOnThisDevice);
      setGridLocator((localStorage.getItem('user_grid_locator') || '').trim().toUpperCase());
      setProfilePhoto(localStorage.getItem('user_profile_photo') || null);
      setCallsign(verifiedOnThisDevice ? verifiedCallsign : (localStorage.getItem('user_callsign') || ''));
      setCustomBg(localStorage.getItem('eqsl_custom_bg') || null);
      let savedGallery: Array<{ id: string; name: string; dataUrl: string }> = [];
      try {
        savedGallery = JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]');
        setGalleryImages(savedGallery);
      } catch { setGalleryImages([]); }
      setDefaultEQSLTheme(localStorage.getItem('eqsl_theme') || 'navy');
      setEqslSoundAlerts(localStorage.getItem('eqsl_sound_alerts') !== 'false');
      setPushEnabled(false);
      setPushBusy(false);
      setPushStatus('');
      if ('serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window) {
        navigator.serviceWorker.ready.then((registration) => registration.pushManager.getSubscription()).then((subscription) => {
          setPushEnabled(Boolean(subscription && Notification.permission === 'granted'));
        }).catch(() => setPushEnabled(false));
      }
      setSavedSuccess(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const loadWeeklyHistory = async () => {
      setWeeklyHistoryLoading(true);
      setWeeklyHistoryError('');
      if (!supabase) {
        setWeeklyHistory([]);
        setWeeklyHistoryError('El histórico compartido no está disponible en este momento.');
        setWeeklyHistoryLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from('live_qso_spot_weekly_winners')
        .select('week_start, callsign, station_callsign, qso_date, qso_time, band, frequency, mode, votes, published_at')
        .order('week_start', { ascending: false })
        .limit(52);
      if (cancelled) return;
      if (error) {
        setWeeklyHistory([]);
        setWeeklyHistoryError('No se pudo cargar el histórico. Verificá que la configuración compartida de DX semanal esté aplicada en Supabase.');
      } else {
        setWeeklyHistory((data || []) as typeof weeklyHistory);
      }
      setWeeklyHistoryLoading(false);
    };
    void loadWeeklyHistory();
    return () => { cancelled = true; };
  }, [isOpen]);

  if (!isOpen) return null;

  // La galería y los fondos eQSL no deben modificar la imagen del encabezado.
  const preserveHeaderImage = () => {
    const explicitHeader = localStorage.getItem('app_header_image');
    if (explicitHeader) localStorage.setItem('app_header_image_locked', explicitHeader);
  };

  // Importa varias fotos a la galería sin activar ninguna automáticamente.
  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter((file) => file.type.startsWith('image/'));
    e.target.value = '';
    if (!files.length) return;

    const compressImage = (file: File) => new Promise<{ id: string; name: string; dataUrl: string } | null>((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = (event) => {
        const source = event.target?.result as string;
        if (!source) return resolve(null);
        const image = new Image();
        image.onerror = () => resolve(null);
        image.onload = () => {
          const scale = Math.min(1, 900 / image.width, 560 / image.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`, name: file.name, dataUrl: canvas.toDataURL('image/jpeg', 0.62) });
        };
        image.src = source;
      };
      reader.readAsDataURL(file);
    });

    const imported = [];
    for (const file of files) {
      const item = await compressImage(file);
      if (item) imported.push(item);
    }
    if (!imported.length) {
      window.alert('No se pudieron leer las imágenes seleccionadas. Probá con archivos JPG o PNG.');
      return;
    }
    const existing = (() => {
      try { return JSON.parse(localStorage.getItem('eqsl_gallery_images') || '[]') as Array<{ id: string; name: string; dataUrl: string }>; }
      catch { return []; }
    })();
    const next = [...existing, ...imported];
    try {
      localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
      setGalleryImages(next);
      window.dispatchEvent(new Event('user-branding-updated'));
    } catch {
      window.alert('No hay espacio suficiente para guardar todas las fotos. Elegí menos imágenes o archivos más pequeños. Las fotos anteriores no se han reemplazado.');
    }
  };

  const handleProfilePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files || []).find((item) => item.type.startsWith('image/'));
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => window.alert('No se pudo leer la foto seleccionada.');
    reader.onload = (event) => {
      const source = event.target?.result as string;
      if (!source) return;
      const image = new Image();
      image.onerror = () => window.alert('No se pudo abrir la imagen seleccionada.');
      image.onload = () => {
        const size = 512;
        const scale = Math.min(1, size / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.65);
        try {
          localStorage.setItem('user_profile_photo', dataUrl);
          setProfilePhoto(dataUrl);
          window.dispatchEvent(new Event('user-profile-updated'));
          void (async () => {
            const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
            const token = localStorage.getItem('community_chat_identity_token') || '';
            if (!supabase || !callsign || !token) {
              window.alert('La foto quedó guardada en este dispositivo, pero para que aparezca a los demás primero tenés que registrar tu SD en el chat.');
              return;
            }
            const { data, error } = await supabase.rpc('save_community_profile_photo', {
              p_callsign: callsign,
              p_token: token,
              p_photo_data_url: dataUrl,
            });
            if (error || !data?.ok) {
              window.alert('La foto quedó guardada en este dispositivo, pero no se pudo publicar para los demás. Hay que aplicar la migración de fotos de perfil en Supabase.');
            } else {
              window.alert('Foto de perfil guardada. Ya puede mostrarse junto a tu SD en el chat comunitario.');
            }
          })();
        } catch {
          window.alert('No hay espacio suficiente para guardar esta foto. Elegí una imagen más pequeña.');
        }
      };
      image.src = source;
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveProfilePhoto = () => {
    localStorage.removeItem('user_profile_photo');
    setProfilePhoto(null);
    window.dispatchEvent(new Event('user-profile-updated'));
    const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    const token = localStorage.getItem('community_chat_identity_token') || '';
    if (supabase && callsign && token) {
      void supabase.rpc('save_community_profile_photo', {
        p_callsign: callsign,
        p_token: token,
        p_photo_data_url: null,
      }).then(({ data, error }) => {
        if (error || !data?.ok) window.alert('Se quitó la foto de este dispositivo, pero no se pudo quitar la foto compartida del chat.');
      });
    }
  };

  const handleAnchorImage = (dataUrl: string) => {
    preserveHeaderImage();
    setCustomBg(dataUrl);
    localStorage.setItem('eqsl_custom_bg', dataUrl);
  };

  const handleDeleteGalleryImage = (id: string) => {
    const removedImage = galleryImages.find((item) => item.id === id);
    preserveHeaderImage();
    const next = galleryImages.filter((item) => item.id !== id);
    setGalleryImages(next);
    localStorage.setItem('eqsl_gallery_images', JSON.stringify(next));
    const removed = removedImage;
    window.dispatchEvent(new Event('user-branding-updated'));
    if (removed?.dataUrl === customBg) {
      setCustomBg(null);
      localStorage.removeItem('eqsl_custom_bg');
    }
  };

  const togglePushNotifications = async () => {
    if (pushBusy) return;
    setPushBusy(true);
    setPushStatus('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        throw new Error('Este navegador no admite notificaciones push.');
      }
      const identityToken = localStorage.getItem('community_chat_identity_token') || '';
      const verifiedCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (!identityToken || !verifiedCallsign) {
        throw new Error('Primero verificá tu señal distintiva en este dispositivo.');
      }
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      if (pushEnabled) {
        if (existing) {
          const response = await fetch('/api/push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'unsubscribe', token: identityToken, callsign: verifiedCallsign, endpoint: existing.endpoint }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'No se pudo desactivar el aviso push.');
          await existing.unsubscribe();
        }
        setPushEnabled(false);
        setEqslSoundAlerts(false);
        localStorage.setItem('eqsl_sound_alerts', 'false');
        window.dispatchEvent(new Event('eqsl-sound-setting-updated'));
        setPushStatus('Notificaciones desactivadas.');
        return;
      }
      const publicKey = (import.meta as any).env?.VITE_VAPID_PUBLIC_KEY as string | undefined;
      if (!publicKey) throw new Error('Falta configurar la clave pública de notificaciones.');
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No se autorizó el permiso de notificaciones. Revisá los permisos de Android/Chrome.');
      const applicationServerKey = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(publicKey.length / 4) * 4, '=')), ch => ch.charCodeAt(0));
      const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', token: identityToken, callsign: verifiedCallsign, subscription: subscription.toJSON(), alertsEnabled: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo registrar este dispositivo.');
      setPushEnabled(true);
      setEqslSoundAlerts(true);
      localStorage.setItem('eqsl_sound_alerts', 'true');
      window.dispatchEvent(new Event('eqsl-sound-setting-updated'));
      setPushStatus('Notificaciones activadas.');
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : 'No se pudo cambiar la configuración de notificaciones.');
    } finally {
      setPushBusy(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const finalCall = callsign.trim().toUpperCase();
    if (!isVerifiedCallsign && !finalCall) {
      window.alert('Ingresá tu indicativo de radio antes de guardar.');
      return;
    }
    // La SD ya verificada pertenece a la identidad comunitaria; no se sustituye desde Ajustes.
    if (!isVerifiedCallsign) localStorage.setItem('user_callsign', finalCall);
    const normalizedGrid = gridLocator.trim().toUpperCase();
    if (normalizedGrid && !/^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(normalizedGrid)) {
      window.alert('El Grid Locator no parece válido. Usá, por ejemplo, IN83, IN83ka o IN83ka12.');
      return;
    }
    if (normalizedGrid) localStorage.setItem('user_grid_locator', normalizedGrid);
    else localStorage.removeItem('user_grid_locator');
    const gridToken = localStorage.getItem('community_chat_identity_token') || '';
    const gridCallsign = (localStorage.getItem('community_chat_sd') || finalCall || '').trim().toUpperCase();
    if (supabase && gridToken && gridCallsign) {
      void supabase.rpc('save_live_spot_grid_locator', { p_callsign: gridCallsign, p_token: gridToken, p_grid_locator: normalizedGrid || null }).then(({ data, error }) => {
        if (error || !data?.ok) console.warn('[LogBook] No se pudo compartir el Grid Locator:', error?.message || data?.reason);
      });
    }
    localStorage.setItem('eqsl_theme', defaultEQSLTheme);
    localStorage.setItem('eqsl_sound_alerts', eqslSoundAlerts ? 'true' : 'false');
    window.dispatchEvent(new Event('eqsl-sound-setting-updated'));
    const pushToken = localStorage.getItem('community_chat_identity_token') || '';
    const pushCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    if (pushToken && pushCallsign) {
      void fetch('/api/push-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'settings', token: pushToken, callsign: pushCallsign, alertsEnabled: eqslSoundAlerts }) }).catch(() => {});
    }
    window.dispatchEvent(new Event('user-profile-updated'));

    localStorage.removeItem('hamqth_user');
    localStorage.removeItem('hamqth_pass');
    localStorage.removeItem('qrz_logbook_key');
    localStorage.removeItem('qrz_auto_upload');
    localStorage.removeItem('eqsl_user');
    localStorage.removeItem('eqsl_pass');

    setSavedSuccess(true);
    onUpdate();
    setTimeout(() => {
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-4 sm:p-6 shadow-2xl text-slate-100 my-4 max-h-[88vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Perfil del usuario</h2>
              <p className="text-xs text-slate-400">Tu identidad de radio y preferencias de eQSL</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-4 pt-4">
          {/* Los usuarios con SD verificada usan la identidad registrada automáticamente. */}
          {!isVerifiedCallsign && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Mi Indicativo (Callsign) *
                </label>
                <input
                  type="text"
                  value={callsign}
                  onChange={(e) => setCallsign(e.target.value)}
                  placeholder="Ingresá tu señal distintiva"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm font-mono text-amber-300 font-bold focus:border-amber-400 focus:outline-hidden"
                />
              </div>
            </div>
          )}




          

          <section className="rounded-xl border border-cyan-500/25 bg-slate-950/70 p-3.5 space-y-2" aria-labelledby="grid-locator-title">
            <h3 id="grid-locator-title" className="text-xs font-bold uppercase tracking-wider text-cyan-300">Grid Locator para distancia DX</h3>
            <label htmlFor="user-grid-locator" className="block text-xs text-slate-300">Tu locator Maidenhead</label>
            <input id="user-grid-locator" type="text" maxLength={10} value={gridLocator} onChange={(e) => setGridLocator(e.target.value.toUpperCase().replace(/\s+/g, ''))} placeholder="Ej.: IN83ka" autoCapitalize="characters" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 font-mono text-sm font-bold text-cyan-200 focus:border-cyan-400 focus:outline-none" />
          </section>

          <section className="rounded-xl border border-sky-500/25 bg-slate-950/70 p-3.5 space-y-3" aria-labelledby="profile-photo-title">
            <div>
              <h3 id="profile-photo-title" className="text-xs font-bold uppercase tracking-wider text-sky-300">Foto de perfil</h3>
              <p className="mt-1 text-[11px] text-slate-400">Elegí una imagen de la galería de tu dispositivo. La foto se guarda en este dispositivo.</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-sky-500/40 bg-slate-800 flex items-center justify-center">
                {profilePhoto ? <img src={profilePhoto} alt="Foto de perfil" className="h-full w-full object-cover" /> : <Camera className="h-8 w-8 text-slate-500" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={profilePhotoInputRef} type="file" accept="image/*" onChange={handleProfilePhotoUpload} className="hidden" />
                <button type="button" onClick={() => profilePhotoInputRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/20">
                  <ImageIcon className="h-3.5 w-3.5" /> {profilePhoto ? 'Cambiar foto' : 'Subir foto de galería'}
                </button>
                {profilePhoto && <button type="button" onClick={handleRemoveProfilePhoto} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/25 px-3 py-2 text-xs text-rose-300 hover:bg-rose-950/40"><Trash2 className="h-3.5 w-3.5" /> Quitar</button>}
              </div>
            </div>
          </section>

          <section className="py-3 border-y border-slate-800" aria-labelledby="weekly-history-title">
            <div className="overflow-hidden rounded-xl border border-violet-500/40 bg-slate-950/60">
              <button
                type="button"
                id="weekly-history-title"
                onClick={() => setWeeklyHistoryOpen((open) => !open)}
                aria-expanded={weeklyHistoryOpen}
                aria-controls="weekly-history-panel"
                className="flex w-full items-center gap-3 bg-violet-700 px-3.5 py-3 text-left text-white transition-colors hover:bg-violet-600 focus:outline-none focus:ring-2 focus:ring-violet-300"
              >
                <Trophy className="h-5 w-5 shrink-0" />
                <span className="flex-1 text-sm font-extrabold uppercase tracking-wide">DX SEMANAL HISTORICO</span>
                <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${weeklyHistoryOpen ? 'rotate-180' : ''}`} />
              </button>
              {weeklyHistoryOpen && (
                <div id="weekly-history-panel" className="space-y-3 p-3.5">
                  {weeklyHistoryLoading && <p className="text-xs text-slate-400">Cargando histórico…</p>}
                  {!weeklyHistoryLoading && weeklyHistoryError && <p role="status" className="text-xs text-amber-300">{weeklyHistoryError}</p>}
                  {!weeklyHistoryLoading && !weeklyHistoryError && weeklyHistory.length === 0 && <p className="text-xs text-slate-400">Sin datos verificados disponibles por el momento.</p>}
                  {!weeklyHistoryLoading && weeklyHistory.length > 0 && (
                    <div className="max-h-64 space-y-2 overflow-y-auto">
                      {weeklyHistory.map((entry) => (
                        <article key={entry.week_start} className="rounded-lg border border-slate-700 bg-slate-900/80 p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-bold text-violet-300">Semana del {entry.week_start}</span>
                            <span className="text-xs font-bold text-amber-300">♥ {entry.votes} votos</span>
                          </div>
                          <p className="mt-1 break-words font-mono text-sm font-bold text-white">{entry.callsign} ↔ {entry.station_callsign}</p>
                          <p className="mt-1 text-xs text-slate-300">{entry.frequency} MHz · {entry.band} · {entry.mode || 'Modo no indicado'}</p>
                          <p className="mt-1 text-[11px] text-slate-400">QSO: {entry.qso_date} · {String(entry.qso_time || '').slice(0, 5)} UTC</p>
                        </article>
                      ))}
                    </div>
                  )}
                  {/* Se conserva el apartado original de Acciones eQSL dentro del desplegable para no perder su contenido. */}
                  <div className="rounded-lg border border-purple-500/25 bg-slate-950/60 p-3 flex items-center gap-3" aria-labelledby="eqsl-actions-settings">
                    <div className="p-2 bg-purple-500/10 text-purple-300 rounded-lg"><MessageCircle className="w-4 h-4" /></div>
                    <div>
                      <p id="eqsl-actions-settings" className="text-sm font-semibold text-slate-200">Acciones eQSL</p>
                      <p className="text-xs text-slate-400">Sin datos verificados disponibles por el momento.</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setWeeklyHistoryOpen(false)}
                    className="w-full rounded-lg border border-violet-400/50 bg-slate-800 px-3 py-2 text-sm font-bold text-violet-200 transition-colors hover:bg-slate-700"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </div>
          </section>
          <section className="py-2 border-y border-slate-800" aria-labelledby="eqsl-alert-settings">
            <div className="flex items-center justify-between gap-3 min-h-10">
              <label htmlFor="eqsl-push-toggle" className="text-sm font-semibold text-white">Notificaciones push de eQSL</label>
              <button
                id="eqsl-push-toggle"
                type="button"
                role="switch"
                aria-checked={pushEnabled}
                aria-label="Activar o desactivar notificaciones push de eQSL"
                disabled={pushBusy}
                onClick={togglePushNotifications}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-60 ${pushEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`}
              >
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${pushEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>
            {pushStatus && <p role="status" className="mt-1 text-[11px] text-slate-400 break-words">{pushStatus}</p>}
          </section>

          <div className="pt-2 border-t border-slate-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400">2. Galería de diseños eQSL predeterminados</h3>
            <p className="text-[11px] text-slate-500 mt-1">Las imágenes quedan en la galería. Podés elegir Fondo eQSL o eliminar una foto.</p>
          </div>
          {/* Galería única: las fotos cargadas quedan aquí y solo se activan al tocar Anclar. */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-sky-500/20 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-sky-300">Diseños eQSL predeterminados</span>
              </div>
              <span className="text-[10px] text-slate-500">{galleryImages.length} fotos</span>
            </div>
            <p className="text-[11px] text-slate-400">Cargá tus imágenes. Para cada foto podés elegir Fondo eQSL o eliminarla de la galería.</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleGalleryUpload}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.value = '';
                  fileInputRef.current.click();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-xs font-semibold rounded-lg border border-amber-500/30 transition-colors cursor-pointer"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              Añadir fotos de galería (selección múltiple)
            </button>
            {galleryImages.length === 0 ? (
              <p className="text-xs text-slate-400">Todavía no hay fotos guardadas. Cargá una o varias para verlas aquí.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {galleryImages.map((item) => {
                  const selected = customBg === item.dataUrl;
                  return (
                    <div key={item.id} className={`overflow-hidden rounded-lg border ${selected ? 'border-amber-400 ring-2 ring-amber-400/50' : 'border-slate-700'}`}>
                      <img src={item.dataUrl} alt={item.name} className="h-24 w-full object-cover" />
                      <p className="truncate px-2 pt-1 text-[10px] text-slate-200" title={item.name}>{item.name}</p>
                      <div className="grid grid-cols-2 gap-1 p-1.5">
                        <button type="button" onClick={() => handleAnchorImage(item.dataUrl)} className={`rounded-md px-2 py-1 text-[10px] font-bold ${selected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-amber-300 hover:bg-slate-700'}`}>{selected ? '✓ Fondo eQSL' : 'Fondo eQSL'}</button>
                        <button type="button" onClick={() => handleDeleteGalleryImage(item.id)} className="rounded-md px-2 py-1 text-[10px] text-rose-300 hover:bg-rose-950/50" aria-label={`Eliminar ${item.name}`}><Trash2 className="inline h-3 w-3" /> Eliminar</button>
                      </div>
                      {selected && <p className="bg-slate-800 px-2 pb-1.5 text-[10px] font-semibold text-slate-200">✓ Fondo activo para eQSL</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200">Foto de fondo para tu tarjeta eQSL</span>
              {customBg && <span className="text-[11px] text-emerald-400 font-semibold">✓ Foto activa</span>}
            </div>
            <p className="text-[11px] text-slate-400">La foto activa se elige con “Fondo eQSL”. Agregar fotos no cambia el fondo activo.</p>
            {customBg && (
              <button
                type="button"
                onClick={() => {
                  preserveHeaderImage();
                  setCustomBg(null);
                  localStorage.removeItem('eqsl_custom_bg');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 text-slate-300 hover:text-rose-300 text-xs rounded-lg border border-slate-700 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Desactivar foto activa
              </button>
            )}
          </div>
          <section className="pt-3 border-t border-slate-800 space-y-3" aria-labelledby="community-areas-title">
            <div>
              <h3 id="community-areas-title" className="text-xs font-bold uppercase tracking-wider text-emerald-300">Comunidad</h3>
              <p className="text-[11px] text-slate-500 mt-1">Accesos previstos para las actividades de la comunidad. La publicación compartida y la moderación deben habilitarse con el backend correspondiente.</p>
            </div>
            <div className="rounded-xl border border-amber-500/25 bg-slate-950/60 overflow-hidden">
              <button type="button" onClick={() => setCommunitySection(communitySection === 'competitions' ? null : 'competitions')} aria-expanded={communitySection === 'competitions'} className="w-full flex items-center gap-3 p-3.5 text-left">
                <Trophy className="w-5 h-5 text-amber-300 shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-amber-200">Competiciones</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">Bases y concursos zonales, regionales, nacionales e internacionales.</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${communitySection === 'competitions' ? 'rotate-180' : ''}`} />
              </button>
              {communitySection === 'competitions' && <div className="px-3.5 pb-3.5 space-y-2 text-xs text-slate-300">
                <p>El apartado reunirá las bases de las competiciones y publicaciones de los radioaficionados.</p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="rounded-full bg-slate-800 px-2 py-1">Zonales</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">Regionales</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">Nacionales</span>
                  <span className="rounded-full bg-slate-800 px-2 py-1">Internacionales</span>
                </div>
                <p className="text-amber-300">Publicación compartida y borrado exclusivo del administrador: pendientes de implementar y probar.</p>
              </div>}
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-slate-950/60 overflow-hidden">
              <button type="button" onClick={() => setCommunitySection(communitySection === 'llota' ? null : 'llota')} aria-expanded={communitySection === 'llota'} className="w-full flex items-center gap-3 p-3.5 text-left">
                <TentTree className="w-5 h-5 text-emerald-300 shrink-0" />
                <span className="flex-1">
                  <span className="block text-sm font-bold text-emerald-200">LLOTA</span>
                  <span className="block text-[11px] text-slate-400 mt-0.5">Actividades de radio al aire libre: playas, parques, lagunas, lagos y montañas.</span>
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${communitySection === 'llota' ? 'rotate-180' : ''}`} />
              </button>
              {communitySection === 'llota' && <div className="px-3.5 pb-3.5 space-y-2 text-xs text-slate-300">
                <p>El espacio LLOTA permitirá anunciar activaciones y compartir fotografías, vídeos, enlaces, fecha y lugar de la actividad.</p>
                <div className="flex flex-wrap gap-2 text-[11px]">
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1"><Camera className="w-3 h-3" /> Fotos y vídeos</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1"><LinkIcon className="w-3 h-3" /> Enlaces</span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-1"><MessageCircle className="w-3 h-3" /> WhatsApp voluntario</span>
                </div>
                <p>La participación en WhatsApp será voluntaria. El enlace real de invitación deberá configurarlo el administrador.</p>
                <p className="text-emerald-300">Publicaciones compartidas y moderación exclusiva del administrador: pendientes de implementar y probar.</p>
              </div>}
            </div>
          </section>

          <section className="px-1 py-2 border-t border-slate-700" aria-label="Contacto">
            <p className="flex flex-wrap items-center gap-x-1 text-xs text-slate-400">
              <span>Contacto:</span>
              <a href="mailto:lu1tsb.4rc978@gmail.com?subject=Contacto%20con%20LogBook%20eQSL%20EXPRESS" className="font-medium text-sky-300 underline underline-offset-2">lu1tsb.4rc978@gmail.com</a>
            </p>
          </section>
          {/* Footer del Modal */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-800">
            <div className="text-xs text-emerald-400 font-medium">
              {savedSuccess ? '¡Guardado correctamente!' : ''}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg shadow-sm transition-all cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Guardar Configuración
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
