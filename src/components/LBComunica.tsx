import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Mic, Users, Wifi, X, Volume2, Play, ListMusic, Clock3 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type Participant = { callsign: string; status?: string; joinedAt?: string };
type Signal = {
  from: string; to: string; callsign: string; sessionId: string;
  kind: 'offer' | 'answer' | 'ice' | 'stop';
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit;
};
type PeerEntry = { pc: RTCPeerConnection; audio: HTMLAudioElement };
type Recording = { id: string; callsign: string; duration_ms: number; mime_type: string; created_at: string; url: string };
type QueueState = { ok: boolean; status?: 'transmitting' | 'queued' | 'listening'; active_callsign?: string | null; active_until?: string | null; queue_position?: number; queue?: { callsign: string }[]; reason?: string };

const readCallsign = () => (
  localStorage.getItem('community_chat_active_callsign')
  || localStorage.getItem('community_chat_sd')
  || ''
).trim().toUpperCase();

const identityTokenForDevice = () => {
  let token = localStorage.getItem('community_chat_identity_token') || '';
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('community_chat_identity_token', token);
  }
  return token;
};

export const LBComunica: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCallsign, setActiveCallsign] = useState(readCallsign);
  const [deviceToken, setDeviceToken] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connection, setConnection] = useState<'idle'|'connecting'|'connected'|'error'>('idle');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [queuePosition, setQueuePosition] = useState(0);
  const [activeSpeaker, setActiveSpeaker] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [pttMode, setPttMode] = useState<'hold'|'toggle'>('hold');
  const [showConsent, setShowConsent] = useState(false);
  const [pttError, setPttError] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [remoteTalkers, setRemoteTalkers] = useState<string[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [playAll, setPlayAll] = useState(false);
  const channelRef = useRef<any>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const peerMapRef = useRef<Map<string,PeerEntry>>(new Map());
  const pendingIceRef = useRef<Map<string,RTCIceCandidateInit[]>>(new Map());
  const sessionRef = useRef('');
  const talkingRef = useRef(false);
  const beginningRef = useRef(false);
  const turnCancelledRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement|null>(null);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);

  const isElevenMeters = useMemo(() => is11MeterStationIdentifier(activeCallsign), [activeCallsign]);
  const room = isElevenMeters ? '11m' : 'ham';
  const roomTitle = isElevenMeters ? '11 METROS' : 'RADIOAFICIONADOS';

  const api = async (action: string, extra: Record<string,unknown> = {}) => {
    if (!supabase) throw new Error('Supabase no está configurado.');
    const { data, error } = await supabase.functions.invoke('lb-voice', {
      body: { action, callsign: activeCallsign, device_token: deviceToken, room, ...extra },
    });
    if (error) throw error;
    if (!data?.ok) throw new Error(data?.reason || 'No se pudo completar la operación.');
    return data;
  };

  const pushPreferenceKey = () => 'lb_comunica_push_' + room + '_' + deviceToken;
  const decodeVapidKey = (value: string) => {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  };
  const enablePush = async () => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      setPttError('Este navegador no admite notificaciones push.'); return;
    }
    setPushBusy(true); setPttError('');
    try {
      const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('No autorizaste las notificaciones en este dispositivo.');
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const keyData = await api('push_public_key');
      const subscription = existing || await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: decodeVapidKey(String(keyData.public_key)),
      });
      await api('push_subscribe', { subscription: subscription.toJSON() });
      localStorage.setItem(pushPreferenceKey(), '1');
      setPushEnabled(true);
    } catch (error) {
      setPttError(error instanceof Error ? error.message : 'No se pudieron activar los avisos.');
    } finally { setPushBusy(false); }
  };
  const disablePush = async () => {
    setPushBusy(true); setPttError('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api('push_unsubscribe', { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      localStorage.removeItem(pushPreferenceKey());
      setPushEnabled(false);
    } catch (error) {
      setPttError(error instanceof Error ? error.message : 'No se pudieron desactivar los avisos.');
    } finally { setPushBusy(false); }
  };

  const sendSignal = async (payload: Signal) => {
    if (channelRef.current) await channelRef.current.send({ type: 'broadcast', event: 'signal', payload });
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
    const old = peerMapRef.current.get(key);
    if (old) return old.pc;
    const pc = new RTCPeerConnection({ iceServers: iceServersRef.current });
    const audio = new Audio();
    audio.autoplay = true;
    audio.volume = 1;
    pc.ontrack = (event) => {
      audio.srcObject = event.streams[0] || new MediaStream([event.track]);
      void audio.play().catch(() => setPttError('Toca la pantalla para permitir la reproducción del audio recibido.'));
      setRemoteTalkers((current) => current.includes(callsign) ? current : [...current,callsign]);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal({
        from: deviceToken, to: peerId, callsign: activeCallsign, sessionId,
        kind: 'ice', candidate: event.candidate.toJSON(),
      });
    };
    pc.onconnectionstatechange = () => {
      if (['failed','closed','disconnected'].includes(pc.connectionState)) {
        closePeer(key);
        setRemoteTalkers((current) => current.filter((call) => call !== callsign));
      }
    };
    peerMapRef.current.set(key,{pc,audio});
    return pc;
  };

  const acceptSignal = async (payload: Signal) => {
    if (payload.to !== deviceToken || payload.from === deviceToken) return;
    const key = payload.from + ':' + payload.sessionId;
    try {
      if (payload.kind === 'stop') {
        closePeer(key);
        setRemoteTalkers((current) => current.filter((call) => call !== payload.callsign));
      } else if (payload.kind === 'offer' && payload.description) {
        const pc = createPeer(payload.from,payload.sessionId,payload.callsign);
        await pc.setRemoteDescription(payload.description);
        for (const candidate of pendingIceRef.current.get(key) || []) await pc.addIceCandidate(candidate);
        pendingIceRef.current.delete(key);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        await sendSignal({
          from: deviceToken,to: payload.from,callsign: activeCallsign,
          sessionId: payload.sessionId,kind: 'answer',description: pc.localDescription?.toJSON(),
        });
      } else if (payload.kind === 'answer' && payload.description) {
        const pc = peerMapRef.current.get(key)?.pc;
        if (!pc) return;
        await pc.setRemoteDescription(payload.description);
        for (const candidate of pendingIceRef.current.get(key) || []) await pc.addIceCandidate(candidate);
        pendingIceRef.current.delete(key);
      } else if (payload.kind === 'ice' && payload.candidate) {
        const pc = peerMapRef.current.get(key)?.pc;
        if (pc?.remoteDescription) await pc.addIceCandidate(payload.candidate);
        else pendingIceRef.current.set(key,[...(pendingIceRef.current.get(key)||[]),payload.candidate]);
      }
    } catch (error) {
      console.error('LB COMUNICACION señal:',error);
      setPttError('No se pudo establecer el audio con '+payload.callsign+'.');
    }
  };

  const loadArchive = async () => {
    try {
      const data = await api('list');
      setRecordings((data.recordings || []) as Recording[]);
    } catch (error) {
      setPttError(error instanceof Error ? error.message : 'No se pudo abrir el archivo de audio.');
    }
  };

  const uploadRecording = async (blob: Blob, duration: number) => {
    try {
      if (!blob.size || duration < 500) return;
      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      for (let i=0;i<bytes.length;i+=0x8000) binary += String.fromCharCode(...bytes.subarray(i,Math.min(i+0x8000,bytes.length)));
      const data = await api('upload',{
        audio_base64: btoa(binary),
        duration_ms: Math.min(30000,Math.round(duration)),
        mime_type: blob.type.split(';')[0] || 'audio/webm',
      });
      if (data.ok) await loadArchive();
    } catch (error) {
      console.error('LB COMUNICACION archivo:',error);
      setPttError('La voz se transmitió, pero no se pudo guardar en el historial: '+(error instanceof Error ? error.message : 'error'));
    }
  };

  const endLocalAudio = (save = true) => {
    turnCancelledRef.current = true;
    talkingRef.current = false;
    beginningRef.current = false;
    setIsTalking(false);
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current,{type:recorder.mimeType || 'audio/webm'});
        const duration = Date.now()-recordingStartedAtRef.current;
        recordedChunksRef.current = [];
        if (save) void uploadRecording(blob,duration);
      };
      recorder.stop();
    }
    const sessionId = sessionRef.current;
    Array.from(peerMapRef.current.keys()).filter((key)=>key.endsWith(':'+sessionId)).forEach(closePeer);
    streamRef.current?.getTracks().forEach((track)=>track.stop());
    streamRef.current = null;
  };

  const beginAudio = async () => {
    if (talkingRef.current || beginningRef.current || !channelRef.current) return;
    beginningRef.current = true;
    turnCancelledRef.current = false;
    setPttError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false,
      });
      if (turnCancelledRef.current) { stream.getTracks().forEach((track)=>track.stop()); beginningRef.current=false; return; }
      streamRef.current = stream;
      recordedChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      if (typeof MediaRecorder !== 'undefined') {
        const preferred = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find((mime)=>MediaRecorder.isTypeSupported(mime));
        const recorder = new MediaRecorder(stream,preferred ? {mimeType:preferred} : undefined);
        recorder.ondataavailable = (event) => { if (event.data.size) recordedChunksRef.current.push(event.data); };
        recorder.start(1000);
        recorderRef.current = recorder;
      }
      const sessionId = crypto.randomUUID();
      sessionRef.current = sessionId;
      const presence = channelRef.current.presenceState?.() || {};
      for (const [peerId,values] of Object.entries(presence) as Array<[string,Participant[]]>) {
        if (peerId===deviceToken) continue;
        const participant = values?.[0];
        if (!participant?.callsign) continue;
        const pc = createPeer(peerId,sessionId,participant.callsign);
        stream.getAudioTracks().forEach((track)=>pc.addTrack(track,stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          from:deviceToken,to:peerId,callsign:activeCallsign,sessionId,
          kind:'offer',description:pc.localDescription?.toJSON(),
        });
      }
      talkingRef.current = true;
      setIsTalking(true);
      await channelRef.current.track({callsign:activeCallsign,status:'Transmitiendo',joinedAt:new Date().toISOString()});
    } catch (error) {
      endLocalAudio(false);
      setPttError(error instanceof DOMException && error.name==='NotAllowedError'
        ? 'No diste permiso para usar el micrófono. Habilítalo en el navegador.'
        : 'No se pudo iniciar el micrófono. Comprueba los permisos y la conexión.');
      try { await api('queue',{queue_action:'release'}); } catch { /* El turno caduca en el servidor. */ }
    } finally {
      beginningRef.current = false;
    }
  };

  const queueAction = async (queue_action:'state'|'request'|'cancel'|'release') => {
    const data = await api('queue',{queue_action});
    if (data.status==='queued') {
      setIsQueued(true);
      setQueuePosition(Number(data.queue_position)||0);
    } else {
      setIsQueued(false);
      setQueuePosition(0);
    }
    setActiveSpeaker(String(data.active_callsign || ''));
    if (data.active_until) {
      const seconds = Math.max(0,Math.ceil((new Date(data.active_until).getTime()-Date.now())/1000));
      setRemainingSeconds(seconds);
    } else setRemainingSeconds(0);
    if (data.status==='transmitting' && !talkingRef.current && !beginningRef.current) void beginAudio();
    if (data.status!=='transmitting' && (talkingRef.current || beginningRef.current)) endLocalAudio(true);
    return data as QueueState;
  };

  const requestTurn = async () => {
    if (connection!=='connected' || isTalking || isQueued) return;
    setPttError('');
    try { await queueAction('request'); }
    catch (error) { setPttError(error instanceof Error ? error.message : 'No se pudo solicitar turno.'); }
  };

  const releaseTurn = async () => {
    turnCancelledRef.current = true;
    if (talkingRef.current || beginningRef.current) endLocalAudio(true);
    setIsQueued(false);
    setQueuePosition(0);
    try { await queueAction('release'); }
    catch { try { await queueAction('cancel'); } catch { /* La desconexión elimina la solicitud por caducidad. */ } }
  };

  const togglePtt = () => {
    if (isTalking || isQueued) void releaseTurn();
    else if (localStorage.getItem('lb_comunica_ptt_consent_'+activeCallsign)==='accepted') void requestTurn();
    else setShowConsent(true);
  };

  const acceptConsent = async () => {
    try {
      await api('consent');
      localStorage.setItem('lb_comunica_ptt_consent_'+activeCallsign,'accepted');
      setShowConsent(false);
      await requestTurn();
    } catch (error) {
      setPttError(error instanceof Error ? error.message : 'No se pudo guardar tu aceptación.');
    }
  };

  const openRoom = () => {
    const current = readCallsign() || activeCallsign;
    if (current) setActiveCallsign(current);
    setDeviceToken(identityTokenForDevice());
    setIsOpen(true);
  };

  useEffect(() => {
    const update = (event?:Event) => {
      const fromEvent = event instanceof CustomEvent ? String((event.detail as {callsign?:string}|undefined)?.callsign||'') : '';
      const next = (fromEvent || readCallsign()).trim().toUpperCase();
      if (next && next!==activeCallsign) {
        if (talkingRef.current) endLocalAudio(true);
        setActiveCallsign(next);
      }
    };
    window.addEventListener('community-active-identity-changed',update);
    window.addEventListener('community-account-identities-loaded',update);
    window.addEventListener('user-profile-updated',update);
    window.addEventListener('storage',update);
    return () => {
      window.removeEventListener('community-active-identity-changed',update);
      window.removeEventListener('community-account-identities-loaded',update);
      window.removeEventListener('user-profile-updated',update);
      window.removeEventListener('storage',update);
    };
  },[activeCallsign]);

  useEffect(() => {
    if (!isOpen || !activeCallsign || !deviceToken || !supabase) {
      if (isOpen) setConnection('error');
      return;
    }
    const client = supabase;
    let mounted = true;
    setConnection('connecting');
    setParticipants([]);
    const channel = client.channel('lb-comunica:'+room,{
      config:{presence:{key:deviceToken},broadcast:{self:false}},
    });
    channelRef.current = channel;
    channel
      .on('presence',{event:'sync'},()=>{
        if (!mounted) return;
        const state = channel.presenceState<Participant>();
        const all = Object.values(state).flat();
        const unique = new Map<string,Participant>();
        all.forEach((p)=>{const call=String(p.callsign||'').toUpperCase();if(call)unique.set(call,{...p,callsign:call});});
        setParticipants(Array.from(unique.values()).sort((a,b)=>a.callsign.localeCompare(b.callsign)));
      })
      .on('broadcast',{event:'signal'},({payload}:{payload:Signal})=>{if(mounted)void acceptSignal(payload);})
      .subscribe(async(status)=>{
        if (!mounted) return;
        if (status==='SUBSCRIBED') {
          try {
            await channel.track({callsign:activeCallsign,status:'Escuchando',joinedAt:new Date().toISOString()});
            const consent = await api('consent_status');
            if (consent.accepted) localStorage.setItem('lb_comunica_ptt_consent_'+activeCallsign,'accepted');
            // TURN permanece oculto mientras no esté configurado.
            iceServersRef.current = [{ urls: 'stun:stun.l.google.com:19302' }];
            const pushStatus = await api('push_status');
            setPushEnabled(!!pushStatus.enabled);
            if (pushStatus.enabled) localStorage.setItem(pushPreferenceKey(), '1');
            else localStorage.removeItem(pushPreferenceKey());
            if (mounted) setConnection('connected');
            void loadArchive();
          } catch (error) {
            if (mounted) {setConnection('error');setPttError(error instanceof Error?error.message:'No se pudo validar la identidad en la sala.');}
          }
        } else if (status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED') setConnection('error');
      });
    const releaseOnExit = () => { void api('queue',{queue_action:'release'}).catch(()=>{}); };
    window.addEventListener('pagehide',releaseOnExit);
    return () => {
      window.removeEventListener('pagehide',releaseOnExit);
      void api('queue',{queue_action:'release'}).catch(()=>{});
      mounted=false;
      channelRef.current=null;
      void channel.untrack();
      void client.removeChannel(channel);
      if (talkingRef.current) endLocalAudio(true);
      closeAllPeers();
    };
  },[isOpen,activeCallsign,deviceToken,room]);

  useEffect(() => {
    if (!isOpen || connection!=='connected') return;
    let stopped=false;
    const poll = async () => {
      try {
        const data = await queueAction('state');
        if (stopped) return;
        if (data.active_until) {
          const seconds=Math.max(0,Math.ceil((new Date(data.active_until).getTime()-Date.now())/1000));
          setRemainingSeconds(seconds);
          if (seconds===0 && talkingRef.current) endLocalAudio(true);
        }
      } catch (error) {
        if (!stopped) setPttError(error instanceof Error?error.message:'No se pudo actualizar la cola.');
      }
    };
    void poll();
    const timer=window.setInterval(()=>void poll(),1000);
    return ()=>{stopped=true;window.clearInterval(timer);};
  },[isOpen,connection,activeCallsign,deviceToken,room]);

  const closeRoom = () => {
    void releaseTurn();
    setIsOpen(false);
    setConnection('idle');
    setParticipants([]);
    setRecordings([]);
    setPttError('');
  };

  const playRecording = (index:number) => {
    const item=recordings[index];
    const player=audioPlayerRef.current;
    if (!item||!player) return;
    setPlayingIndex(index);
    player.src=item.url;
    player.playbackRate=playbackSpeed;
    void player.play().catch(()=>setPttError('El navegador no permitió reproducir el audio.'));
  };

  const handlePlaybackEnded = () => {
    if (playAll && playingIndex>=0 && playingIndex<recordings.length-1) playRecording(playingIndex+1);
    else {setPlayingIndex(-1);setPlayAll(false);}
  };

  const formatDuration = (ms:number) => {
    const sec=Math.ceil(ms/1000);
    return Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0');
  };

  return (
    <>
      <button type="button" onClick={openRoom}
        className="mb-3 flex min-h-11 w-full flex-col items-center justify-center rounded-lg border border-emerald-300 bg-gradient-to-r from-emerald-950 via-teal-900 to-cyan-900 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:text-sm"
        aria-label="LB COMUNICACION, pulsa y habla">
        <span className="inline-flex items-center gap-2"><Headphones className="h-5 w-5 shrink-0"/>LB COMUNICACION</span>
        <span className="mt-0.5 text-xs font-semibold sm:text-sm">pulsa y habla</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="lb-comunica-title">
          <section className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-emerald-400/40 bg-slate-950 text-white shadow-2xl">
            <header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
              <div><h2 id="lb-comunica-title" className="text-base font-bold tracking-wide">LB COMUNICACION</h2><p className="text-xs font-semibold text-emerald-300">Sala {roomTitle}</p></div>
              <button type="button" onClick={closeRoom} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Salir de la sala"><X className="h-5 w-5"/></button>
            </header>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-slate-900/80 px-4 py-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4 text-emerald-300"/>Usuarios conectados</div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-bold text-emerald-300">{connection==='connected'?participants.length:'—'}</span>
            </div>
            {!activeCallsign ? <div className="p-6 text-center font-semibold">Primero debes validar tu SD o indicativo en el chat general.</div> : (
              <div className="grid min-h-0 gap-4 overflow-y-auto p-4 md:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.2fr)]">
                <aside className="min-w-0">
                  <button type="button" onClick={()=>setMobileListOpen(v=>!v)} className="mb-2 flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm font-semibold md:hidden">Usuarios de la sala <span className="text-emerald-300">{participants.length}</span></button>
                  <div className={mobileListOpen?'block':'hidden md:block'}>
                    <h3 className="mb-2 hidden text-sm font-semibold text-slate-300 md:block">Participantes</h3>
                    <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-900/70 p-2 md:max-h-[35vh]">
                      {participants.length?participants.map(person=>(
                        <div key={person.callsign} className="flex items-center justify-between gap-2 rounded-lg px-2 py-2 text-sm">
                          <span className="truncate"><span className="mr-2">{flagForCallsign(person.callsign,undefined,is11MeterStationIdentifier(person.callsign))}</span><b>{person.callsign}</b></span>
                          <span className={person.status==='Transmitiendo'?'text-xs font-bold text-red-300':'text-xs text-slate-400'}>{person.status||'Escuchando'}</span>
                        </div>
                      )):<p className="px-2 py-4 text-center text-sm text-slate-400">{connection==='connected'?'Todavía no hay participantes.':'Conectando con la sala…'}</p>}
                    </div>
                    <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
                      <h3 className="mb-2 text-sm font-semibold text-slate-200">Cola de transmisión</h3>
                      <p className="text-xs text-slate-300">{activeSpeaker?'En el aire: '+activeSpeaker:'Canal libre'}</p>
                      {isQueued&&<p className="mt-1 text-xs font-bold text-amber-300">Tu posición: {queuePosition||'siguiente'}</p>}
                      <p className="mt-1 text-xs text-slate-400">{remainingSeconds>0?'Tiempo restante: '+remainingSeconds+' s':'Turnos de 30 segundos, por orden de solicitud.'}</p>
                    </div>
                  </div>
                </aside>
                <div className="flex min-w-0 flex-col items-center gap-3 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-center">
                  <div className="flex items-center gap-2 text-sm"><Wifi className={connection==='connected'?'h-4 w-4 text-emerald-300':'h-4 w-4 text-amber-300'}/><span>{connection==='connected'?'Conectado a la sala':connection==='connecting'?'Conectando…':'Sin conexión con la sala'}</span></div>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <span className="text-xs text-slate-400">Modo PTT</span>
                    <button type="button" onClick={()=>{if(isTalking||isQueued)void releaseTurn();setPttMode(m=>m==='hold'?'toggle':'hold');}} className="rounded-full border border-white/20 px-3 py-1 text-xs font-semibold">{pttMode==='hold'?'Mantener pulsado':'Pulsar para activar/desactivar'}</button>
                  </div>
                  <button type="button" disabled={connection!=='connected'}
                    onPointerDown={pttMode==='hold'?(e)=>{e.preventDefault();if(localStorage.getItem('lb_comunica_ptt_consent_'+activeCallsign)==='accepted')void requestTurn();else setShowConsent(true);}:undefined}
                    onPointerUp={pttMode==='hold'?()=>void releaseTurn():undefined}
                    onPointerLeave={pttMode==='hold'?()=>{if(isTalking||isQueued)void releaseTurn();}:undefined}
                    onPointerCancel={pttMode==='hold'?()=>void releaseTurn():undefined}
                    onClick={pttMode==='toggle'?togglePtt:undefined}
                    className={'flex h-36 w-36 select-none touch-none flex-col items-center justify-center rounded-full border-4 shadow-inner transition '+(isTalking?'border-red-300 bg-red-700 text-white':isQueued?'border-amber-300 bg-amber-900 text-white':'border-emerald-400 bg-emerald-950 text-emerald-100')+' disabled:cursor-not-allowed disabled:opacity-40'}>
                    <Mic className="mb-2 h-9 w-9"/><span className="text-xs font-extrabold">{isTalking?'EN EL AIRE':isQueued?'EN COLA':'PULSA Y HABLA'}</span>
                  </button>
                  <div className="flex items-center gap-2 text-xs text-slate-300"><Volume2 className="h-4 w-4"/>{remoteTalkers.length?'Recibiendo: '+remoteTalkers.join(', '):'Esperando transmisión'}</div>
                  {pttError&&<p role="alert" className="max-w-md text-sm text-amber-200">{pttError}</p>}
                  <div className="mt-1 flex w-full max-w-md items-center justify-between gap-3 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-2 text-left">
                    <div className="min-w-0"><p className="text-xs font-semibold text-slate-200">Avisos cuando LogBook esté cerrado</p><p className="text-[11px] text-slate-400">Solo en este dispositivo y para esta sala.</p></div>
                    <button type="button" disabled={pushBusy} onClick={()=>void (pushEnabled?disablePush():enablePush())}
                      className={'shrink-0 rounded-full px-3 py-1.5 text-xs font-bold '+(pushEnabled?'bg-emerald-700 text-white':'bg-slate-700 text-slate-100')}>
                      {pushBusy?'…':pushEnabled?'Activados':'Activar'}
                    </button>
                  </div>
                  <p className="max-w-md text-xs text-slate-400">Un único transmisor por sala. El servidor ordena la cola y concede un máximo de 30 segundos por turno.</p>
                </div>
                <div className="md:col-span-2 rounded-xl border border-white/10 bg-slate-900/70 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold"><ListMusic className="h-4 w-4 text-emerald-300"/>Historial de audio — {roomTitle}</h3>
                    <div className="flex flex-wrap items-center gap-2">
                      <button type="button" disabled={!recordings.length} onClick={()=>{setPlayAll(true);playRecording(0);}} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Reproducir todo</button>
                      <label className="flex items-center gap-1 text-xs text-slate-300">Velocidad
                        <select value={playbackSpeed} onChange={e=>{const v=Number(e.target.value);setPlaybackSpeed(v);if(audioPlayerRef.current)audioPlayerRef.current.playbackRate=v;}} className="rounded-md border border-white/20 bg-slate-950 px-2 py-1 text-white">
                          {[1,1.25,1.5,1.75,2].map(v=><option key={v} value={v}>{v}x</option>)}
                        </select>
                      </label>
                    </div>
                  </div>
                  <audio ref={audioPlayerRef} className="hidden" onEnded={handlePlaybackEnded}/>
                  {recordings.length?(
                    <div className="space-y-1">
                      {recordings.map((recording,index)=>(
                        <div key={recording.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs">
                          <div className="min-w-0"><b>{recording.callsign}</b><span className="ml-2 text-slate-400">{new Date(recording.created_at).toLocaleString()}</span><span className="ml-2 text-slate-500">{formatDuration(recording.duration_ms)}</span></div>
                          <button type="button" onClick={()=>{setPlayAll(false);playRecording(index);}} className="inline-flex items-center gap-1 rounded-md border border-emerald-400/40 px-2 py-1 text-emerald-200"><Play className="h-3 w-3"/>{playingIndex===index?'Reproduciendo':'Reproducir'}</button>
                        </div>
                      ))}
                    </div>
                  ):<p className="py-3 text-center text-xs text-slate-400">Todavía no hay intervenciones guardadas en esta sala. Se conservarán siempre las cinco más recientes.</p>}
                  <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500"><Clock3 className="h-3 w-3"/>Archivo privado para usuarios autorizados de esta sala. Limpieza diaria conservando los últimos cinco audios.</p>
                </div>
              </div>
            )}
            <footer className="border-t border-white/10 px-4 py-3 text-center text-xs text-slate-400">Tu identidad activa determina la sala. HAM y 11 metros permanecen separados.</footer>
          </section>
        </div>
      )}
      {showConsent&&isOpen&&(
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 p-4" role="dialog" aria-modal="true" aria-labelledby="lb-ptt-consent-title">
          <div className="w-full max-w-md rounded-xl border border-emerald-400/40 bg-slate-900 p-5 text-white">
            <h3 id="lb-ptt-consent-title" className="text-lg font-bold">Activar PTT y archivo de voz</h3>
            <p className="mt-3 text-sm text-slate-200">Esta aceptación se solicita una sola vez. Autorizas el uso del micrófono y que tus intervenciones se guarden en el archivo privado de esta sala. La limpieza diaria conservará siempre los cinco audios más recientes de cada sala. HAM y 11 metros tienen archivos separados.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={()=>setShowConsent(false)} className="rounded-lg border border-white/20 px-4 py-2 text-sm">Cancelar</button>
              <button type="button" onClick={()=>void acceptConsent()} className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold">Acepto una sola vez</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
