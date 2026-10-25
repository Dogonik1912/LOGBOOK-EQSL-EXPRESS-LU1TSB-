import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MessageCircle, Send, ShieldCheck, Users, Reply, AlertTriangle, LogOut, Trash2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

type ChatMessage = {
  id: string;
  user_id: string | null;
  callsign: string;
  body: string;
  reply_to_callsign: string | null;
  created_at: string;
};

export const CommunityChat: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isModerator = ['admin', 'moderator'].includes(String(session?.user.app_metadata?.role || '').toLowerCase()) || (Array.isArray(session?.user.app_metadata?.roles) && session.user.app_metadata.roles.some((role: unknown) => ['admin', 'moderator'].includes(String(role).toLowerCase())));
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [callsign, setCallsign] = useState(() => localStorage.getItem('community_chat_sd')?.trim().toUpperCase() || '');
  const [sdLocked, setSdLocked] = useState(() => Boolean(localStorage.getItem('community_chat_sd')));
  const [identityToken] = useState(() => {
    const existing = localStorage.getItem('community_chat_identity_token');
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem('community_chat_identity_token', created);
    return created;
  });
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) console.warn('[LogBook chat] session lookup:', sessionError);
      setSession(data.session);
      if (data.session) {
        localStorage.setItem('logbook_chat_authenticated', '1');
        localStorage.removeItem('logbook_chat_invitation_pending');
      }
      const saved = localStorage.getItem('community_chat_sd') || '';
      if (saved) setCallsign(String(saved).trim().toUpperCase());
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession) {
        localStorage.setItem('logbook_chat_authenticated', '1');
        localStorage.removeItem('logbook_chat_invitation_pending');
        const saved = localStorage.getItem('community_chat_sd') || '';
        if (saved) setCallsign(String(saved).trim().toUpperCase());
        setNotice('Sesión iniciada. Ya podés participar del chat.');
      }
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setMessages([]);
      return;
    }
    let active = true;
    const loadMessages = async () => {
      setError('');
      const { data, error: loadError } = await supabase
        .from('community_messages')
        .select('id,user_id,callsign,body,reply_to_callsign,created_at')
        .order('created_at', { ascending: true })
        .limit(100);
      if (!active) return;
      if (loadError) setError('No se pudieron cargar los mensajes. Revisá la configuración de la tabla y sus permisos.');
      else setMessages((data || []) as ChatMessage[]);
    };
    void loadMessages();
    const channel = supabase
      .channel('logbook-community-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, (payload) => {
        const incoming = payload.new as ChatMessage;
        setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming].slice(-100));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_messages' }, (payload) => {
        const removed = payload.old as Partial<ChatMessage>;
        if (removed.id) setMessages((current) => current.filter((item) => item.id !== removed.id));
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('La conexión en tiempo real no está disponible. Revisá que Realtime esté habilitado en Supabase.');
        }
      });
    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, []);

  const sendMessage = async () => {
    if (!supabase || busy) return;
    const body = draft.trim();
    const cleanCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!body) return;
    if (cleanCallsign.length < 3 || cleanCallsign.length > 24) { setError('Ingresá tu SD/indicativo antes de enviar.'); return; }
    setBusy(true); setError('');
    try {
      const { data: identityData, error: identityError } = await supabase.rpc('register_community_callsign', { p_callsign: cleanCallsign, p_token: identityToken });
      if (identityError || !identityData?.ok) { setError(identityData?.reason === 'taken' ? 'Ese SD ya está registrado. No se permiten duplicados.' : 'No se pudo registrar tu SD. Revisá que las migraciones del chat estén aplicadas en Supabase.'); return; }
      localStorage.setItem('community_chat_sd', cleanCallsign); setCallsign(cleanCallsign); setSdLocked(true);
      const { data, error: sendError } = await supabase.rpc('post_community_message', { p_callsign: cleanCallsign, p_token: identityToken, p_body: body, p_reply_to_callsign: replyTo?.callsign || null });
      if (sendError || !data?.ok) { console.error('[LogBook chat] public message insert error:', sendError || data); setError('No se pudo enviar. Verificá que las migraciones públicas del chat estén aplicadas en Supabase.'); return; }
      if (data.message) setMessages((current) => current.some((item) => item.id === data.message.id) ? current : [...current, data.message as ChatMessage].slice(-100));
      setDraft(''); setReplyTo(null);
    } finally { setBusy(false); }
  };
  const deleteMessage = async (message: ChatMessage) => {
    if (!supabase || !session || !isModerator || deletingId) return;
    if (!window.confirm(`¿Eliminar definitivamente el mensaje de ${message.callsign}?`)) return;
    setDeletingId(message.id);
    setError('');
    const { error: deleteError } = await supabase.from('community_messages').delete().eq('id', message.id);
    setDeletingId(null);
    if (deleteError) {
      setError('No se pudo eliminar el mensaje. Verificá que tu cuenta tenga rol de administrador o moderador en Supabase.');
      return;
    }
    setMessages((current) => current.filter((item) => item.id !== message.id));
    setNotice('Mensaje eliminado.');
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError('No se pudo cerrar la sesión.');
    else {
      setSession(null);
      localStorage.removeItem('logbook_chat_authenticated');
      setMessages([]);
      setNotice('Sesión cerrada.');
    }
  };

  return (
    <section id="community-chat" className="mb-6 overflow-hidden rounded-2xl border border-sky-900/70 bg-white text-slate-900 shadow-xl" aria-label="Chat de la comunidad">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300"><MessageCircle className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="font-bold leading-tight">Comunidad LogBook eQSL EXPRESS</h2>
            <p className="mt-1 text-xs text-slate-300">Chat comunitario en tiempo real · gratuito y sin registro</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowInfo((v) => !v)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Información de seguridad"><ShieldCheck className="h-5 w-5" /></button>
      </div>
      {showInfo && <div className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"><strong>Chat comunitario:</strong> cualquier visitante puede leer y publicar mensajes sin registro. No compartas datos personales ni información privada de contacto.</div>}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 sm:px-5">
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> Acceso público · sin registro</span>
        {session && <button type="button" onClick={signOut} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold hover:bg-slate-200"><LogOut className="h-3.5 w-3.5" /> Salir</button>}
      </div>

      {!supabase ? (
        <div className="space-y-2 bg-amber-50 px-4 py-5 text-sm text-amber-950 sm:px-5">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" /> Chat pendiente de conexión</p>
          <p>El servicio del chat todavía no está configurado. Revisá las variables públicas de Supabase en Vercel.</p>
        </div>
      ) : false ? (
        <>
          <div className="max-h-[360px] min-h-[180px] space-y-3 overflow-y-auto bg-white px-4 py-4 sm:px-5" aria-live="polite">
            {messages.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Todavía no hay mensajes publicados.</p>}
            {messages.map((message) => <article key={message.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5"><p className="break-words text-sm leading-relaxed"><strong className="font-mono font-extrabold uppercase text-slate-950">{message.callsign}:</strong> <span className="text-slate-800">{message.body}</span></p><span className="mt-1 block text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString()}</span></article>)}
          </div>
          <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
            <p className="mb-3 text-xs text-slate-600">Acceso gratuito y sin registro. Solo necesitamos tu SD para identificarte.</p>
            <label htmlFor="community-public-callsign" className="mb-1 block text-xs font-semibold text-slate-600">Tu SD / indicativo único</label>
            <input id="community-public-callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} disabled={sdLocked} maxLength={24} minLength={3} required className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none disabled:bg-slate-100 disabled:text-slate-600" placeholder="Ej.: LU1TSB" />
            {sdLocked && <p className="mb-2 text-xs text-slate-500">Tu SD quedó guardada y no se puede modificar desde este dispositivo.</p>}
            <div className="flex gap-2"><input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} maxLength={500} placeholder="Escribí un mensaje…" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-sky-500" /><button type="button" onClick={() => void sendMessage()} disabled={busy || !draft.trim() || callsign.trim().length < 3} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button></div>
          </div>
        </>      ) : (
        <>
          <div className="max-h-[360px] min-h-[230px] space-y-3 overflow-y-auto bg-white px-4 py-4 sm:px-5" aria-live="polite">
            {messages.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Todavía no hay mensajes. ¡Podés iniciar la conversación!</p>}
            {messages.map((message) => (
              <article key={message.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:border-sky-200">
                {message.reply_to_callsign && <p className="mb-1 text-xs text-slate-500"><Reply className="mr-1 inline h-3 w-3" />Respuesta a {message.reply_to_callsign}</p>}
                <p className="break-words text-sm leading-relaxed"><strong className="font-mono font-extrabold uppercase text-slate-950">{message.callsign}:</strong> <span className="text-slate-800">{message.body}</span></p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString()}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setReplyTo(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Reply className="h-3 w-3" /> Responder</button>
                    {isModerator && <button type="button" disabled={deletingId === message.id} onClick={() => void deleteMessage(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Eliminar mensaje de ${message.callsign}`}><Trash2 className="h-3 w-3" /> {deletingId === message.id ? 'Eliminando…' : 'Borrar'}</button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
          {replyTo && <div className="flex items-center justify-between border-t border-slate-200 bg-sky-50 px-4 py-2 text-xs text-slate-700"><span>Respondiendo a <strong>{replyTo.callsign}</strong></span><button type="button" onClick={() => setReplyTo(null)} className="font-semibold underline">Cancelar</button></div>}
          <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
            <p className="mb-3 text-xs text-slate-600">Acceso gratuito y sin registro. Tu SD se registra una sola vez, es único y queda fijo.</p>
            {sdLocked && <p className="mb-2 text-xs text-slate-500">SD registrado; es único y no se puede modificar.</p>}
            <label htmlFor="community-current-callsign" className="mb-1 block text-xs font-semibold text-slate-600">Tu SD / indicativo</label>
            <input id="community-current-callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} disabled={sdLocked} maxLength={24} className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500" />
            <div className="flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} maxLength={500} placeholder="Escribí un mensaje…" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              <button type="button" onClick={() => void sendMessage()} disabled={busy || !draft.trim() || callsign.trim().length < 3} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button>
            </div>
          </div>
        </>
      )}
      {(notice || error) && <div role={error ? 'alert' : 'status'} className={`border-t px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{error || notice}</div>}
      <p className="flex items-start gap-1.5 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Chat gratuito y sin registro. Evitá publicar información privada.</p>
    </section>
  );
};
