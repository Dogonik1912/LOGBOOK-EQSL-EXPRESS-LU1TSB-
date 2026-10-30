import React, { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MessageCircle, Send, ShieldCheck, Reply, AlertTriangle, Trash2, Sun, Moon, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type OnlineUser = { callsign: string; identityToken?: string };

const openPrivateMessage = (rawCallsign: string) => {
  const callsign = String(rawCallsign || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (callsign.length < 3) return;
  window.dispatchEvent(new CustomEvent('open-private-message', { detail: { callsign } }));
};

// La misma función central se usa en generador, usuarios en línea y Live Spot.
const callsignCountryFlag = (rawCallsign: string): string => {
  const call = String(rawCallsign || '').trim().toUpperCase();
  return flagForCallsign(call, undefined, is11MeterStationIdentifier(call));
};

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
  const [moderationStatus, setModerationStatus] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [moderationTarget, setModerationTarget] = useState<string | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [moderatorCandidate, setModeratorCandidate] = useState('');
  const [moderatorTargetSelected, setModeratorTargetSelected] = useState<string | null>(null);
  const [adminSanctions, setAdminSanctions] = useState<any[]>([]);
  const [adminAudit, setAdminAudit] = useState<any[]>([]);
  const isAdmin = moderationRole === 'admin';
  const isModerator = isAdmin || moderationRole === 'moderator';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatSectionRef = useRef<HTMLElement | null>(null);
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>({});
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [appLanguage, setAppLanguage] = useState(() => (localStorage.getItem('app_language') || 'es').toLowerCase());
  const [translatedBodies, setTranslatedBodies] = useState<Record<string, string>>({});
  const translationPending = useRef<Set<string>>(new Set());
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
  // Por privacidad y para no ocupar espacio al entrar, el chat siempre inicia cerrado.
  // Al desplegarlo, los usuarios nuevos verán aquí mismo la validación de su señal distintiva.
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const toggleCommunityChat = () => setChatCollapsed((current) => !current);

  // Al abrir el chat, llevar su encabezado al borde superior de la pantalla.
  // El listado conserva su propio scroll y queda posicionado en el mensaje más reciente.
  useEffect(() => {
    if (chatCollapsed) return;
    const frame = window.requestAnimationFrame(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatCollapsed]);
  const [darkChat, setDarkChat] = useState(() => localStorage.getItem('community_chat_theme') !== 'light');
  const toggleChatTheme = () => setDarkChat((current) => { const next = !current; localStorage.setItem('community_chat_theme', next ? 'dark' : 'light'); return next; });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [error, setError] = useState('');
  const [moderationBusy, setModerationBusy] = useState(false);

  // Recover a previously registered callsign from this device token if local storage
  // lost the callsign value. Never ask the user to invent a replacement in that case.
  useEffect(() => {
    let active = true;
    const recoverCallsign = async () => {
      const saved = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (saved || !supabase || !identityToken) return;
      const { data, error: recoveryError } = await supabase.rpc('resolve_community_callsign', { p_token: identityToken });
      if (!active || recoveryError || typeof data !== 'string' || !data.trim()) return;
      const recovered = data.trim().toUpperCase();
      localStorage.setItem('community_chat_sd', recovered);
      setCallsign(recovered);
      setSdLocked(true);
      window.dispatchEvent(new Event('user-profile-updated'));
      setNotice('Recuperamos tu señal distintiva registrada: ' + recovered + '.');
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
        if (active) { setModerationRole(null); setModerationStatus(''); }
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
        setModerationStatus('No se pudieron verificar los privilegios en Supabase.');
      } else {
        const verifiedRole = data === 'admin' || data === 'moderator' ? data : null;
        setModerationRole(verifiedRole);
        setModerationStatus(callsign.trim().toUpperCase() === 'LU1TSB' && !verifiedRole
          ? 'LU1TSB no está verificado como administrador en este dispositivo: el token de identidad no coincide con el registro de Supabase.'
          : '');
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
      else setMessages(((data || []) as ChatMessage[]).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    };
    void loadMessages();
    // Poll as a fallback so messages still appear on other devices if Realtime
    // publication/subscription is unavailable in the Supabase project.
    const pollId = window.setInterval(() => { void loadMessages(); }, 5000);
    const channel = supabase
      .channel('logbook-community-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, (payload) => {
        const incoming = payload.new as ChatMessage;
        setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-100));
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


  // Keep the newest community message visible; older messages move upward in the scroll area.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Publish presence only while the visitor has a saved callsign. Supabase Realtime
  // Presence provides a shared online roster without adding a registration flow.
  useEffect(() => {
    if (!supabase || !callsign.trim() || !identityToken) {
      setOnlineUsers([]);
      return;
    }
    let active = true;
    const presenceChannel = supabase.channel('logbook-community-presence', {
      config: { presence: { key: identityToken } },
    });
    const refreshOnlineUsers = () => {
      if (!active) return;
      const state = presenceChannel.presenceState() as Record<string, Array<{ callsign?: string; identityToken?: string }>>;
      const unique = new Map<string, OnlineUser>();
      Object.values(state).flat().forEach((entry) => {
        const clean = String(entry?.callsign || '').trim().toUpperCase();
        if (clean) unique.set(clean, { callsign: clean, identityToken: entry.identityToken });
      });
      setOnlineUsers(Array.from(unique.values()).sort((a, b) => a.callsign.localeCompare(b.callsign)));
    };
    presenceChannel.on('presence', { event: 'sync' }, refreshOnlineUsers);
    presenceChannel.on('presence', { event: 'join' }, refreshOnlineUsers);
    presenceChannel.on('presence', { event: 'leave' }, refreshOnlineUsers);
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && active) {
        await presenceChannel.track({ callsign: callsign.trim().toUpperCase(), identityToken });
        refreshOnlineUsers();
      }
    });
    return () => {
      active = false;
      void presenceChannel.untrack();
      void supabase?.removeChannel(presenceChannel);
    };
  }, [callsign, identityToken]);

  // Load shared profile photos for the callsigns visible in the community chat.
  const profileCallsignKey = Array.from(new Set(messages.map((message) => message.callsign.trim().toUpperCase()).filter(Boolean))).join('|');
  useEffect(() => {
    if (!supabase || !profileCallsignKey) {
      setProfilePhotos({});
      return;
    }
    let active = true;
    const loadProfilePhotos = async () => {
      const requested = profileCallsignKey.split('|');
      const { data, error: photoError } = await supabase.rpc('community_profile_photos', { p_callsigns: requested });
      if (!active || photoError) return;
      const next: Record<string, string> = {};
      (data || []).forEach((row: { callsign: string; photo_data_url: string }) => {
        if (row?.callsign && row?.photo_data_url) next[String(row.callsign).trim().toUpperCase()] = row.photo_data_url;
      });
      setProfilePhotos(next);
    };
    void loadProfilePhotos();
    const refreshId = window.setInterval(() => { void loadProfilePhotos(); }, 30000);
    const refreshOnProfileChange = () => { void loadProfilePhotos(); };
    window.addEventListener('user-profile-updated', refreshOnProfileChange);
    return () => {
      active = false;
      window.clearInterval(refreshId);
      window.removeEventListener('user-profile-updated', refreshOnProfileChange);
    };
  }, [profileCallsignKey]);

  // Translate messages only for display; the original text remains stored in Supabase.
  // The selected app language is per-device, so each visitor sees their own translation.
  useEffect(() => {
    const syncLanguage = () => setAppLanguage((localStorage.getItem('app_language') || 'es').toLowerCase());
    window.addEventListener('user-profile-updated', syncLanguage);
    window.addEventListener('storage', syncLanguage);
    return () => {
      window.removeEventListener('user-profile-updated', syncLanguage);
      window.removeEventListener('storage', syncLanguage);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const targetLanguage = appLanguage || 'es';
    const recentMessages = messages.slice(-30);
    const translateMessages = async () => {
      for (const message of recentMessages) {
        const key = targetLanguage + ':' + message.id;
        if (translatedBodies[key] || translationPending.current.has(key) || !message.body.trim()) continue;
        translationPending.current.add(key);
        try {
          const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLanguage) + '&dt=t&q=' + encodeURIComponent(message.body);
          const response = await fetch(url);
          if (!response.ok) continue;
          const result = await response.json();
          const translated = Array.isArray(result?.[0]) ? result[0].map((part: any) => typeof part?.[0] === 'string' ? part[0] : '').join('') : '';
          if (active && translated.trim()) setTranslatedBodies((current) => ({ ...current, [key]: translated }));
        } catch {
          // If translation is unavailable, leave the original message visible.
        } finally {
          translationPending.current.delete(key);
        }
      }
    };
    void translateMessages();
    return () => { active = false; };
  }, [messages, appLanguage]);

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
      if (data.message) setMessages((current) => current.some((item) => item.id === data.message.id) ? current : [...current, data.message as ChatMessage].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-100));
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

  const callModerationAction = async (action: string, targetCallsign?: string, sanctionType?: string, durationMinutes?: number, reason?: string) => {
    const actorCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!supabase || !isModerator || !actorCallsign) {
      setError('No se verificaron los permisos de moderación de este dispositivo.');
      return null;
    }
    const { data, error: actionError } = await supabase.rpc('community_moderation_action', {
      p_callsign: actorCallsign,
      p_token: identityToken,
      p_action: action,
      p_target_callsign: targetCallsign || null,
      p_sanction_type: sanctionType || null,
      p_duration_minutes: durationMinutes ?? null,
      p_reason: reason || null,
    });
    if (actionError || !data?.ok) {
      console.error('[LogBook chat] moderation action failed:', actionError || data);
      const reasonCode = data?.reason;
      setError(reasonCode === 'forbidden'
        ? 'Supabase rechazó la acción: el indicativo y el token de este dispositivo no tienen ese privilegio.'
        : reasonCode === 'invalid_target'
          ? 'El indicativo de destino no está registrado o no puede moderarse.'
          : reasonCode === 'not_found'
            ? 'El registro que intentaste modificar ya no existe o ya fue revertido.'
            : 'La acción de moderación falló. Revisá la migración de moderación en Supabase.');
      return null;
    }
    return data;
  };

  const applySanction = async (targetCallsign: string, sanctionType: 'silence' | 'block', durationMinutes?: number) => {
    const target = targetCallsign.trim().toUpperCase();
    const actorCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!target || target === actorCallsign || moderationBusy) return;
    const durationLabel = durationMinutes === 5 ? '5 minutos' : durationMinutes === 60 ? '1 hora' : durationMinutes === 10080 ? '7 días' : '';
    const actionLabel = sanctionType === 'block' ? 'bloquear permanentemente' : `silenciar durante ${durationLabel}`;
    if (!window.confirm(`¿Querés ${actionLabel} a ${target}?`)) return;
    setModerationBusy(true);
    setModerationTarget(target);
    setError('');
    try {
      const result = await callModerationAction(sanctionType, target, sanctionType, durationMinutes, 'Moderación desde el chat');
      if (!result) return;
      setNotice(sanctionType === 'block' ? `${target} quedó bloqueado para enviar mensajes.` : `${target} quedó silenciado durante ${durationLabel}.`);
      if (isAdmin && adminPanelOpen) await loadAdminData('list_sanctions');
    } finally {
      setModerationBusy(false);
      setModerationTarget(null);
    }
  };

  const loadAdminData = async (kind: 'list_sanctions' | 'list_audit') => {
    if (!isAdmin) {
      setError('Solo LU1TSB, como administrador, puede consultar estos registros.');
      return;
    }
    setModerationBusy(true);
    setError('');
    try {
      const result = await callModerationAction(kind);
      if (!result) return;
      if (kind === 'list_sanctions') setAdminSanctions(Array.isArray(result.sanctions) ? result.sanctions : []);
      else setAdminAudit(Array.isArray(result.audit) ? result.audit : []);
      setNotice(kind === 'list_sanctions' ? 'Listado de sanciones actualizado.' : 'Auditoría actualizada.');
    } finally {
      setModerationBusy(false);
    }
  };

  const appointModerator = async (selectedCallsign?: string) => {
    const target = (selectedCallsign || moderatorCandidate).trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (!isAdmin || target.length < 3 || target === 'LU1TSB' || moderationBusy) {
      setError('Ingresá un indicativo válido distinto de LU1TSB.');
      return;
    }
    if (!window.confirm(`¿Dar privilegios de moderador a ${target}? Podrá borrar mensajes, silenciar y bloquear.`)) return;
    setModerationBusy(true);
    setError('');
    try {
      const result = await callModerationAction('appoint_moderator', target);
      if (!result) return;
      setModeratorCandidate('');
      setModeratorTargetSelected(null);
      setAdminNotice(`${target} ahora tiene rol de moderador.`);
    } finally {
      setModerationBusy(false);
    }
  };

  const reverseSanction = async (sanction: any) => {
    if (!isAdmin || moderationBusy || !sanction?.id) return;
    if (!window.confirm(`¿Levantar la sanción aplicada a ${sanction.target_callsign}?`)) return;
    setModerationBusy(true);
    setError('');
    try {
      const result = await callModerationAction('reverse_sanction', sanction.target_callsign, undefined, undefined, sanction.id);
      if (!result) return;
      setAdminSanctions((current) => current.map((item) => item.id === sanction.id ? { ...item, active: false, reversed_at: new Date().toISOString(), reversed_by: 'LU1TSB' } : item));
      setNotice(`Sanción de ${sanction.target_callsign} levantada.`);
    } finally {
      setModerationBusy(false);
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
    <section ref={chatSectionRef} id="community-chat" className={`mb-6 scroll-mt-2 overflow-hidden rounded-2xl border border-sky-900/70 shadow-xl ${darkChat ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900'}`} aria-label="Chat de la comunidad">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300"><MessageCircle className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="font-bold leading-tight">CHAT eQSL EXPRESS</h2>
            <p className="mt-1 text-xs font-semibold leading-snug text-sky-200">ESCRIBE EN TU IDIOMA · TRADUCCIÓN AUTOMÁTICA</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300" aria-live="polite"><span className="h-2 w-2 rounded-full bg-emerald-400" />{onlineUsers.length} {onlineUsers.length === 1 ? 'usuario en línea' : 'usuarios en línea'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1"><button type="button" onClick={toggleChatTheme} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label={darkChat ? "Cambiar a fondo claro" : "Cambiar a fondo oscuro"} title={darkChat ? "Fondo claro" : "Fondo oscuro"}>{darkChat ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button><button type="button" onClick={toggleCommunityChat} className="rounded-lg p-2 text-slate-100 hover:bg-slate-800" aria-label={chatCollapsed ? "Desplegar chat comunitario" : "Replegar chat comunitario"} title={chatCollapsed ? "Desplegar chat" : "Replegar chat"} aria-expanded={!chatCollapsed}>{chatCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}</button></div>
      </div>
      {!chatCollapsed && <>
      {isAdmin && <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">
        <button type="button" onClick={() => setAdminPanelOpen((open) => !open)} className="font-bold underline underline-offset-2">Herramientas del administrador LU1TSB {adminPanelOpen ? '−' : '+'}</button>
        {adminPanelOpen && <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={moderationBusy} onClick={() => void loadAdminData('list_sanctions')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Ver sanciones</button>
            <button type="button" disabled={moderationBusy} onClick={() => void loadAdminData('list_audit')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Ver auditoría</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={moderatorCandidate} onChange={(e) => setModeratorCandidate(e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))} maxLength={24} placeholder="Indicativo para nombrar moderador" className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900" />
            <button type="button" disabled={moderationBusy || moderatorCandidate.trim().length < 3} onClick={() => void appointModerator()} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Nombrar</button>
          </div>
          {adminSanctions.length > 0 && <div className="space-y-2"><p className="font-bold">Sanciones</p>{adminSanctions.map((sanction) => <div key={sanction.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-2 text-xs"><span><strong>{sanction.target_callsign}</strong> · {sanction.sanction_type} · {sanction.active ? 'activa' : 'levantada'}{sanction.expires_at ? ` · hasta ${new Date(sanction.expires_at).toLocaleString()}` : ''}</span>{sanction.active && <button type="button" disabled={moderationBusy} onClick={() => void reverseSanction(sanction)} className="rounded border border-amber-300 px-2 py-1 font-semibold disabled:opacity-50">Levantar</button>}</div>)}</div>}
          {adminAudit.length > 0 && <div className="space-y-1"><p className="font-bold">Auditoría reciente</p>{adminAudit.slice(0, 20).map((entry) => <p key={entry.id} className="rounded bg-white px-2 py-1 text-xs">{new Date(entry.created_at).toLocaleString()} · {entry.actor_callsign} · {entry.action}{entry.target_callsign ? ` · ${entry.target_callsign}` : ''}</p>)}</div>}
        </div>}
      </div>}
      {!supabase ? (
        <div className="space-y-2 bg-amber-50 px-4 py-5 text-sm text-amber-950 sm:px-5">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" /> Chat pendiente de conexión</p>
          <p>El servicio del chat todavía no está configurado. Revisá las variables públicas de Supabase en Vercel.</p>
        </div>
      ) : (
        <>
          <article className={`border-b-2 border-sky-500 px-4 py-4 shadow-sm ${darkChat ? "bg-slate-900 text-slate-100" : "bg-sky-50 text-slate-950"}`} aria-label="Mensaje de bienvenida fijado">
            <div className="flex items-start gap-3">
              <strong className="shrink-0 pt-0.5 font-mono text-sm font-extrabold uppercase text-red-600">LU1TSB</strong>
              <p className="text-sm font-semibold leading-relaxed">Bienvenidos al espacio de la comunidad LogBook eQSL EXPRESS.</p>
            </div>
          </article>
          <div ref={messagesContainerRef} className={`max-h-[min(48vh,420px)] min-h-[180px] space-y-1.5 overflow-y-auto scroll-smooth px-3 py-2 sm:px-4 ${darkChat ? "bg-black text-white" : "bg-white text-slate-950"}`} aria-live="polite">
            {messages.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Todavía no hay mensajes. ¡Podés iniciar la conversación!</p>}
            {messages.map((message) => (
              <article key={message.id} className={`rounded-lg border px-2.5 py-1 hover:border-sky-200 ${darkChat ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-100 bg-white text-slate-950"}`}>
                <div className="flex items-start gap-2.5">
                  <div role="button" tabIndex={0} onClick={() => openPrivateMessage(message.callsign)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openPrivateMessage(message.callsign); } }} className="mt-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-100 hover:ring-2 hover:ring-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400" aria-label={`Abrir mensaje privado a ${message.callsign}`} title={`Abrir mensaje privado a ${message.callsign}`}>
                    {profilePhotos[message.callsign.trim().toUpperCase()] ? <img src={profilePhotos[message.callsign.trim().toUpperCase()]} alt={`Foto de perfil de ${message.callsign}`} className="h-full w-full object-cover" /> : <span className="font-mono text-xs font-bold text-slate-500">{message.callsign.trim().slice(0, 3).toUpperCase()}</span>}
                  </div>
                  <div className="min-w-0 flex-1">
                {message.reply_to_callsign && <p className="mb-1 text-xs text-slate-500"><Reply className="mr-1 inline h-3 w-3" />Respuesta a {message.reply_to_callsign}</p>}
                <p className="break-words text-sm leading-[1.35]"><strong className={`font-mono font-extrabold uppercase ${["LU1TSB","LU1TSB/4RC978","RC978","4RC978"].includes(message.callsign.trim().toUpperCase()) ? "text-red-600" : darkChat ? "text-white" : "text-slate-950"}`}><button type="button" onClick={() => openPrivateMessage(message.callsign)} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-sky-500" title={`Escribir mensaje privado a ${message.callsign}`}>{message.callsign}</button>:</strong><span className="ml-1" aria-label="Bandera del país" title="País estimado por prefijo de indicativo">{callsignCountryFlag(message.callsign)}</span>{isAdmin && message.callsign.trim().toUpperCase() !== 'LU1TSB' && <button type="button" onClick={() => setModeratorTargetSelected((current) => current === message.callsign.trim().toUpperCase() ? null : message.callsign.trim().toUpperCase())} className="ml-1 inline-flex rounded p-0.5 text-amber-600 hover:bg-amber-100" title="Opciones de administrador para este usuario" aria-label={`Opciones de administrador para ${message.callsign}`}><ShieldCheck className="h-3 w-3" /></button>} <span className={darkChat ? "text-white" : "text-slate-800"}>{translatedBodies[appLanguage + ':' + message.id] || message.body}{translatedBodies[appLanguage + ':' + message.id] && translatedBodies[appLanguage + ':' + message.id] !== message.body && <span className="ml-1 align-super text-[9px] text-sky-500" title="Traducción automática según el idioma de tu aplicación">trad.</span>}</span>
                {isAdmin && moderatorTargetSelected === message.callsign.trim().toUpperCase() && message.callsign.trim().toUpperCase() !== 'LU1TSB' && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                  <span>Usuario: <strong>{message.callsign}</strong></span>
                  <button type="button" disabled={moderationBusy} onClick={() => void appointModerator(message.callsign)} className="rounded-md bg-amber-800 px-3 py-1.5 font-bold text-white disabled:opacity-50">{moderationBusy ? 'Procesando…' : 'Designar como moderador'}</button>
                  <button type="button" onClick={() => setModeratorTargetSelected(null)} className="rounded-md px-2 py-1.5 font-semibold underline">Cancelar</button>
                </div>}</p>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString()}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setReplyTo(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Reply className="h-3 w-3" /> Responder</button>
                    {isModerator && <button type="button" disabled={deletingId === message.id} onClick={() => void deleteMessage(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Eliminar mensaje de ${message.callsign}`}><Trash2 className="h-3 w-3" /> {deletingId === message.id ? 'Eliminando…' : 'Borrar'}</button>}
                    {isModerator && message.callsign.trim().toUpperCase() !== (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase() && <div className="flex flex-wrap gap-1">
                      <button type="button" disabled={moderationBusy} onClick={() => void applySanction(message.callsign, 'silence', 5)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50" title="Silenciar 5 minutos">Silenciar 5m</button>
                      <button type="button" disabled={moderationBusy} onClick={() => void applySanction(message.callsign, 'silence', 60)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50" title="Silenciar 1 hora">1h</button>
                      <button type="button" disabled={moderationBusy} onClick={() => void applySanction(message.callsign, 'silence', 10080)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50" title="Silenciar 7 días">7d</button>
                      <button type="button" disabled={moderationBusy || moderationTarget === message.callsign} onClick={() => void applySanction(message.callsign, 'block')} className="rounded-md px-2 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50" title="Bloquear el envío de mensajes">Bloquear</button>
                    </div>}
                  </div>
                </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {replyTo && <div className="flex items-center justify-between border-t border-slate-200 bg-sky-50 px-4 py-2 text-xs text-slate-700"><span>Respondiendo a <strong>{replyTo.callsign}</strong></span><button type="button" onClick={() => setReplyTo(null)} className="font-semibold underline">Cancelar</button></div>}
          <div className={`border-t p-3 sm:p-4 ${darkChat ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
            {!callsign && (
              <p className={`mb-3 rounded-xl border p-3 text-xs ${darkChat ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}>
                Tu señal distintiva se valida una sola vez al instalar e ingresar a LogBook eQSL EXPRESS. Si no aparece aquí, recargá la aplicación para sincronizar tu identidad.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} maxLength={500} placeholder="Escribí un mensaje…" className={`min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 ${darkChat ? "border-slate-600 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900"}`} />
              <button type="button" onClick={() => void sendMessage()} disabled={busy || !draft.trim() || callsign.trim().length < 3} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button>
            </div>
          </div>
        </>
      )}
      {(notice || error) && <div role={error ? 'alert' : 'status'} className={`border-t px-4 py-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{error || notice}</div>}
      {isAdmin && adminNotice && <div role="status" className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{adminNotice}</div>}


      <div className={`flex justify-end border-t px-4 py-3 sm:px-5 ${darkChat ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
        <button type="button" onClick={() => setChatCollapsed(true)} className="inline-flex items-center gap-2 rounded-lg border border-sky-500 bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label="Cerrar chat comunitario">
          Cerrar chat
        </button>
      </div>
      {supabase && <div className={`border-t px-4 py-3 sm:px-5 ${darkChat ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`} aria-label="Indicativos en línea">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className={`text-xs font-bold ${darkChat ? 'text-slate-100' : 'text-slate-700'}`}>Indicativos en línea</h3>
          <span className={`text-[10px] ${darkChat ? 'text-slate-300' : 'text-slate-500'}`}>{onlineUsers.length}</span>
        </div>
        {onlineUsers.length > 0 ? <ul className="flex flex-wrap gap-2">
          {onlineUsers.map((user) => <li key={user.identityToken || user.callsign}><button type="button" onClick={() => openPrivateMessage(user.callsign)} aria-label={`Escribir mensaje privado a ${user.callsign}`} title={`Escribir mensaje privado a ${user.callsign}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-semibold transition hover:border-sky-400 hover:ring-2 hover:ring-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400 ${darkChat ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}><span aria-label="Bandera del país" title="País estimado por prefijo de indicativo">{callsignCountryFlag(user.callsign)}</span>{user.callsign}</button></li>)}
        </ul> : <p className={`text-xs ${darkChat ? 'text-slate-300' : 'text-slate-500'}`}>No hay indicativos conectados en este momento.</p>}
      </div>}
      </>}
    </section>
  );
};
