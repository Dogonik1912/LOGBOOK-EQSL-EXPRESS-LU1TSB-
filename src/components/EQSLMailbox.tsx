import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox, RefreshCw, MailOpen, ArrowUpRight, AlertCircle, Trash2, CheckSquare, Square } from 'lucide-react';

type InboxItem = {
  id: string;
  from: string;
  to: string;
  isResponse: boolean;
  date: string;
  band: string;
  mode: string;
  createdAt: string;
  readAt: string | null;
  answeredAt?: string | null;
};

export const EQSLMailbox: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [pendingReplies, setPendingReplies] = useState(0);
  const [items, setItems] = useState<InboxItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pushStatus, setPushStatus] = useState('');
  const [pushBusy, setPushBusy] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const knownInboxIds = useRef<Set<string> | null>(null);

  useEffect(() => {
    const openInbox = () => { setOpen(true); };
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_EQSL_INBOX') openInbox();
    };
    if (new URLSearchParams(window.location.search).get('open_eqsl_inbox') === '1') setOpen(true);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    window.addEventListener('open-eqsl-inbox', openInbox);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      window.removeEventListener('open-eqsl-inbox', openInbox);
    };
  }, []);

  const token = () => localStorage.getItem('community_chat_identity_token') || '';

  const updateAppBadge = (count: number) => {
    localStorage.setItem('eqsl_unread_count', String(count));
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const combined = count + (Number(localStorage.getItem('community_private_unread_count')) || 0);
    try {
      if (combined > 0) void badgeNavigator.setAppBadge?.(combined).catch(() => {});
      else void badgeNavigator.clearAppBadge?.().catch(() => {});
    } catch { /* No todos los navegadores admiten insignias de app. */ }
  };

  const playIncomingAlert = () => {
    if (localStorage.getItem('eqsl_sound_alerts') === 'false') return;
    try {
      const AudioContextClass = window.AudioContext;
      if (!AudioContextClass) return;
      const audio = new AudioContextClass();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audio.currentTime);
      oscillator.frequency.setValueAtTime(1175, audio.currentTime + 0.12);
      gain.gain.setValueAtTime(0.0001, audio.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.32);
      oscillator.connect(gain);
      gain.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.34);
      oscillator.onended = () => { void audio.close().catch(() => {}); };
    } catch { /* El navegador puede bloquear el sonido hasta que se interactúe. */ }
  };

  const checkForNewIncoming = useCallback(async () => {
    const identityToken = token();
    if (!identityToken) return;
    try {
      const response = await fetch('/api/eqsl-inbox?peek=1', {
        headers: { 'x-identity-token': identityToken },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.items)) return;
      const received = result.items as InboxItem[];
      const currentIds = new Set(received.filter(item => !item.readAt).map(item => item.id));
      if (knownInboxIds.current === null) {
        knownInboxIds.current = currentIds;
      } else {
        const newItems = received.filter(item => !item.readAt && !knownInboxIds.current?.has(item.id));
        if (newItems.length > 0 && localStorage.getItem('eqsl_sound_alerts') !== 'false') {
          for (let i = 0; i < Math.min(newItems.length, 3); i += 1) {
            window.setTimeout(() => playIncomingAlert(), i * 450);
          }
        }
        knownInboxIds.current = currentIds;
      }
      const count = Number(result.unread) || 0;
      setPendingReplies(count);
      updateAppBadge(count);
    } catch { /* Reintentar en la siguiente comprobación. */ }
  }, []);

  const refreshCount = useCallback(async () => {
    const identityToken = token();
    if (!identityToken) {
      setPendingReplies(0);
      updateAppBadge(0);
      return;
    }
    try {
      const response = await fetch('/api/eqsl-inbox?count=1', {
        headers: { 'x-identity-token': identityToken },
        cache: 'no-store',
      });
      const result = await response.json();
      if (response.ok) {
        const count = Number(result.unread ?? result.pendingReplies) || 0;
        setPendingReplies(count);
        updateAppBadge(count);
      }
    } catch { /* Mantener el contador anterior si no hay conexión. */ }
  }, []);

  const loadInbox = async () => {
    const identityToken = token();
    if (!identityToken) {
      setError('Primero guardá tu señal distintiva en el chat comunitario. El buzón se vincula a ese dispositivo.');
      setItems([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/eqsl-inbox', {
        headers: { 'x-identity-token': identityToken },
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo abrir el buzón.');
      const loadedItems = Array.isArray(result.items) ? result.items as InboxItem[] : [];
      setItems(loadedItems);
      const count = Number(result.unread) || 0;
      setPendingReplies(count);
      updateAppBadge(count);
      knownInboxIds.current = new Set(loadedItems.filter(item => !item.readAt).map(item => item.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el buzón eQSL.');
    } finally {
      setLoading(false);
    }
  };

  const deleteMailboxItems = async (ids?: string[]) => {
    const identityToken = token();
    const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    if (!identityToken || !callsign) {
      setError('No se pudo verificar la identidad de este dispositivo para borrar eQSL.');
      return;
    }
    const deleteAll = !ids;
    const count = deleteAll ? items.length : ids.length;
    if (!count) return;
    const confirmed = window.confirm(deleteAll
      ? `¿Vaciar el buzón eQSL POST y eliminar sus ${count} tarjetas? Esta acción no se puede deshacer.`
      : `¿Eliminar ${count === 1 ? 'esta eQSL' : 'las ' + count + ' eQSL seleccionadas'}? Esta acción no se puede deshacer.`);
    if (!confirmed) return;
    setDeleting(true);
    setError('');
    try {
      if (deleteAll) {
        const response = await fetch('/api/eqsl-inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'delete-all', token: identityToken, callsign }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'No se pudo vaciar el buzón.');
      } else {
        for (const id of ids) {
          const response = await fetch('/api/eqsl-inbox', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'delete', token: identityToken, callsign, id }),
          });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'No se pudo eliminar una eQSL seleccionada.');
        }
      }
      setSelectedIds([]);
      await loadInbox();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron eliminar las eQSL.');
      await loadInbox();
    } finally {
      setDeleting(false);
    }
  };

  const toggleSelected = (id: string) => {
    setSelectedIds(current => current.includes(id) ? current.filter(value => value !== id) : [...current, id]);
  };

  const activateNotifications = async () => {
    setPushStatus('');
    const identityToken = token();
    const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    const publicKey = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_VAPID_PUBLIC_KEY || '';
    if (!identityToken || !callsign) {
      setPushStatus('Primero guardá y verificá tu señal distintiva en el chat comunitario.');
      return;
    }
    if (!publicKey) {
      setPushStatus('Las notificaciones en segundo plano requieren configurar VITE_VAPID_PUBLIC_KEY en Vercel y las claves VAPID del servidor.');
      return;
    }
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPushStatus('Este navegador no admite notificaciones push. El aviso sonoro solo puede funcionar con la app abierta.');
      return;
    }
    setPushBusy(true);
    try {
      // Si el usuario ya aceptó el permiso del navegador, no volver a solicitarlo.
      const permission = Notification.permission === 'granted'
        ? 'granted'
        : await Notification.requestPermission();
      if (permission !== 'granted') {
        if (permission === 'denied') localStorage.setItem('eqsl_push_permission_choice', 'denied');
        setPushStatus('El permiso no está concedido. Si lo rechazaste, podrás cambiarlo en los ajustes del navegador.');
        return;
      }
      // Persistir la decisión en cuanto se concede, aunque la suscripción del servidor
      // falle temporalmente; no volver a mostrar el cartel de permiso en futuros ingresos.
      localStorage.setItem('eqsl_push_permission_choice', 'accepted');
      const registration = await navigator.serviceWorker.ready;
      const decodeKey = (value: string) => {
        const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
        const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
        return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
      };
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeKey(publicKey),
      });
      const response = await fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'subscribe',
          token: identityToken,
          callsign,
          subscription: subscription.toJSON(),
          alertsEnabled: true,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo activar la notificación.');
      setPushEnabled(true);
      localStorage.setItem('eqsl_push_permission_choice', 'accepted');
      localStorage.setItem('eqsl_push_enabled', 'true');
      setPushStatus('Notificaciones activadas y guardadas en este dispositivo. Permanecerán seleccionadas mientras el navegador conserve la suscripción y el permiso.');
    } catch (e) {
      setPushStatus(e instanceof Error ? e.message : 'No se pudieron activar las notificaciones.');
    } finally {
      setPushBusy(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const restorePushState = async () => {
      const saved = localStorage.getItem('eqsl_push_enabled') === 'true';
      if ('Notification' in window && Notification.permission === 'granted') {
        localStorage.setItem('eqsl_push_permission_choice', 'accepted');
      } else if ('Notification' in window && Notification.permission === 'denied') {
        localStorage.setItem('eqsl_push_permission_choice', 'denied');
      }
      if (!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') {
        if (!cancelled) { setPushEnabled(false); if (saved) localStorage.setItem('eqsl_push_enabled', 'false'); }
        return;
      }
      try {
        const registration = await navigator.serviceWorker.ready;
        const publicKey = (import.meta as ImportMeta & { env: Record<string, string | undefined> }).env.VITE_VAPID_PUBLIC_KEY || '';
        const identityToken = token();
        const callsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
        let subscription = await registration.pushManager.getSubscription();
        const decodeKey = (value: string) => {
          const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
          const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
          return Uint8Array.from(atob(padded), char => char.charCodeAt(0));
        };
        // Permission was already granted: restore/create the browser subscription without
        // asking the user again, then synchronize it with the server on every app entry.
        if (!subscription && publicKey && callsign && identityToken) {
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodeKey(publicKey),
          });
        }
        let serverSynced = false;
        if (subscription && publicKey && callsign && identityToken) {
          const response = await fetch('/api/push-subscription', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'subscribe',
              token: identityToken,
              callsign,
              subscription: subscription.toJSON(),
              alertsEnabled: true,
            }),
          });
          serverSynced = response.ok;
        }
        if (!cancelled) {
          const enabled = Boolean(subscription) && (saved || Notification.permission === 'granted') && serverSynced;
          setPushEnabled(enabled);
          localStorage.setItem('eqsl_push_enabled', enabled ? 'true' : 'false');
          if (enabled) localStorage.setItem('eqsl_push_permission_choice', 'accepted');
        }
      } catch { if (!cancelled) setPushEnabled(false); }
    };
    void restorePushState();
    knownInboxIds.current = null;
    void refreshCount();
    void checkForNewIncoming();
    const onIdentityUpdated = () => {
      knownInboxIds.current = null;
      void refreshCount();
      void checkForNewIncoming();
    };
    window.addEventListener('user-profile-updated', onIdentityUpdated);
    window.addEventListener('eqsl-pending-count-updated', onIdentityUpdated);
    window.addEventListener('eqsl-sound-setting-updated', onIdentityUpdated);
    window.addEventListener('storage', onIdentityUpdated);
    const onPrivateCountUpdated = () => updateAppBadge(Number(localStorage.getItem('eqsl_unread_count')) || 0);
    window.addEventListener('community-private-unread-count-updated', onPrivateCountUpdated);
    const refreshTimer = window.setInterval(() => {
      void refreshCount();
      void checkForNewIncoming();
    }, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.removeEventListener('user-profile-updated', onIdentityUpdated);
      window.removeEventListener('eqsl-pending-count-updated', onIdentityUpdated);
      window.removeEventListener('eqsl-sound-setting-updated', onIdentityUpdated);
      window.removeEventListener('storage', onIdentityUpdated);
      window.removeEventListener('community-private-unread-count-updated', onPrivateCountUpdated);
    };
  }, [refreshCount, checkForNewIncoming]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadInbox();
  };

  return <section className={`min-w-0 rounded-xl border border-amber-400/60 bg-slate-900 p-2.5 sm:p-3 ${open ? 'sm:col-span-3' : ''}`}>
    <button type="button" onClick={toggle} aria-expanded={open} className="flex min-h-[56px] w-full items-center gap-2 text-left">
      <span className="relative shrink-0 rounded-lg bg-amber-400 p-2 text-slate-950"><Inbox className="h-5 w-5" />
        {pendingReplies > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-slate-900 bg-red-600 px-1 text-[10px] font-black text-white">{pendingReplies > 99 ? '99+' : pendingReplies}</span>}
      </span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-amber-300">eQSL POST</span><span className="block text-[10px] leading-tight text-slate-300">Buzón de recibidas y respuestas</span></span>
      <MailOpen className="h-4 w-4 shrink-0 text-amber-300" />
    </button>
    {open && <div className="mt-3 border-t border-slate-700 pt-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">eQSL recibidas</h3>
        <div className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => setSelectedIds(selectedIds.length === items.length ? [] : items.map(item => item.id))} disabled={items.length === 0 || deleting} className="inline-flex items-center gap-1 rounded-md border border-slate-600 px-2 py-1 text-[10px] font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-40">{selectedIds.length === items.length && items.length > 0 ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />} Seleccionar todas</button>
          <button type="button" onClick={() => void deleteMailboxItems(selectedIds)} disabled={selectedIds.length === 0 || deleting} className="inline-flex items-center gap-1 rounded-md border border-red-500/50 px-2 py-1 text-[10px] font-semibold text-red-200 hover:bg-red-950/60 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Eliminar seleccionadas</button>
          <button type="button" onClick={() => void deleteMailboxItems()} disabled={items.length === 0 || deleting} className="inline-flex items-center gap-1 rounded-md bg-red-700 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-600 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Vaciar buzón</button>
          <button type="button" onClick={() => void activateNotifications()} disabled={pushBusy || pushEnabled} aria-pressed={pushEnabled} className={`rounded-md border px-2 py-1 text-[10px] font-semibold disabled:opacity-100 ${pushEnabled ? 'border-emerald-400 bg-emerald-600 text-white' : 'border-sky-500/50 text-sky-200 hover:bg-sky-950 disabled:opacity-50'}`}>{pushBusy ? 'Activando…' : pushEnabled ? '✓ Alertas activadas' : 'Activar alertas'}</button>
          <button type="button" onClick={() => void loadInbox()} disabled={loading} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar</button>
        </div>
      </div>
      {pushStatus && <p role="status" className="mb-2 rounded-lg bg-slate-800 p-2 text-[10px] text-sky-200">{pushStatus}</p>}
      {error && <p role="alert" className="mb-2 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-2 text-xs text-amber-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      {loading && <p className="py-3 text-center text-xs text-slate-300">Consultando el buzón…</p>}
      {!loading && !error && items.length === 0 && <p className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300">Todavía no tenés eQSL en el buzón. Las tarjetas enviadas a tu señal distintiva aparecerán aquí.</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {items.map(item => <article key={item.id} className={`flex items-center gap-2 rounded-lg border p-3 ${selectedIds.includes(item.id) ? 'border-red-400/70 bg-red-950/20' : 'border-slate-700 bg-slate-800'}`}>
          <input type="checkbox" aria-label={`Seleccionar eQSL de ${item.from}`} checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} disabled={deleting} className="h-4 w-4 shrink-0 accent-red-500" />
          <span className={`shrink-0 rounded-md p-2 ${item.isResponse ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}><MailOpen className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white">{item.isResponse ? 'eQSL respuesta' : 'eQSL recibida'} · {item.from}</strong><span className="block text-[10px] text-slate-400">{item.date} · {item.band} · {item.mode}</span></span>
          <button type="button" disabled={Boolean(item.answeredAt && !item.isResponse)} onClick={() => { window.location.href = '/?e=' + encodeURIComponent(item.id); }} className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[10px] font-bold ${item.answeredAt && !item.isResponse ? 'bg-red-600 text-white cursor-not-allowed' : 'bg-amber-400 text-slate-950'}`}>{item.answeredAt && !item.isResponse ? 'eQSL RESPONDIDA' : 'Abrir'}{!(item.answeredAt && !item.isResponse) && <ArrowUpRight className="h-3 w-3" />}</button>
          <button type="button" onClick={() => void deleteMailboxItems([item.id])} disabled={deleting} aria-label={`Eliminar eQSL de ${item.from}`} title="Eliminar esta eQSL" className="shrink-0 rounded-md p-2 text-red-300 hover:bg-red-950/60 disabled:opacity-40"><Trash2 className="h-4 w-4" /></button>
        </article>)}
      </div>
    </div>}
  </section>;
};
