import React, { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MessageCircle, Send, ShieldCheck, Users, Reply, AlertTriangle, LogOut, Mail, LoaderCircle } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

type ChatMessage = {
  id: string;
  user_id: string;
  callsign: string;
  body: string;
  reply_to_callsign: string | null;
  created_at: string;
};

export const CommunityChat: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [callsign, setCallsign] = useState(() => localStorage.getItem('user_callsign')?.trim().toUpperCase() || '');
  const [email, setEmail] = useState('');
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
      if (sessionError) setError('No se pudo recuperar la sesión. Intentá ingresar de nuevo.');
      setSession(data.session);
      if (data.session) {
        localStorage.setItem('logbook_chat_authenticated', '1');
        localStorage.removeItem('logbook_chat_invitation_pending');
      }
      const saved = data.session?.user.user_metadata?.callsign || localStorage.getItem('user_callsign') || '';
      if (saved) setCallsign(String(saved).trim().toUpperCase());
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession) {
        localStorage.setItem('logbook_chat_authenticated', '1');
        localStorage.removeItem('logbook_chat_invitation_pending');
        const saved = nextSession.user.user_metadata?.callsign || localStorage.getItem('user_callsign') || '';
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
    if (!supabase || !session?.user.id) {
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
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('La conexión en tiempo real no está disponible. Revisá que Realtime esté habilitado en Supabase.');
        }
      });
    return () => {
      active = false;
      void supabase?.removeChannel(channel);
    };
  }, [session?.user.id]);

  const requestSignIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    const cleanEmail = email.trim().toLowerCase();
    const cleanCallsign = callsign.trim().toUpperCase();
    if (!cleanEmail.includes('@')) {
      setError('Ingresá un correo electrónico válido.');
      return;
    }
    if (cleanCallsign.length < 3 || cleanCallsign.length > 24) {
      setError('Ingresá tu indicativo (entre 3 y 24 caracteres).');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    const { error: authError } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: {
        emailRedirectTo: window.location.origin,
        data: { callsign: cleanCallsign },
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    if (authError) {
      // Keep the diagnostic visible in Preview so configuration/rate-limit failures can be identified.
      console.error('[LogBook chat] Supabase sign-in error:', authError);
      setError(`No se pudo enviar el enlace: ${authError.message}`);
    }
    else setNotice('Te enviamos un enlace de acceso por correo. Abrilo en este dispositivo para entrar al chat.');
  };

  const sendMessage = async () => {
    if (!supabase || !session) return;
    const body = draft.trim();
    const cleanCallsign = callsign.trim().toUpperCase();
    if (!body) return;
    if (cleanCallsign.length < 3 || cleanCallsign.length > 24) {
      setError('Ingresá un indicativo válido antes de enviar.');
      return;
    }
    setBusy(true);
    setError('');
    const { error: profileError } = await supabase.auth.updateUser({ data: { callsign: cleanCallsign } });
    if (profileError) {
      setBusy(false);
      setError('No se pudo guardar tu indicativo. Volvé a iniciar sesión.');
      return;
    }
    const { data, error: sendError } = await supabase
      .from('community_messages')
      .insert({
        user_id: session.user.id,
        callsign: cleanCallsign,
        body,
        reply_to_callsign: replyTo?.callsign || null,
      })
      .select('id,user_id,callsign,body,reply_to_callsign,created_at')
      .single();
    setBusy(false);
    if (sendError) {
      setError('No se pudo enviar el mensaje. Verificá los permisos del chat y volvé a intentar.');
      return;
    }
    setMessages((current) => current.some((item) => item.id === data.id) ? current : [...current, data as ChatMessage].slice(-100));
    setDraft('');
    setReplyTo(null);
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
            <p className="mt-1 text-xs text-slate-300">{session ? 'Chat comunitario en tiempo real' : 'Acceso autenticado por correo'}</p>
          </div>
        </div>
        <button type="button" onClick={() => setShowInfo((v) => !v)} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Información de seguridad"><ShieldCheck className="h-5 w-5" /></button>
      </div>
      {showInfo && <div className="border-b border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-950"><strong>Acceso protegido:</strong> solo los usuarios autenticados pueden leer y publicar mensajes. No compartas datos personales ni información privada de contacto.</div>}
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-2.5 text-xs text-slate-600 sm:px-5">
        <span className="inline-flex items-center gap-1.5"><Users className="h-4 w-4" /> {session ? 'Sesión autenticada' : 'Se requiere autenticación'}</span>
        {session && <button type="button" onClick={signOut} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-semibold hover:bg-slate-200"><LogOut className="h-3.5 w-3.5" /> Salir</button>}
      </div>

      {!supabase ? (
        <div className="space-y-2 bg-amber-50 px-4 py-5 text-sm text-amber-950 sm:px-5">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" /> Chat pendiente de conexión</p>
          <p>El servicio de autenticación todavía no está configurado. El chat permanece cerrado hasta agregar las variables públicas de Supabase en Vercel.</p>
        </div>
      ) : !session ? (
        <form onSubmit={requestSignIn} className="space-y-3 bg-white px-4 py-5 sm:px-5">
          <p className="text-sm text-slate-700">Autentificate con tu correo para acceder al chat comunitario. Te enviaremos un enlace de acceso.</p>
          <label htmlFor="community-callsign" className="block text-xs font-semibold text-slate-600">Tu indicativo</label>
          <input id="community-callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} maxLength={24} required minLength={3} placeholder="Ej.: LU1TSB" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          <label htmlFor="community-email" className="block text-xs font-semibold text-slate-600">Correo electrónico</label>
          <input id="community-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="tu@correo.com" className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
          <button type="submit" disabled={busy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 text-sm font-bold text-white hover:bg-sky-600 disabled:opacity-50">{busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />} Enviarme el enlace de acceso</button>
        </form>
      ) : (
        <>
          <div className="max-h-[360px] min-h-[230px] space-y-3 overflow-y-auto bg-white px-4 py-4 sm:px-5" aria-live="polite">
            {messages.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Todavía no hay mensajes. ¡Podés iniciar la conversación!</p>}
            {messages.map((message) => (
              <article key={message.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2.5 hover:border-sky-200">
                {message.reply_to_callsign && <p className="mb-1 text-xs text-slate-500"><Reply className="mr-1 inline h-3 w-3" />Respuesta a {message.reply_to_callsign}</p>}
                <p className="break-words text-sm leading-relaxed"><strong className="font-mono font-extrabold uppercase text-slate-950">{message.callsign}:</strong> <span className="text-slate-800">{message.body}</span></p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString()}</span>
                  <button type="button" onClick={() => setReplyTo(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Reply className="h-3 w-3" /> Responder</button>
                </div>
              </article>
            ))}
          </div>
          {replyTo && <div className="flex items-center justify-between border-t border-slate-200 bg-sky-50 px-4 py-2 text-xs text-slate-700"><span>Respondiendo a <strong>{replyTo.callsign}</strong></span><button type="button" onClick={() => setReplyTo(null)} className="font-semibold underline">Cancelar</button></div>}
          <div className="border-t border-slate-200 bg-slate-50 p-3 sm:p-4">
            <label htmlFor="community-current-callsign" className="mb-1 block text-xs font-semibold text-slate-600">Tu indicativo</label>
            <input id="community-current-callsign" value={callsign} onChange={(e) => setCallsign(e.target.value.toUpperCase())} maxLength={24} className="mb-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-sky-500" />
            <div className="flex gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} maxLength={500} placeholder="Escribí un mensaje…" className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100" />
              <button type="button" onClick={() => void sendMessage()} disabled={busy || !draft.trim()} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button>
            </div>
          </div>
        </>
      )}
      {(notice || error) && <div role={error ? 'alert' : 'status'} className={`border-t px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{error || notice}</div>}
      <p className="flex items-start gap-1.5 border-t border-slate-200 bg-slate-50 px-4 py-3 text-[11px] leading-relaxed text-slate-500"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Los mensajes se comparten con usuarios autenticados. Evitá publicar información privada.</p>
    </section>
  );
};
