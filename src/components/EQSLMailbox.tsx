import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Inbox, RefreshCw, MailOpen, ArrowUpRight, AlertCircle } from 'lucide-react';

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const knownInboxIds = useRef<Set<string> | null>(null);

  const token = () => localStorage.getItem('community_chat_identity_token') || '';
  const updateAppBadge = (count: number) => {
    const badgeNavigator = navigator as Navigator & { setAppBadge?: (contents?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    try {
      if (count > 0) void badgeNavigator.setAppBadge?.(count).catch(() => {});
      else void badgeNavigator.clearAppBadge?.().catch(() => {});
    } catch { /* El navegador o dispositivo puede no admitir insignias de app. */ }
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
    } catch { /* El navegador puede bloquear el audio hasta que el usuario interactúe. */ }
  };

  const checkForNewIncoming = useCallback(async () => {
    const identityToken = token();
    if (!identityToken) return;
    try {
      const response = await fetch('/api/eqsl-inbox', { headers: { 'x-identity-token': identityToken }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.items)) return;
      const received = result.items as InboxItem[];
      const currentIds = new Set(received.map(item => item.id));
      if (knownInboxIds.current === null) {
        knownInboxIds.current = currentIds;
      } else {
        const newItems = received.filter(item => !knownInboxIds.current?.has(item.id));
        if (newItems.length > 0 && localStorage.getItem('eqsl_sound_alerts') !== 'false') {
          for (let i = 0; i < Math.min(newItems.length, 3); i += 1) {
            window.setTimeout(() => playIncomingAlert(), i * 450);
          }
        }
        knownInboxIds.current = currentIds;
      }
      const count = Number(result.pendingReplies) || 0;
      setPendingReplies(count);
      updateAppBadge(count);
    } catch { /* Reintentar en la siguiente comprobación. */ }
  }, []);

  const refreshCount = useCallback(async () => {
    const identityToken = token();
    if (!identityToken) { setPendingReplies(0); updateAppBadge(0); return; }
    try {
      const response = await fetch('/api/eqsl-inbox?count=1', { headers: { 'x-identity-token': identityToken }, cache: 'no-store' });
      const result = await response.json();
      if (response.ok) { const count = Number(result.pendingReplies) || 0; setPendingReplies(count); updateAppBadge(count); }
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
      const response = await fetch('/api/eqsl-inbox', { headers: { 'x-identity-token': identityToken }, cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'No se pudo abrir el buzón.');
      setItems(Array.isArray(result.items) ? result.items : []);
      const count = Number(result.pendingReplies) || 0;
      setPendingReplies(count);
      updateAppBadge(count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo abrir el buzón eQSL.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    knownInboxIds.current = null;
    void refreshCount();
    void checkForNewIncoming();
    const onIdentityUpdated = () => { knownInboxIds.current = null; void refreshCount(); void checkForNewIncoming(); };
    window.addEventListener('user-profile-updated', onIdentityUpdated);
    window.addEventListener('eqsl-pending-count-updated', onIdentityUpdated);
    window.addEventListener('eqsl-sound-setting-updated', onIdentityUpdated);
    window.addEventListener('storage', onIdentityUpdated);
    const refreshTimer = window.setInterval(() => { void refreshCount(); void checkForNewIncoming(); }, 30_000);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener('user-profile-updated', onIdentityUpdated);
      window.removeEventListener('eqsl-pending-count-updated', onIdentityUpdated);
      window.removeEventListener('eqsl-sound-setting-updated', onIdentityUpdated);
      window.removeEventListener('storage', onIdentityUpdated);
    };
  }, [refreshCount, checkForNewIncoming]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) void loadInbox();
  };

  return <section className="min-w-0 rounded-xl border border-amber-400/60 bg-slate-900 p-2.5 sm:p-3">
    <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-2 text-left">
      <span className="relative shrink-0 rounded-lg bg-amber-400 p-2 text-slate-950"><Inbox className="h-5 w-5" />
        {pendingReplies > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-slate-900 bg-red-600 px-1 text-[10px] font-black text-white">{pendingReplies > 99 ? '99+' : pendingReplies}</span>}
      </span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-amber-300">eQSL POST</span><span className="block text-[10px] leading-tight text-slate-300">Buzón de recibidas y respuestas</span></span>
      <MailOpen className="h-4 w-4 shrink-0 text-amber-300" />
    </button>
    {open && <div className="mt-3 border-t border-slate-700 pt-3">
      <div className="mb-2 flex items-center justify-between gap-2"><h3 className="text-sm font-bold text-white">eQSL recibidas</h3><button type="button" onClick={() => void loadInbox()} disabled={loading} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Actualizar</button></div>
      {error && <p role="alert" className="mb-2 flex gap-2 rounded-lg border border-amber-500/30 bg-amber-950/40 p-2 text-xs text-amber-200"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      {loading && <p className="py-3 text-center text-xs text-slate-300">Consultando el buzón…</p>}
      {!loading && !error && items.length === 0 && <p className="rounded-lg bg-slate-800 p-3 text-xs text-slate-300">Todavía no tenés eQSL en el buzón. Las tarjetas enviadas a tu señal distintiva aparecerán aquí.</p>}
      <div className="max-h-72 space-y-2 overflow-y-auto">
        {items.map(item => <article key={item.id} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 p-3">
          <span className={`shrink-0 rounded-md p-2 ${item.isResponse ? 'bg-sky-500/15 text-sky-300' : 'bg-amber-500/15 text-amber-300'}`}><MailOpen className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><strong className="block truncate text-xs text-white">{item.isResponse ? 'eQSL respuesta' : 'eQSL recibida'} · {item.from}</strong><span className="block text-[10px] text-slate-400">{item.date} · {item.band} · {item.mode}</span></span>
          <button type="button" onClick={() => { window.location.href = '/?e=' + encodeURIComponent(item.id); }} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-400 px-2 py-1.5 text-[10px] font-bold text-slate-950">Abrir <ArrowUpRight className="h-3 w-3" /></button>
        </article>)}
      </div>
    </div>}
  </section>;
};
