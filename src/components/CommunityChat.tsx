import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MessageCircle, Send, ShieldCheck, Users, Reply, AlertTriangle, LogOut, Trash2, Sun, Moon } from 'lucide-react';
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
  const [moderationRole, setModerationRole] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const isModerator = moderationRole === 'admin' || moderationRole === 'moderator';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [callsign, setCallsign] = useState(() => localStorage.getItem('community_chat_sd')?.trim().toUpperCase() || '');
  const [sdLocked, setSdLocked] = useState(() => Boolean(localStorage.getItem('community_chat_sd')));
  const [resolvingIdentity, setResolvingIdentity] = useState(() => !localStorage.getItem('community_chat_sd') && Boolean(localStorage.getItem('community_chat_identity_token')));
  const [showChangeCallsign, setShowChangeCallsign] = useState(false);
  const [identityToken] = useState(() => {
    const existing = localStorage.getItem('community_chat_identity_token');
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem('community_chat_identity_token', created);
    return created;
  });
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [showInfo, setShowInfo] = useState(false);
  const [darkChat, setDarkChat] = useState(() => localStorage.getItem('community_chat_theme') === 'dark');
  const toggleChatTheme = () => setDarkChat((current) => { const next = !current; localStorage.setItem('community_chat_theme', next ? 'dark' : 'light'); return next; });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  // Recover a previously registered callsign from this device token if local storage
  // lost the callsign value. Never ask the user to invent a replacement in that case.
  useEffect(() => {
    let active = true;
    const recoverCallsign = async () => {
      const saved = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (saved) { setResolvingIdentity(false); return; }
      if (!supabase || !identityToken) { setResolvingIdentity(false); return; }
      try {
        const { data, error: recoveryError } = await supabase.rpc('resolve_community_callsign', { p_token: identityToken });
        if (!active) return;
        const value = typeof data === 'string' ? data : Array.isArray(data) ? (data[0]?.callsign ?? data[0]?.sd ?? data[0]?.resolve_community_callsign) : data && typeof data === 'object' ? ((data as any).callsign ?? (data as any).sd ?? (data as any).resolve_community_callsign) : '';
        const recovered = !recoveryError && typeof value === 'string' ? value.trim().toUpperCase() : '';
        if (recovered) {
          localStorage.setItem('community_chat_sd', recovered);
          setCallsign(recovered);
          setSdLocked(true);
          window.dispatchEvent(new Event('user-profile-updated'));
          setNotice('Recuperamos tu señal distintiva registrada: ' + recovered + '.');
        }
      } finally {
        if (active) setResolvingIdentity(false);
      }
    };
    void recoverCallsign();
    return () => { active = false; };
  }, [identityToken]);

  // Public chat identities use a device token, not Supabase Auth. Resolve moderation
  // privileges against the server-side role table so public users cannot impersonate staff.
  useEffect(() => {
    let active = true;
    const loadModerationRole = async () => {
      if (!supabase || !callsign || !identityToken) {
        if (active) setModerationRole(null);
        return;
      }
      const { data, error: roleError } = await supabase.rpc('community_actor_role', {
        p_callsign: callsign.trim().toUpperCase(),
        p_token: identityToken,
      });
      if (!active) return;
      if (roleError) {
        console.warn('[LogBook chat] moderation role lookup:', roleError);
        setModerationRole(null);
      } else {
        setModerationRole(data === 'admin' || data === 'moderator' ? data : null);
      }
    };
    void loadModerationRole();
    return () => { active = false; };
  }, [callsign, identityToken]);

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
    // Poll as a fallback so messages still appear on other devices if Realtime
    // publication/subscription is unavailable in the Supabase project.
    const pollId = window.setInterval(() => { void loadMessages(); }, 5000);
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
      window.clearInterval(pollId);
      void supabase?.removeChannel(channel);
    };
  }, []);

  const saveCallsign = async () => {
    if (!supabase || busy) return;
    const cleanCallsign = callsign.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (cleanCallsign.length < 3 || cleanCallsign.length > 24) {
      setError('Ingresá un indicativo válido de entre 3 y 24 caracteres.');
      return;
    }
    const previousCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (previousCallsign && previousCallsign !== cleanCallsign) {
        const { data, error: changeError } = await supabase.rpc('change_community_callsign', {
          p_current_callsign: previousCallsign,
          p_new_callsign: cleanCallsign,
          p_token: identityToken,
        });
        if (changeError || !data?.ok) {
          setError(data?.reason === 'taken' ? 'Ese indicativo ya está registrado por otra persona.' : 'No se pudo cambiar el indicativo. Primero hay que aplicar la migración 3 en Supabase.');
          return;
        }
      } else {
        const { data, error: registerError } = await supabase.rpc('register_community_callsign', {
          p_callsign: cleanCallsign,
          p_token: identityToken,
        });
        if (registerError || !data?.ok) {
          setError(data?.reason === 'taken' ? 'Ese indicativo ya está registrado por otra persona.' : 'No se pudo guardar el indicativo. Revisá que las migraciones públicas estén aplicadas.');
          return;
        }
      }
      localStorage.setItem('community_chat_sd', cleanCallsign);
      setCallsign(cleanCallsign);
      setSdLocked(true);
      window.dispatchEvent(new Event('user-profile-updated'));
      setNotice('Señal distintiva guardada en este dispositivo.');
    } finally {
      setBusy(false);
    }
  };

  const switchAdminCallsign = async () => {
    if (!supabase || busy || !isModerator) return;
    const current = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    const target = current === 'LU1TSB' ? '4RC978' : current === '4RC978' ? 'LU1TSB/4RC978' : current === 'LU1TSB/4RC978' ? 'LU1TSB' : '';
    if (!target) { setError('No se reconoce esta cuenta administradora. Las tres cuentas previstas son LU1TSB, 4RC978 y LU1TSB/4RC978.'); return; }
    setBusy(true); setError(''); setNotice('');
    try {
      const { data, error: switchError } = await supabase.rpc('link_community_admin_alias', {
        p_callsign: current, p_token: identityToken, p_target_callsign: target,
      });
      if (switchError) {
        console.error('[CommunityChat] Error al cambiar indicativo administrador:', switchError);
        setError('Supabase rechazó el cambio (' + (switchError.code || 'sin código') + '): ' + switchError.message);
        return;
      }
      if (!data?.ok) {
        const reason = data?.reason || 'sin motivo devuelto';
        console.error('[CommunityChat] No se pudo cambiar indicativo administrador:', data);
        setError(reason === 'forbidden'
          ? 'No se pudo verificar el permiso de administrador para este indicativo.'
          : reason === 'missing_target'
            ? 'El otro indicativo todavía no está registrado en el chat.'
            : 'La función respondió: ' + reason + '. Revisá la respuesta de Supabase.');
        return;
      }
      localStorage.setItem('community_chat_sd', target);
      setCallsign(target); setSdLocked(true); setShowChangeCallsign(false); window.dispatchEvent(new Event('user-profile-updated'));
      setNotice('Indicativo cambiado a ' + target + '. Los permisos de administrador se mantienen.');
    } finally { setBusy(false); }
  };

  const sendMessage = async () => {
    if (!supabase || busy) return;
    const body = draft.trim();
    const cleanCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!body) return;
    if (cleanCallsign.length < 3 || cleanCallsign.length > 24) { setError('Ingresá tu SD/indicativo antes de enviar.'); return; }
    setBusy(true); setError('');
    try {
      const previousCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (previousCallsign && previousCallsign !== cleanCallsign) {
        const { data: changeData, error: changeError } = await supabase.rpc('change_community_callsign', {
          p_current_callsign: previousCallsign,
          p_new_callsign: cleanCallsign,
          p_token: identityToken,
        });
        if (changeError || !changeData?.ok) {
          setError(changeData?.reason === 'taken' ? 'Ese indicativo ya está registrado por otra persona.' : 'No se pudo cambiar el indicativo. Verificá que la migración de corrección de indicativo esté aplicada.');
          return;
        }
      } else {
        const { data: identityData, error: identityError } = await supabase.rpc('register_community_callsign', { p_callsign: cleanCallsign, p_token: identityToken });
        if (identityError || !identityData?.ok) { setError(identityData?.reason === 'taken' ? 'Ese SD ya está registrado por otra persona. No se permiten duplicados.' : identityData?.reason === 'locked' ? 'Este dispositivo ya tiene un SD registrado. Usá «Cambiar indicativo» para corregirlo.' : 'No se pudo registrar tu SD. Revisá que las migraciones del chat estén aplicadas en Supabase.'); return; }
      }
      localStorage.setItem('community_chat_sd', cleanCallsign);
      setCallsign(cleanCallsign);
      setSdLocked(true);
      const { data, error: sendError } = await supabase.rpc('post_community_message', { p_callsign: cleanCallsign, p_token: identityToken, p_body: body, p_reply_to_callsign: replyTo?.callsign || null });
      if (sendError || !data?.ok) { console.error('[LogBook chat] public message insert error:', sendError || data); setError('No se pudo enviar. Verificá que las migraciones públicas del chat estén aplicadas en Supabase.'); return; }
      if (data.message) setMessages((current) => current.some((item) => item.id === data.message.id) ? current : [...current, data.message as ChatMessage].slice(-100));
      setDraft(''); setReplyTo(null);
    } finally { setBusy(false); }
  };
  const deleteMessage = async (message: ChatMessage) => {
    const actorCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!supabase || !isModerator || !actorCallsign || deletingId) return;
    if (!window.confirm(`¿Eliminar definitivamente el mensaje de ${message.callsign}?`)) return;
    setDeletingId(message.id);
    setError('');
    try {
      // Use the protected moderation RPC; direct table DELETE requires a different auth model.
      const { data, error: deleteError } = await supabase.rpc('community_moderation_action', {
        p_callsign: actorCallsign,
        p_token: identityToken,
        p_action: 'delete_message',
        p_target_callsign: message.callsign,
        p_reason: message.id,
      });
      if (deleteError || !data?.ok) {
        console.error('[LogBook chat] moderation delete failed:', deleteError || data);
        setError(data?.reason === 'forbidden'
          ? 'Tu indicativo no tiene permisos de moderación en Supabase.'
          : 'No se pudo eliminar el mensaje. Comprobá que esté aplicada la migración de moderación y que tu indicativo tenga el rol correcto.');
        return;
      }
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setNotice('Mensaje eliminado.');
    } finally {
      setDeletingId(null);
    }
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
        <div className="flex items-center gap-1"><button type="button" onClick={toggleChatTheme} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label={darkChat ? "Cambiar a fondo blanco" : "Cambiar a fondo negro"} title={darkChat ? "Fondo blanco" : "Fondo negro"}>{darkChat ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button><button type="button" onClick={() => setShowInfo((v) => !v)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Información de seguridad"><ShieldCheck className="h-5 w-5" /></button></div>
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
      ) : (
        <>
          <div className={`max-h-[360px] min-h-[230px] space-y-3 overflow-y-auto px-4 py-4 sm:px-5 ${darkChat ? "bg-black text-white" : "bg-white text-slate-950"}`} aria-live="polite">
            {messages.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Todavía no hay mensajes. ¡Podés iniciar la conversación!</p>}
            {messages.map((message) => (
              <article key={message.id} className={`rounded-xl border px-3 py-2.5 hover:border-sky-200 ${darkChat ? "border-slate-700 bg-black text-white" : "border-slate-100 bg-white text-slate-950"}`}>
                {message.reply_to_callsign && <p className="mb-1 text-xs text-slate-500"><Reply className="mr-1 inline h-3 w-3" />Respuesta a {message.reply_to_callsign}</p>}
                <p className="break-words text-sm leading-relaxed"><strong className={`font-mono font-extrabold uppercase ${["LU1TSB","LU1TSB/4RC978","RC978","4RC978"].includes(message.callsign.trim().toUpperCase()) ? "text-red-600" : darkChat ? "text-white" : "text-slate-950"}`}>{message.callsign}:</strong> <span className={darkChat ? "text-white" : "text-slate-800"}>{message.body}</span></p>
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
            {isModerator && sdLocked && (
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                <span className="text-xs font-semibold text-red-800">Administrador: {callsign}</span>
                <button type="button" onClick={() => void switchAdminCallsign()} disabled={busy} className="rounded-lg bg-red-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? "Cambiando…" : `Cambiar cuenta administradora (${callsign === "LU1TSB" ? "4RC978" : callsign === "4RC978" ? "LU1TSB/4RC978" : "LU1TSB"})`}</button>
              </div>
            )}
            {!sdLocked && !resolvingIdentity && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-white p-3">
                <label htmlFor="community-current-callsign" className="mb-1 block text-xs font-semibold text-slate-600">Señal distintiva para el chat</label>
                <input id="community-current-callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))} onBlur={() => setCallsign(callsign.trim().toUpperCase().replace(/[^A-Z0-9/]/g, ''))} maxLength={24} autoComplete="off" spellCheck={false} placeholder="Ej.: LU1TSB/4RC978" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500" />
                <p className="mt-1 text-[11px] text-slate-500">Este indicativo solo identifica tus mensajes en el chat. Los campos de indicativo de las eQSL se mantienen separados.</p>
                <div className="mt-2 flex gap-2">
                  <button type="button" onClick={() => void saveCallsign()} disabled={busy || callsign.trim().length < 3} className="rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar indicativo'}</button>                </div>
              </div>
            )}
            <div className="flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} maxLength={500} placeholder="Escribí un mensaje…" className={`min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 ${darkChat ? "border-slate-600 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900"}`} />
              <button type="button" onClick={() => void sendMessage()} disabled={busy || !draft.trim() || callsign.trim().length < 3} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button>
            </div>
          </div>
        </>
      )}
      {(notice || error) && <div role={error ? 'alert' : 'status'} className={`border-t px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{error || notice}</div>}
    </section>
  );
};
