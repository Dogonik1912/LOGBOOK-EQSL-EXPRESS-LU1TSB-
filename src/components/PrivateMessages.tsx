import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LockKeyhole, MessageCircle, RefreshCw, Send, Inbox } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

type PrivateMessage = {
  id: string;
  sender_callsign: string;
  recipient_callsign: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type PrivateConversation = {
  other_callsign: string;
  last_body: string;
  last_at: string;
  unread_count: number;
};

const getIdentityToken = () => {
  const existing = localStorage.getItem('community_chat_identity_token');
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem('community_chat_identity_token', created);
  return created;
};

export const PrivateMessages: React.FC = () => {
  const [callsign, setCallsign] = useState(() => (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
  const [identityToken] = useState(getIdentityToken);
  const [isOpen, setIsOpen] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState('');
  const [activeRecipient, setActiveRecipient] = useState('');
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const previousUnreadRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const refreshConversations = useCallback(async () => {
    if (!supabase || !callsign || !identityToken) return;
    const { data, error: rpcError } = await supabase.rpc('community_private_conversations', {
      p_callsign: callsign,
      p_token: identityToken,
    });
    if (rpcError) {
      setError('Los mensajes privados aún no están activados en el servidor. Hay que aplicar la migración de Mensajes Privados en Supabase.');
      return;
    }
    // Normalize the JSON returned by the Supabase RPC before rendering the inbox.
    const rawConversations = Array.isArray(data)
      ? data
      : Array.isArray((data as { conversations?: unknown[] } | null)?.conversations)
        ? (data as { conversations: unknown[] }).conversations
        : [];
    const nextConversations = rawConversations
      .filter((item): item is PrivateConversation => Boolean(item && typeof item === 'object' && (item as PrivateConversation).other_callsign))
      .map((item) => ({
        ...item,
        other_callsign: String(item.other_callsign).trim().toUpperCase(),
        last_body: String(item.last_body || ''),
        last_at: String(item.last_at || ''),
        unread_count: Number(item.unread_count) || 0,
      }))
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime());
    const nextUnread = nextConversations.reduce((total, item) => total + (Number(item.unread_count) || 0), 0);
    setConversations(nextConversations);
    setUnreadTotal(nextUnread);
    localStorage.setItem('community_private_unread_count', String(nextUnread));
    window.dispatchEvent(new CustomEvent('community-private-unread-count-updated', { detail: { count: nextUnread } }));
    if (previousUnreadRef.current !== null && nextUnread > previousUnreadRef.current && localStorage.getItem('eqsl_sound_alerts') !== 'false') {
      try {
        const AudioContextClass = window.AudioContext;
        if (AudioContextClass) {
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
        }
      } catch { /* El navegador puede bloquear audio hasta que el usuario interactúe. */ }
    }
    previousUnreadRef.current = nextUnread;
    const badgeNavigator = navigator as Navigator & { setAppBadge?: (contents?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    const combined = (Number(localStorage.getItem('eqsl_unread_count')) || 0) + nextUnread;
    try {
      if (combined > 0) void badgeNavigator.setAppBadge?.(combined).catch(() => {});
      else void badgeNavigator.clearAppBadge?.().catch(() => {});
    } catch { /* Insignia no admitida por todos los navegadores. */ }
  }, [callsign, identityToken]);

  const refreshMessages = useCallback(async (otherCallsign: string) => {
    if (!supabase || !callsign || !identityToken || !otherCallsign) return;
    const { data, error: rpcError } = await supabase.rpc('community_private_messages', {
      p_callsign: callsign,
      p_token: identityToken,
      p_other_callsign: otherCallsign,
    });
    if (rpcError) {
      setError('No se pudo abrir la conversación privada. Verificá que la migración de Mensajes Privados esté aplicada.');
      return;
    }
    setMessages(Array.isArray(data) ? data as PrivateMessage[] : []);
    setError('');
  }, [callsign, identityToken]);

  const photoCallsigns = Array.from(new Set([
    callsign,
    activeRecipient,
    ...conversations.map((conversation) => conversation.other_callsign),
    ...messages.flatMap((message) => [message.sender_callsign, message.recipient_callsign]),
  ].map((value) => (value || '').trim().toUpperCase()).filter(Boolean))).sort().join('|');

  useEffect(() => {
    if (!supabase || !photoCallsigns) {
      setProfilePhotos({});
      return;
    }
    let active = true;
    const loadPhotos = async () => {
      const { data, error: photoError } = await supabase.rpc('community_profile_photos', {
        p_callsigns: photoCallsigns.split('|'),
      });
      if (!active || photoError) return;
      const next: Record<string, string> = {};
      (data || []).forEach((row: { callsign: string; photo_data_url: string }) => {
        if (row?.callsign && row?.photo_data_url) next[String(row.callsign).trim().toUpperCase()] = row.photo_data_url;
      });
      setProfilePhotos(next);
    };
    void loadPhotos();
    const poll = window.setInterval(() => { void loadPhotos(); }, 30000);
    const refresh = () => { void loadPhotos(); };
    window.addEventListener('user-profile-updated', refresh);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener('user-profile-updated', refresh);
    };
  }, [photoCallsigns]);

  useEffect(() => {
    const syncCallsign = () => setCallsign((localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
    window.addEventListener('user-profile-updated', syncCallsign);
    window.addEventListener('storage', syncCallsign);
    return () => {
      window.removeEventListener('user-profile-updated', syncCallsign);
      window.removeEventListener('storage', syncCallsign);
    };
  }, []);

  useEffect(() => {
    if (!callsign || !supabase) {
      setUnreadTotal(0);
      localStorage.setItem('community_private_unread_count', '0');
      return;
    }
    void refreshConversations();
    const poll = window.setInterval(() => {
      void refreshConversations();
      if (isOpen && activeRecipient) void refreshMessages(activeRecipient);
    }, 15000);
    return () => window.clearInterval(poll);
  }, [isOpen, callsign, activeRecipient, refreshConversations, refreshMessages]);

  useEffect(() => {
    if (activeRecipient && isOpen) {
      void refreshMessages(activeRecipient).then(() => refreshConversations());
      setNotice('');
    }
  }, [activeRecipient, isOpen, refreshMessages, refreshConversations]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen, activeRecipient]);

  const openConversation = (rawRecipient: string) => {
    const recipient = rawRecipient.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (recipient.length < 3) {
      setError('Ingresá un indicativo válido de al menos 3 caracteres.');
      return;
    }
    if (recipient === callsign) {
      setError('No podés iniciar una conversación privada con tu propio indicativo.');
      return;
    }
    setError('');
    setRecipientDraft(recipient);
    setActiveRecipient(recipient);
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!supabase || !callsign || !activeRecipient || !body || sending) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('send_community_private_message', {
        p_callsign: callsign,
        p_token: identityToken,
        p_recipient_callsign: activeRecipient,
        p_body: body,
      });
      if (rpcError || !data?.ok) {
        setError(data?.reason === 'recipient_not_found'
          ? 'Ese indicativo todavía no está registrado en la comunidad.'
          : 'No se pudo enviar el mensaje privado. Verificá la conexión e intentá nuevamente.');
        return;
      }
      setDraft('');
      await refreshMessages(activeRecipient);
      await refreshConversations();
    } finally {
      setSending(false);
    }
  };

  return (
    <section className={`min-w-0 overflow-hidden rounded-xl border border-violet-300 bg-violet-950 p-2.5 text-white sm:p-3 shadow-sm ${isOpen ? 'sm:col-span-3' : ''}`} aria-label="Mensajes privados">
      <button type="button" onClick={() => setIsOpen((value) => !value)} className="flex w-full items-center gap-2 text-left" aria-expanded={isOpen}>
        <span className="relative shrink-0 rounded-lg bg-violet-200 p-2 text-violet-950"><MessageCircle className="h-5 w-5" />
          {unreadTotal > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-violet-950 bg-red-600 px-1 text-[10px] font-black text-white">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
        </span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-violet-100">Mensajes</span><span className="block text-[10px] leading-tight text-violet-200">Bandeja privada y respuestas</span></span>
        <Inbox className="h-4 w-4 shrink-0 text-violet-200" />
      </button>
      {!isOpen ? null : (
        <div className="mt-3 border-t border-violet-800 pt-3 grid grid-cols-1 md:grid-cols-[minmax(180px,0.75fr)_minmax(0,1.5fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r">
            {!callsign ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Primero guardá tu señal distintiva en el chat comunitario. Se usará la identidad registrada en este dispositivo.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">Tu indicativo: <strong className="font-mono text-slate-900">{callsign}</strong></p>
                <form onSubmit={(event) => { event.preventDefault(); openConversation(recipientDraft); }} className="mb-3 flex gap-1.5">
                  <input value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))} maxLength={24} placeholder="Indicativo destino" aria-label="Indicativo destinatario" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-950 placeholder:text-slate-500 outline-none focus:border-violet-500" />
                  <button type="submit" className="rounded-lg bg-violet-800 px-3 py-2 text-xs font-bold text-white">Abrir</button>
                </form>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700">Conversaciones</h3>
                  <button type="button" onClick={() => void refreshConversations()} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="Actualizar conversaciones"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
                {conversations.length === 0 ? <div className="py-3 text-xs text-slate-500"><p>Todavía no aparecen conversaciones privadas.</p><button type="button" onClick={() => void refreshConversations()} className="mt-2 font-bold text-violet-800 underline">Volver a cargar</button></div> : (
                  <ul className="space-y-1.5">
                    {conversations.map((conversation) => (
                      <li key={conversation.other_callsign}>
                        <button type="button" onClick={() => openConversation(conversation.other_callsign)} className={'w-full rounded-lg border px-3 py-2 text-left ' + (activeRecipient === conversation.other_callsign ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-100')}>
                          <span className="flex items-center gap-2 text-slate-900">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-300 bg-violet-100">
                              {profilePhotos[conversation.other_callsign]
                                ? <img src={profilePhotos[conversation.other_callsign]} alt={`Foto de ${conversation.other_callsign}`} className="h-full w-full object-cover" />
                                : <span className="font-mono text-[10px] font-bold text-violet-900">{conversation.other_callsign.slice(0, 3)}</span>}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="flex items-center justify-between gap-2 font-mono text-xs font-bold text-slate-900">{conversation.other_callsign}{conversation.unread_count > 0 && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{conversation.unread_count}</span>}</span>
                              <span className="mt-1 block truncate text-[11px] font-normal text-slate-500">{conversation.last_body}</span>
                            </span>
                          </span>
                          
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </aside>
          <div className="flex min-h-[min(72vh,680px)] min-w-0 flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <div className="flex items-center gap-2">
                {activeRecipient && <button type="button" onClick={() => setActiveRecipient('')} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Volver a conversaciones"><ArrowLeft className="h-4 w-4" /></button>}
                <h3 className="text-sm font-bold">{activeRecipient ? 'Conversación con ' + activeRecipient : 'Elegí una conversación'}</h3>
              </div>
              {activeRecipient && <button type="button" onClick={() => void refreshMessages(activeRecipient)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Actualizar mensajes"><RefreshCw className="h-4 w-4" /></button>}
            </div>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-white p-3" style={{ maxHeight: 'calc(72vh - 150px)', minHeight: 300 }} aria-live="polite">
              {!activeRecipient && <p className="py-10 text-center text-sm text-slate-500">Elegí una conversación o escribí un indicativo para comenzar.</p>}
              {activeRecipient && messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Todavía no hay mensajes. Escribí el primero.</p>}
              {messages.map((message) => {
                const mine = message.sender_callsign === callsign;
                const sender = message.sender_callsign.trim().toUpperCase();
                const photo = profilePhotos[sender];
                return <article key={message.id} className={'flex max-w-[100%] items-start gap-2 ' + (mine ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row')}>
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-300 bg-slate-100">
                    {photo ? <img src={photo} alt={`Foto de ${sender}`} className="h-full w-full object-cover" /> : <span className="font-mono text-[10px] font-bold text-slate-500">{sender.slice(0, 3)}</span>}
                  </div>
                  <div className={'min-w-0 max-w-[85%] rounded-xl px-3 py-2 ' + (mine ? 'bg-violet-100 text-violet-950' : 'bg-slate-100 text-slate-900')}>
                    <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wide">{sender}</p>
                    <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                    <p className="mt-1 text-right text-[10px] text-slate-500">{new Date(message.created_at).toLocaleString()}</p>
                  </div>
                </article>;
              })}
            </div>
            {activeRecipient && (
              <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="flex gap-2 border-t border-slate-200 bg-slate-50 p-3">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={3} placeholder="Escribí un mensaje privado…" aria-label="Escribí un mensaje privado" className="min-h-20 min-w-0 flex-1 resize-y rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-500 outline-none focus:border-violet-500" />
                <button type="submit" disabled={sending || !draft.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-800 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">{sending ? 'Enviando…' : 'Enviar'}</span></button>
              </form>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end border-t border-violet-800 pt-3">
          <button type="button" onClick={() => setIsOpen(false)} className="inline-flex items-center gap-2 rounded-lg border border-violet-500 bg-violet-900 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-300" aria-label="Cerrar mensajes privados">
            Cerrar mensajes privados
          </button>
        </div>
      )}
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={'border-t px-4 py-3 text-sm ' + (error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>{error || notice}</div>}
    </section>
  );
};
