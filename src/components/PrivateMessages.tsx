import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, LockKeyhole, MessageCircle, RefreshCw, Send } from 'lucide-react';
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
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
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
    setConversations(Array.isArray(data) ? data as PrivateConversation[] : []);
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
    if (!isOpen || !callsign || !supabase) return;
    void refreshConversations();
    const poll = window.setInterval(() => {
      void refreshConversations();
      if (activeRecipient) void refreshMessages(activeRecipient);
    }, 5000);
    return () => window.clearInterval(poll);
  }, [isOpen, callsign, activeRecipient, refreshConversations, refreshMessages]);

  useEffect(() => {
    if (activeRecipient && isOpen) {
      void refreshMessages(activeRecipient);
      setNotice('');
    }
  }, [activeRecipient, isOpen, refreshMessages]);

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
    <section className="mb-6 overflow-hidden rounded-2xl border border-violet-200 bg-white text-slate-900 shadow-lg" aria-label="Mensajes privados">
      <div className="flex items-center justify-between gap-3 bg-violet-950 px-4 py-3 text-white sm:px-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-white/10 p-2 text-violet-200"><LockKeyhole className="h-5 w-5" /></div>
          <div>
            <h2 className="font-bold leading-tight">Mensajes privados</h2>
            <p className="mt-1 text-xs text-violet-200">Conversaciones entre dos indicativos</p>
          </div>
        </div>
        <button type="button" onClick={() => setIsOpen((value) => !value)} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold hover:bg-white/20" aria-expanded={isOpen}>
          {isOpen ? 'Cerrar' : 'Abrir'}
        </button>
      </div>
      {!isOpen ? (
        <div className="flex items-center gap-2 px-4 py-3 text-sm text-slate-600 sm:px-5">
          <MessageCircle className="h-4 w-4 shrink-0 text-violet-700" />
          <span>Iniciá una conversación privada sin publicar el mensaje en el chat comunitario.</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,0.75fr)_minmax(0,1.5fr)]">
          <aside className="border-b border-slate-200 bg-slate-50 p-3 md:border-b-0 md:border-r">
            {!callsign ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Primero guardá tu señal distintiva en el chat comunitario. Se usará la identidad registrada en este dispositivo.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-slate-500">Tu indicativo: <strong className="font-mono text-slate-900">{callsign}</strong></p>
                <form onSubmit={(event) => { event.preventDefault(); openConversation(recipientDraft); }} className="mb-3 flex gap-1.5">
                  <input value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))} maxLength={24} placeholder="Indicativo destino" aria-label="Indicativo destinatario" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs outline-none focus:border-violet-500" />
                  <button type="submit" className="rounded-lg bg-violet-800 px-3 py-2 text-xs font-bold text-white">Abrir</button>
                </form>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700">Conversaciones</h3>
                  <button type="button" onClick={() => void refreshConversations()} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="Actualizar conversaciones"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
                {conversations.length === 0 ? <p className="py-3 text-xs text-slate-500">Todavía no tenés conversaciones privadas.</p> : (
                  <ul className="space-y-1.5">
                    {conversations.map((conversation) => (
                      <li key={conversation.other_callsign}>
                        <button type="button" onClick={() => openConversation(conversation.other_callsign)} className={'w-full rounded-lg border px-3 py-2 text-left ' + (activeRecipient === conversation.other_callsign ? 'border-violet-300 bg-violet-50' : 'border-slate-200 bg-white hover:bg-slate-100')}>
                          <span className="flex items-center justify-between gap-2 font-mono text-xs font-bold">{conversation.other_callsign}{conversation.unread_count > 0 && <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] text-white">{conversation.unread_count}</span>}</span>
                          <span className="mt-1 block truncate text-[11px] text-slate-500">{conversation.last_body}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </aside>
          <div className="flex min-h-[300px] min-w-0 flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
              <div className="flex items-center gap-2">
                {activeRecipient && <button type="button" onClick={() => setActiveRecipient('')} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Volver a conversaciones"><ArrowLeft className="h-4 w-4" /></button>}
                <h3 className="text-sm font-bold">{activeRecipient ? 'Conversación con ' + activeRecipient : 'Elegí una conversación'}</h3>
              </div>
              {activeRecipient && <button type="button" onClick={() => void refreshMessages(activeRecipient)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Actualizar mensajes"><RefreshCw className="h-4 w-4" /></button>}
            </div>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-white p-3" style={{ maxHeight: 320, minHeight: 220 }} aria-live="polite">
              {!activeRecipient && <p className="py-10 text-center text-sm text-slate-500">Elegí una conversación o escribí un indicativo para comenzar.</p>}
              {activeRecipient && messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Todavía no hay mensajes. Escribí el primero.</p>}
              {messages.map((message) => {
                const mine = message.sender_callsign === callsign;
                return <article key={message.id} className={'max-w-[90%] rounded-xl px-3 py-2 ' + (mine ? 'ml-auto bg-violet-100 text-violet-950' : 'mr-auto bg-slate-100 text-slate-900')}>
                  <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
                  <p className="mt-1 text-right text-[10px] text-slate-500">{new Date(message.created_at).toLocaleString()}</p>
                </article>;
              })}
            </div>
            {activeRecipient && (
              <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="flex gap-2 border-t border-slate-200 bg-slate-50 p-3">
                <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} placeholder="Escribí un mensaje privado…" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500" />
                <button type="submit" disabled={sending || !draft.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-800 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">{sending ? 'Enviando…' : 'Enviar'}</span></button>
              </form>
            )}
          </div>
        </div>
      )}
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={'border-t px-4 py-3 text-sm ' + (error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>{error || notice}</div>}
      <div className="border-t border-slate-100 px-4 py-2 text-[10px] text-slate-500">Privacidad: los mensajes se consultan mediante funciones del servidor que validan el indicativo y su token. No se leen desde la tabla pública.</div>
    </section>
  );
};
