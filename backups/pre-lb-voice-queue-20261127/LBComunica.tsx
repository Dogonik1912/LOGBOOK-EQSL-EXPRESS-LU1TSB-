import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Mic, Users, Wifi, X, Volume2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type RoomParticipant = { callsign: string; status?: string; joinedAt?: string };
type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error';
type SignalPayload = {
  from: string; to: string; callsign: string; sessionId: string;
  kind: 'offer' | 'answer' | 'ice' | 'stop';
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit;
};
type PeerEntry = { pc: RTCPeerConnection; audio: HTMLAudioElement };

const readActiveCallsign = () => (
  localStorage.getItem('community_chat_active_callsign')
  || localStorage.getItem('community_chat_sd')
  || ''
).trim().toUpperCase();

export const LBComunica: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCallsign, setActiveCallsign] = useState(readActiveCallsign);
  const [identityToken, setIdentityToken] = useState('');
  const [participants, setParticipants] = useState<RoomParticipant[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('idle');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [pttMode, setPttMode] = useState<'hold' | 'toggle'>('hold');
  const [showConsent, setShowConsent] = useState(false);
  const [pttError, setPttError] = useState('');
  const [remoteTalkers, setRemoteTalkers] = useState<string[]>([]);
  const channelRef = useRef<any>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const peerMapRef = useRef<Map<string, PeerEntry>>(new Map());
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const sessionRef = useRef('');

  useEffect(() => {
    const updateIdentity = (event?: Event) => {
      const eventCallsign = event instanceof CustomEvent
        ? String((event.detail as { callsign?: string } | undefined)?.callsign || '')
        : '';
      setActiveCallsign((eventCallsign || readActiveCallsign()).trim().toUpperCase());
    };
    window.addEventListener('community-active-identity-changed', updateIdentity);
    window.addEventListener('community-account-identities-loaded', updateIdentity);
    window.addEventListener('user-profile-updated', updateIdentity);
    window.addEventListener('storage', updateIdentity);
    return () => {
      window.removeEventListener('community-active-identity-changed', updateIdentity);
      window.removeEventListener('community-account-identities-loaded', updateIdentity);
      window.removeEventListener('user-profile-updated', updateIdentity);
      window.removeEventListener('storage', updateIdentity);
    };
  }, []);

  const isElevenMeters = useMemo(() => is11MeterStationIdentifier(activeCallsign), [activeCallsign]);
  const roomKey = isElevenMeters ? '11m' : 'ham';
  const roomTitle = isElevenMeters ? '11 METROS' : 'RADIOAFICIONADOS';

  const sendSignal = async (payload: SignalPayload) => {
    const channel = channelRef.current;
    if (channel) await channel.send({ type: 'broadcast', event: 'signal', payload });
  };

  const closePeer = (key: string) => {
    const entry = peerMapRef.current.get(key);
    if (!entry) return;
    entry.pc.ontrack = null;
    entry.pc.onicecandidate = null;
    entry.pc.close();
    entry.audio.pause();
    entry.audio.srcObject = null;
    peerMapRef.current.delete(key);
    pendingIceRef.current.delete(key);
  };

  const closeAllPeers = () => {
    Array.from(peerMapRef.current.keys()).forEach(closePeer);
    setRemoteTalkers([]);
  };

  const createPeer = (peerId: string, sessionId: string, callsign: string) => {
    const key = peerId + ':' + sessionId;
    const existing = peerMapRef.current.get(key);
    if (existing) return existing.pc;
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });
    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = 1;
    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      void audio.play().catch(() => setPttError('Toca la pantalla para permitir la reproducción del audio recibido.'));
      setRemoteTalkers((current) => current.includes(callsign) ? current : [...current, callsign]);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendSignal({
          from: identityToken, to: peerId, callsign: activeCallsign,
          sessionId, kind: 'ice', candidate: event.candidate.toJSON(),
        });
      }
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) {
        closePeer(key);
        setRemoteTalkers((current) => current.filter((call) => call !== callsign));
      }
    };
    peerMapRef.current.set(key, { pc, audio });
    return pc;
  };

  const acceptSignal = async (payload: SignalPayload) => {
    if (payload.to !== identityToken || payload.from === identityToken) return;
    const key = payload.from + ':' + payload.sessionId;
    try {
      if (payload.kind === 'stop') {
        closePeer(key);
        setRemoteTalkers((current) => current.filter((call) => call !== payload.callsign));
        return;
      }
      if (payload.kind === 'offer' && payload.description) {
        const pc = createPeer(payload.from, payload.sessionId, payload.callsign);
        await pc.setRemoteDescription(payload.description);
        const queued = pendingIceRef.current.get(key) || [];
        for (const candidate of queued) await pc.addIceCandidate(candidate);
        pendingIceRef.current.delete(key);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal({
          from: identityToken, to: payload.from, callsign: activeCallsign,
          sessionId: payload.sessionId, kind: 'answer', description: pc.localDescription?.toJSON(),
        });
      } else if (payload.kind === 'answer' && payload.description) {
        const pc = peerMapRef.current.get(key)?.pc;
        if (!pc) return;
        await pc.setRemoteDescription(payload.description);
        const queued = pendingIceRef.current.get(key) || [];
        for (const candidate of queued) await pc.addIceCandidate(candidate);
        pendingIceRef.current.delete(key);
      } else if (payload.kind === 'ice' && payload.candidate) {
        const pc = peerMapRef.current.get(key)?.pc;
        if (pc?.remoteDescription) await pc.addIceCandidate(payload.candidate);
        else pendingIceRef.current.set(key, [...(pendingIceRef.current.get(key) || []), payload.candidate]);
      }
    } catch (error) {
      console.error('LB COMUNICACION señal WebRTC:', error);
      setPttError('No se pudo establecer el audio con ' + payload.callsign + '.');
    }
  };

  const openRoom = () => {
    const currentIdentity = readActiveCallsign() || activeCallsign;
    if (currentIdentity) setActiveCallsign(currentIdentity);
    let token = localStorage.getItem('community_chat_identity_token') || '';
    if (!token) {
      token = crypto.randomUUID();
      localStorage.setItem('community_chat_identity_token', token);
    }
    setIdentityToken(token);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!isOpen) return;
    if (!activeCallsign || !identityToken || !supabase) {
      setConnection('error');
      return;
    }
    const client = supabase;
    let mounted = true;
    setConnection('connecting');
    setParticipants([]);
    const channel = client.channel('lb-comunica:' + roomKey, {
      config: { presence: { key: identityToken }, broadcast: { self: false } },
    });
    channelRef.current = channel;
    channel
      .on('presence', { event: 'sync' }, () => {
        if (!mounted) return;
        const state = channel.presenceState<RoomParticipant>();
        const all = Object.values(state).flat();
        const unique = new Map<string, RoomParticipant>();
        all.forEach((person) => {
          const call = String(person.callsign || '').trim().toUpperCase();
          if (call) unique.set(call, { ...person, callsign: call });
        });
        setParticipants(Array.from(unique.values()).sort((a, b) => a.callsign.localeCompare(b.callsign)));
      })
      .on('broadcast', { event: 'signal' }, ({ payload }: { payload: SignalPayload }) => {
        if (mounted) void acceptSignal(payload);
      })
      .subscribe(async (status) => {
        if (!mounted) return;
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({ callsign: activeCallsign, status: 'Escuchando', joinedAt: new Date().toISOString() });
            if (mounted) setConnection('connected');
          } catch { if (mounted) setConnection('error'); }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnection('error');
        }
      });
    return () => {
      mounted = false;
      channelRef.current = null;
      void channel.untrack();
      void client.removeChannel(channel);
      closeAllPeers();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, [isOpen, activeCallsign, identityToken, roomKey]);

  const startTalking = async () => {
    if (isTalking || connection !== 'connected') return;
    setPttError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      localStreamRef.current = stream;
      const sessionId = crypto.randomUUID();
      sessionRef.current = sessionId;
      const state = channelRef.current?.presenceState?.() || {};
      const peers = Object.entries(state) as Array<[string, RoomParticipant[]]>;
      for (const [peerId, values] of peers) {
        if (peerId === identityToken) continue;
        const peer = values?.[0];
        if (!peer?.callsign) continue;
        const pc = createPeer(peerId, sessionId, peer.callsign);
        stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          from: identityToken, to: peerId, callsign: activeCallsign,
          sessionId, kind: 'offer', description: pc.localDescription?.toJSON(),
        });
      }
      setIsTalking(true);
      await channelRef.current?.track({
        callsign: activeCallsign, status: 'Transmitiendo', joinedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('LB COMUNICACION PTT:', error);
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setIsTalking(false);
      setPttError(error instanceof DOMException && error.name === 'NotAllowedError'
        ? 'No diste permiso para usar el micrófono. Habilítalo en el navegador.'
        : 'No se pudo iniciar el micrófono. Comprueba los permisos y la conexión.');
    }
  };

  const stopTalking = async () => {
    if (!isTalking) return;
    const sessionId = sessionRef.current;
    const state = channelRef.current?.presenceState?.() || {};
    for (const [peerId] of Object.entries(state)) {
      if (peerId !== identityToken) {
        await sendSignal({
          from: identityToken, to: peerId, callsign: activeCallsign,
          sessionId, kind: 'stop',
        });
      }
    }
    Array.from(peerMapRef.current.keys())
      .filter((key) => key.endsWith(':' + sessionId))
      .forEach(closePeer);
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    setIsTalking(false);
    await channelRef.current?.track({
      callsign: activeCallsign, status: 'Escuchando', joinedAt: new Date().toISOString(),
    });
  };

  const requestPtt = () => {
    const accepted = localStorage.getItem('lb_comunica_ptt_consent_' + activeCallsign) === 'accepted';
    if (!accepted) setShowConsent(true);
    else if (pttMode === 'toggle' && isTalking) void stopTalking();
    else void startTalking();
  };

  const acceptConsent = () => {
    localStorage.setItem('lb_comunica_ptt_consent_' + activeCallsign, 'accepted');
    setShowConsent(false);
    void startTalking();
  };

  const closeRoom = () => {
    void stopTalking();
    setIsOpen(false);
    setConnection('idle');
    setParticipants([]);
  };

  return (
    <>
      <button type="button" onClick={openRoom}
        className="mb-3 flex min-h-11 w-full flex-col items-center justify-center rounded-lg border border-emerald-300 bg-gradient-to-r from-emerald-950 via-teal-900 to-cyan-900 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:text-sm"
        aria-label="LB COMUNICACION, pulsa y habla">
        <span className="inline-flex items-center gap-2"><Headphones className="h-5 w-5 shrink-0" />LB COMUNICACION</span>
        <span className="mt-0.5 text-xs font-semibold sm:text-sm">pulsa y habla</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="lb-comunica-title">
          <section className="flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-emerald-400/40 bg-slate-950 text-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div><h2 id="lb-comunica-title" className="text-base font-bold tracking-wide">LB COMUNICACION</h2><p className="text-xs font-semibold text-emerald-300">Sala {roomTitle}</p></div>
              <button type="button" onClick={closeRoom} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Salir de la sala"><X className="h-5 w-5" /></button>
            </header>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-emerald-300" />Usuarios conectados</div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-bold text-emerald-300">{connection === 'connected' ? participants.length : '—'}</span>
            </div>
            {!activeCallsign ? (
              <div className="p-6 text-center"><p className="font-semibold">Primero debes validar tu SD o indicativo en el chat general.</p></div>
            ) : (
              <div className="grid min-h-0 gap-4 p-4 md:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)]">
                <aside className="min-w-0">
                  <button type="button" onClick={() => setMobileListOpen((v) => !v)} className="mb-2 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold md:hidden">Usuarios de la sala <span className="text-emerald-300">{participants.length}</span></button>
                  <div className={mobileListOpen ? 'block' : 'hidden md:block'}>
                    <h3 className="mb-2 hidden text-sm font-semibold text-slate-300 md:block">Participantes</h3>
                    <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/70 p-2 md:max-h-[52vh]">
                      {participants.length ? participants.map((person) => (
                        <div key={person.callsign} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm">
                          <span className="truncate"><span className="mr-2">{flagForCallsign(person.callsign, undefined, is11MeterStationIdentifier(person.callsign))}</span><b>{person.callsign}</b></span>
                          <span className={person.status === 'Transmitiendo' ? 'text-xs font-bold text-red-300' : 'text-xs text-slate-400'}>{person.status || 'Escuchando'}</span>
                        </div>
                      )) : <p className="px-2 py-4 text-center text-sm text-slate-400">{connection === 'connected' ? 'Todavía no hay participantes.' : 'Conectando con la sala…'}</p>}
                    </div>
                  </div>
                </aside>
                <div className="flex min-w-0 flex-col items-center justify-center gap-4 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center">
                  <div className="flex items-center gap-2 text-sm"><Wifi className={connection === 'connected' ? 'h-4 w-4 text-emerald-300' : 'h-4 w-4 text-amber-300'} /><span>{connection === 'connected' ? 'Conectado a la sala' : connection === 'connecting' ? 'Conectando…' : 'Sin conexión con la sala'}</span></div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs text-slate-400">Modo PTT</span>
                    <button type="button" onClick={() => { setPttMode((m) => m === 'hold' ? 'toggle' : 'hold'); if (isTalking) void stopTalking(); }} className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold">{pttMode === 'hold' ? 'Mantener pulsado' : 'Pulsar para activar/desactivar'}</button>
                  </div>
                  <button type="button" disabled={connection !== 'connected'}
                    onPointerDown={pttMode === 'hold' ? (e) => { e.preventDefault(); if (!showConsent) { const ok = localStorage.getItem('lb_comunica_ptt_consent_' + activeCallsign) === 'accepted'; if (!ok) setShowConsent(true); else void startTalking(); } } : undefined}
                    onPointerUp={pttMode === 'hold' ? () => void stopTalking() : undefined}
                    onPointerLeave={pttMode === 'hold' ? () => void stopTalking() : undefined}
                    onPointerCancel={pttMode === 'hold' ? () => void stopTalking() : undefined}
                    onClick={pttMode === 'toggle' ? requestPtt : undefined}
                    className={'flex h-36 w-36 select-none touch-none flex-col items-center justify-center rounded-full border-4 shadow-inner transition ' + (isTalking ? 'border-red-300 bg-red-700 text-white' : 'border-emerald-400 bg-emerald-950 text-emerald-100') + ' disabled:cursor-not-allowed disabled:opacity-40'}>
                    <Mic className="mb-2 h-9 w-9" /><span className="text-xs font-extrabold">{isTalking ? 'EN EL AIRE' : 'PULSA Y HABLA'}</span>
                  </button>
                  <div className="flex items-center gap-2 text-xs text-slate-300"><Volume2 className="h-4 w-4" />{remoteTalkers.length ? 'Recibiendo: ' + remoteTalkers.join(', ') : 'Esperando transmisión'}</div>
                  {pttError && <p role="alert" className="max-w-md text-sm text-amber-200">{pttError}</p>}
                  <p className="max-w-md text-xs text-slate-400">El audio se transmite directamente entre los dispositivos mediante WebRTC. Para redes con NAT restrictivo podría ser necesario un servidor TURN.</p>
                </div>
              </div>
            )}
            <footer className="border-t border-white/10 px-4 py-3 text-center text-xs text-slate-400">Tu identidad activa determina la sala. HAM y 11 metros permanecen separados.</footer>
          </section>
        </div>
      )}
      {showConsent && isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="lb-ptt-consent-title">
          <div className="w-full max-w-md rounded-xl border border-emerald-400/40 bg-slate-900 p-5 text-white">
            <h3 id="lb-ptt-consent-title" className="text-lg font-bold">Activar PTT</h3>
            <p className="mt-3 text-sm text-slate-200">Al aceptar, autorizas el uso del micrófono y aceptas que, cuando el historial de audio esté habilitado, tus intervenciones puedan conservarse en el archivo de esta sala según la política de conservación de LogBook. El archivo todavía no está activo.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setShowConsent(false)} className="rounded-lg border border-white/20 px-4 py-2 text-sm">Cancelar</button>
              <button type="button" onClick={acceptConsent} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold">Acepto y activo PTT</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
