import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Mic, Users, Wifi, X, Volume2, Play, ListMusic, Clock3, Share2, Copy, MessageCircle, Send, Mail } from 'lucide-react';
import { resolveShareLanguage, type AppLanguage } from '../services/appLanguage';
import { ShareLanguageSelector } from './ShareLanguageSelector';
import { supabase } from '../services/supabaseClient';
import { flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type Participant = { callsign: string; status?: string; joinedAt?: string };
type Signal = {
  from: string; to: string; callsign: string; sessionId: string;
  kind: 'offer' | 'answer' | 'ice' | 'stop';
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit;
};
type PeerEntry = { pc: RTCPeerConnection; audio: HTMLAudioElement; context?: AudioContext; rf?: GainNode; tone?: BiquadFilterNode; high?: BiquadFilterNode; low?: BiquadFilterNode; gate?: GainNode; analyser?: AnalyserNode; gateFrame?: number };
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

const SuperstarMeter: React.FC<{ level: number; transmitting: boolean }> = ({ level, transmitting }) => {
  const position = 24 + Math.max(0, Math.min(1, level)) * 272;
  return (
    <div className="w-full max-w-[340px] rounded-md border-[5px] border-zinc-500 bg-zinc-900 p-1 shadow-[inset_0_0_14px_#000,0_5px_18px_#0008]">
      <svg viewBox="0 0 320 126" role="img" aria-label="Medidor analógico estilo Superstar 3900 con escalas SIG, RF, SWR y CAL" className="block w-full">
        <defs>
          <linearGradient id="ss3900-face" x2="0" y2="1"><stop stopColor="#17241b"/><stop offset="1" stopColor="#07110b"/></linearGradient>
          <linearGradient id="ss3900-glass" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".2"/><stop offset=".42" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".2"/></linearGradient>
        </defs>
        <rect x="2" y="2" width="316" height="122" rx="5" fill="url(#ss3900-face)" stroke="#a8aaa3" strokeWidth="2"/>
        <rect x="12" y="12" width="296" height="99" rx="2" fill="#050b07" stroke="#687466" strokeWidth="1"/>
        <g fontFamily="Arial,sans-serif" fontWeight="bold">
          <text x="20" y="30" fill="#36c98a" fontSize="11" letterSpacing="1">SWR</text>
          <text x="102" y="30" fill="#36c98a" fontSize="10">1</text><text x="151" y="30" fill="#36c98a" fontSize="10">2</text><text x="200" y="30" fill="#36c98a" fontSize="10">3</text>
          <text x="251" y="30" fill="#ef5948" fontSize="10">CAL</text>
          <path d="M20 35 H239" stroke="#36c98a" strokeWidth="5"/><path d="M239 35 H293" stroke="#ef5948" strokeWidth="5"/>
          <text x="20" y="61" fill="#36c98a" fontSize="11" letterSpacing="1">RF</text>
          <path d="M20 66 H293" stroke="#36c98a" strokeWidth="5"/>
          <text x="20" y="92" fill="#36c98a" fontSize="11" letterSpacing="1">SIG</text>
          <g fill="#36c98a" fontSize="10" textAnchor="middle"><text x="83" y="91">1</text><text x="123" y="91">3</text><text x="163" y="91">5</text><text x="203" y="91">7</text><text x="243" y="91">9</text></g>
          <text x="290" y="91" fill="#ef5948" fontSize="10" textAnchor="end">+30 dB</text>
          <path d="M20 97 H263" stroke="#36c98a" strokeWidth="5"/><path d="M263 97 H293" stroke="#ef5948" strokeWidth="5"/>
        </g>
        <line x1={position} y1="16" x2={position} y2="104" stroke="#f5f1d7" strokeWidth="2.5"/>
        <path d={`M${position-4} 104 L${position} 95 L${position+4} 104 Z`} fill="#e34b3d" stroke="#641c17" strokeWidth=".8"/>
        <rect x="12" y="12" width="296" height="99" rx="2" fill="url(#ss3900-glass)" pointerEvents="none"/>
        <text x="160" y="119" textAnchor="middle" fill={transmitting ? "#ff6b55" : "#9fd27c"} fontSize="7" letterSpacing="1">{transmitting ? "TX · RF" : "RX · SIG"}</text>
      </svg>
    </div>
  );
};

const RadioKnob: React.FC<{label:string;value:number;onChange:(v:number)=>void}> = ({label,value,onChange}) => {
  const angle=-135+value*2.7;
  return <label className="flex flex-col items-center gap-1 text-center"><span className="text-[9px] font-black tracking-widest text-amber-100 drop-shadow-[0_1px_2px_#000]">{label}</span><span className="relative block h-10 w-10 rounded-full sm:h-14 sm:w-14 border border-amber-100/30 bg-[radial-gradient(circle_at_32%_25%,#77736a,#33332f_48%,#090a08)] shadow-[inset_0_2px_5px_#ffffff35,0_5px_8px_#000b]"><span className="absolute inset-1 rounded-full border border-white/10 bg-[conic-gradient(from_220deg,#aaa69c,#292a26,#151612,#77736a)]"/><span className="absolute left-1/2 top-1/2 h-5 w-[3px] origin-[50%_100%] rounded-full bg-amber-200" style={{transform:'translate(-50%,-100%) rotate('+angle+'deg)'}}/><input aria-label={label} type="range" min="0" max="100" value={value} onChange={e=>onChange(Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/></span><span className="text-[10px] font-black text-amber-100 drop-shadow-[0_1px_2px_#000]">{value}%</span></label>;
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
  const [pttMode, setPttMode] = useState<'hold'|'toggle'>(()=>localStorage.getItem('lb_comunica_ptt_mode')==='toggle'?'toggle':'hold');
  const [showConsent, setShowConsent] = useState(false);
  const [pttError, setPttError] = useState('');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLanguage, setShareLanguage] = useState<'auto' | AppLanguage>('auto');
  const [shareBusy, setShareBusy] = useState(false);
  const [shareNotice, setShareNotice] = useState('');
  const [remoteTalkers, setRemoteTalkers] = useState<string[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [playAll, setPlayAll] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0.08);
  const [rfGain,setRfGain]=useState(()=>Number(localStorage.getItem('lb_radio_rf_gain')||80));
  const [micGain,setMicGain]=useState(()=>Number(localStorage.getItem('lb_radio_mic_gain')||70));
  const [squelch,setSquelch]=useState(()=>Number(localStorage.getItem('lb_radio_squelch')||0));
  const [clarifier,setClarifier]=useState(()=>Number(localStorage.getItem('lb_radio_clarifier')||50));
  const [radioVolume,setRadioVolume]=useState(()=>Number(localStorage.getItem('lb_radio_volume')||85));
  const [radioReceive,setRadioReceive]=useState(()=>localStorage.getItem('lb_radio_receive')!=='0');
  const [audioProfile,setAudioProfile]=useState<'radio'|'clean'>(()=>localStorage.getItem('lb_radio_audio_profile')==='clean'?'clean':'radio');
  const [panelLight,setPanelLight]=useState(()=>localStorage.getItem('lb_radio_panel_light')!=='0');
  const channelRef = useRef<any>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const peerMapRef = useRef<Map<string,PeerEntry>>(new Map());
  const squelchRef=useRef(squelch);
  const micContextRef=useRef<AudioContext|null>(null);
  const micGainRef=useRef<GainNode|null>(null);
  const processedMicRef=useRef<MediaStream|null>(null);
  const pendingIceRef = useRef<Map<string,RTCIceCandidateInit[]>>(new Map());
  const sessionRef = useRef('');
  const talkingRef = useRef(false);
  const beginningRef = useRef(false);
  const turnCancelledRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement|null>(null);
  const playbackObjectUrlRef = useRef<string>('');
  const playbackRequestRef = useRef(0);
  const playbackContextRef = useRef<AudioContext|null>(null);
  const playbackNodesRef = useRef<{tone:BiquadFilterNode;high:BiquadFilterNode;low:BiquadFilterNode;compressor:DynamicsCompressorNode;gate:GainNode;rf:GainNode;analyser:AnalyserNode;gateFrame:number|null}>({} as any);
  const iceServersRef = useRef<RTCIceServer[]>([{ urls: 'stun:stun.l.google.com:19302' }]);

  useEffect(()=>{
    if(!isOpen||!audioPlayerRef.current)return;
    const player=audioPlayerRef.current;
    player.crossOrigin='anonymous';
    const Ctor=window.AudioContext||(window as any).webkitAudioContext;
    if(!Ctor)return;
    let ctx:AudioContext;
    try{
      ctx=new Ctor();
      const source=ctx.createMediaElementSource(player);
      const high=ctx.createBiquadFilter();high.type='highpass';high.Q.value=.707;
      const low=ctx.createBiquadFilter();low.type='lowpass';low.Q.value=.707;
      const tone=ctx.createBiquadFilter();tone.type='peaking';tone.Q.value=.85;
      const compressor=ctx.createDynamicsCompressor();compressor.attack.value=.012;compressor.release.value=.22;
      const analyser=ctx.createAnalyser();analyser.fftSize=512;
      const gate=ctx.createGain();gate.gain.value=1;const rf=ctx.createGain();
      source.connect(high);high.connect(low);low.connect(tone);tone.connect(compressor);compressor.connect(analyser);analyser.connect(gate);gate.connect(rf);rf.connect(ctx.destination);
      playbackContextRef.current=ctx;
      playbackNodesRef.current={tone,high,low,compressor,gate,rf,analyser,gateFrame:null};
    }catch{playbackContextRef.current=null;}
    return ()=>{
      const nodes=playbackNodesRef.current;
      if(nodes.gateFrame!==null&&nodes.gateFrame!==undefined)cancelAnimationFrame(nodes.gateFrame);
      player.pause();player.removeAttribute('src');player.load();
      playbackRequestRef.current++;
      if(playbackObjectUrlRef.current){URL.revokeObjectURL(playbackObjectUrlRef.current);playbackObjectUrlRef.current='';}
      void playbackContextRef.current?.close().catch(()=>{});
      playbackContextRef.current=null;playbackNodesRef.current={} as any;
    };
  },[isOpen]);
  useEffect(()=>{
    const ctx=playbackContextRef.current;const n=playbackNodesRef.current;
    if(!ctx||!n?.tone)return;
    const now=ctx.currentTime;
    n.high.frequency.setTargetAtTime(audioProfile==='radio'?220:10,now,.08);
    n.low.frequency.setTargetAtTime(audioProfile==='radio'?3400:20000,now,.08);
    n.tone.frequency.setTargetAtTime(1450+(clarifier-50)*12,now,.08);
    n.tone.gain.setTargetAtTime(audioProfile==='radio'?1.2+((clarifier-50)/50)*1.2:0,now,.08);
    n.compressor.threshold.setTargetAtTime(audioProfile==='radio'?-20:0,now,.08);
    n.compressor.knee.setTargetAtTime(audioProfile==='radio'?24:0,now,.08);
    n.compressor.ratio.setTargetAtTime(audioProfile==='radio'?1.6:1,now,.08);
    n.rf.gain.setTargetAtTime(radioReceive?(rfGain/100)*(radioVolume/100):0,now,.04);
    if(n.gateFrame!==null)cancelAnimationFrame(n.gateFrame);
    const samples=new Uint8Array(n.analyser.fftSize);
    const updateGate=()=>{if(playbackContextRef.current!==ctx)return;n.analyser.getByteTimeDomainData(samples);let sum=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/samples.length);n.gate.gain.setTargetAtTime(squelch>0&&rms<(0.0015+(squelch/100)*.018)?0:1,ctx.currentTime,.12);n.gateFrame=requestAnimationFrame(updateGate);};
    n.gateFrame=requestAnimationFrame(updateGate);
  },[audioProfile,rfGain,squelch,clarifier,radioVolume,radioReceive,isOpen]);
  useEffect(()=>{squelchRef.current=squelch;},[squelch]);
  useEffect(()=>{localStorage.setItem('lb_radio_audio_profile',audioProfile);},[audioProfile]);
  useEffect(()=>{localStorage.setItem('lb_radio_rf_gain',String(rfGain));localStorage.setItem('lb_radio_mic_gain',String(micGain));localStorage.setItem('lb_radio_squelch',String(squelch));localStorage.setItem('lb_radio_clarifier',String(clarifier));localStorage.setItem('lb_radio_volume',String(radioVolume));},[rfGain,micGain,squelch,clarifier,radioVolume]);
  useEffect(()=>{localStorage.setItem('lb_radio_receive',radioReceive?'1':'0');},[radioReceive]);
  useEffect(()=>{localStorage.setItem('lb_radio_panel_light',panelLight?'1':'0');},[panelLight]);
  useEffect(()=>{localStorage.setItem('lb_comunica_ptt_mode',pttMode);},[pttMode]);
  useEffect(()=>{if(micGainRef.current)micGainRef.current.gain.setTargetAtTime(micGain/70,micGainRef.current.context.currentTime,.04);for(const entry of peerMapRef.current.values()){if(entry.rf)entry.rf.gain.setTargetAtTime(radioReceive?(rfGain/100)*(radioVolume/100):0,entry.context?.currentTime||0,.04);if(entry.tone){entry.tone.frequency.setTargetAtTime(1450+(clarifier-50)*12,entry.context?.currentTime||0,.08);entry.tone.gain.setTargetAtTime(audioProfile==='radio'?1.2+((clarifier-50)/50)*1.2:0,entry.context?.currentTime||0,.08);}if(entry.high)entry.high.frequency.setTargetAtTime(audioProfile==='radio'?220:10,entry.context?.currentTime||0,.08);if(entry.low)entry.low.frequency.setTargetAtTime(audioProfile==='radio'?3400:20000,entry.context?.currentTime||0,.08);}},[rfGain,micGain,squelch,clarifier,radioVolume,radioReceive,audioProfile]);

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
      localStorage.setItem('lb_comunica_push_callsign_' + room, activeCallsign);
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
    if(entry.gateFrame)cancelAnimationFrame(entry.gateFrame);
    void entry.context?.close().catch(()=>{});
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
      const remote=event.streams[0]||new MediaStream([event.track]);
      try {
        const Ctor=window.AudioContext||(window as any).webkitAudioContext;
        if(!Ctor)throw new Error('Web Audio no disponible');
        const ctx:AudioContext=new Ctor();
        const source=ctx.createMediaStreamSource(remote);
        const high=ctx.createBiquadFilter();high.type='highpass';high.frequency.value=audioProfile==='radio'?220:10;high.Q.value=.707;
        const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=audioProfile==='radio'?3400:20000;low.Q.value=.707;
        const tone=ctx.createBiquadFilter();tone.type='peaking';tone.frequency.value=1450+(clarifier-50)*12;tone.Q.value=.85;tone.gain.value=audioProfile==='radio'?1.2+((clarifier-50)/50)*1.2:0;
        const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-20;compressor.knee.value=24;compressor.ratio.value=1.6;compressor.attack.value=.012;compressor.release.value=.22;
        const analyser=ctx.createAnalyser();analyser.fftSize=512;
        const gate=ctx.createGain();gate.gain.value=1;
        const rf=ctx.createGain();rf.gain.value=radioReceive?(rfGain/100)*(radioVolume/100):0;
        const dest=ctx.createMediaStreamDestination();
        source.connect(high);high.connect(low);low.connect(tone);tone.connect(compressor);compressor.connect(analyser);analyser.connect(gate);gate.connect(rf);rf.connect(dest);
        audio.srcObject=dest.stream;
        const entry=peerMapRef.current.get(key);
        if(entry){entry.context=ctx;entry.rf=rf;entry.tone=tone;entry.high=high;entry.low=low;entry.gate=gate;entry.analyser=analyser;}
        const samples=new Uint8Array(analyser.fftSize);
        const loop=()=>{const current=peerMapRef.current.get(key);if(!current||current.context!==ctx)return;analyser.getByteTimeDomainData(samples);let sum=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/samples.length);gate.gain.setTargetAtTime(squelchRef.current>0&&rms<(0.0015+(squelchRef.current/100)*.018)?0:1,ctx.currentTime,.04);current.gateFrame=requestAnimationFrame(loop);};
        const current=peerMapRef.current.get(key);if(current)current.gateFrame=requestAnimationFrame(loop);
        void ctx.resume();
      } catch { audio.srcObject=remote;audio.volume=radioReceive?radioVolume/100:0; }
      void audio.play().catch(()=>setPttError('Toca la pantalla para permitir la reproducción del audio recibido.'));
      setRemoteTalkers(current=>current.includes(callsign)?current:[...current,callsign]);
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
    processedMicRef.current?.getTracks().forEach(track=>track.stop());processedMicRef.current=null;micGainRef.current=null;void micContextRef.current?.close().catch(()=>{});micContextRef.current=null;
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
      let transmitStream=stream;
      try{
        const Ctor=window.AudioContext||(window as any).webkitAudioContext;
        if(Ctor){
          const ctx:AudioContext=new Ctor();
          const source=ctx.createMediaStreamSource(stream);
          const gain=ctx.createGain();
          gain.gain.value=Math.max(0,Math.min(2,micGain/70));
          const dest=ctx.createMediaStreamDestination();
          source.connect(gain);
          gain.connect(dest);
          micContextRef.current=ctx;
          micGainRef.current=gain;
          processedMicRef.current=dest.stream;
          transmitStream=dest.stream;
          await ctx.resume();
        }
      }catch{
        transmitStream=stream;
        if(micContextRef.current){void micContextRef.current.close().catch(()=>{});micContextRef.current=null;}
        micGainRef.current=null;
        processedMicRef.current=null;
      }
      if (turnCancelledRef.current) { stream.getTracks().forEach((track)=>track.stop());transmitStream.getTracks().forEach((track)=>track.stop());beginningRef.current=false;return; }
      streamRef.current = stream;
      recordedChunksRef.current = [];
      recordingStartedAtRef.current = Date.now();
      if (typeof MediaRecorder !== 'undefined') {
        const preferred = ['audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/mp4'].find((mime)=>MediaRecorder.isTypeSupported(mime));
        // Guardar exactamente la señal que se transmite, no una captura distinta del micrófono.
        const recorder = new MediaRecorder(transmitStream,preferred ? {mimeType:preferred} : undefined);
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
        transmitStream.getAudioTracks().forEach((track)=>pc.addTrack(track,transmitStream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          from:deviceToken,to:peerId,callsign:activeCallsign,sessionId,
          kind:'offer',description:pc.localDescription?.toJSON(),
        });
      }
      talkingRef.current = true;
      setRemainingSeconds(current=>current>0?current:30);
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

  const openRoom = (targetCallsign?: string) => {
    const current = (targetCallsign || readCallsign() || activeCallsign).trim().toUpperCase();
    if (current) setActiveCallsign(current);
    setDeviceToken(identityTokenForDevice());
    setIsOpen(true);
  };

  useEffect(() => {
    const handlePushOpen = (event: MessageEvent) => {
      if (event.data?.type !== 'OPEN_LB_COMUNICA') return;
      const targetRoom = event.data.room === '11m' ? '11m' : event.data.room === 'ham' ? 'ham' : '';
      const savedCallsign = targetRoom ? localStorage.getItem('lb_comunica_push_callsign_' + targetRoom) || '' : '';
      const identity = savedCallsign || readCallsign();
      if (!identity) {
        const next = new URL(window.location.href);
        next.searchParams.set('open_lb_register', '1');
        window.history.replaceState({}, '', next.pathname + next.search + next.hash);
        window.dispatchEvent(new CustomEvent('logbook-open-identity-registration'));
        return;
      }
      if ((is11MeterStationIdentifier(identity) ? '11m' : 'ham') === targetRoom) openRoom(identity);
      else openRoom();
    };
    window.addEventListener('message', handlePushOpen);
    const params = new URLSearchParams(window.location.search);
    const targetRoom = params.get('open_lb_comunica');
    if (targetRoom === 'ham' || targetRoom === '11m') {
      const savedCallsign = localStorage.getItem('lb_comunica_push_callsign_' + targetRoom) || '';
      const identity = savedCallsign || readCallsign();
      window.setTimeout(() => {
        if (!identity) {
          params.set('open_lb_register', '1');
          window.history.replaceState({}, '', window.location.pathname + '?' + params.toString() + window.location.hash);
          window.dispatchEvent(new CustomEvent('logbook-open-identity-registration'));
          return;
        }
        if ((is11MeterStationIdentifier(identity) ? '11m' : 'ham') === targetRoom) openRoom(identity);
        else openRoom();
        const query = params.toString();
        window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
      }, 0);
    }
    return () => window.removeEventListener('message', handlePushOpen);
  }, []);

  useEffect(() => {
    const update = (event?:Event) => {
      const fromEvent = event instanceof CustomEvent ? String((event.detail as {callsign?:string}|undefined)?.callsign||'') : '';
      const next = (fromEvent || readCallsign()).trim().toUpperCase();
      if (next && next!==activeCallsign) {
        if (talkingRef.current) endLocalAudio(true);
        setActiveCallsign(next);
      }
      const pendingParams = new URLSearchParams(window.location.search);
      const pendingRoom = pendingParams.get('open_lb_comunica');
      if (next && (pendingRoom === 'ham' || pendingRoom === '11m')) {
        pendingParams.delete('open_lb_comunica');
        pendingParams.delete('open_lb_register');
        const query = pendingParams.toString();
        window.history.replaceState({}, '', window.location.pathname + (query ? '?' + query : '') + window.location.hash);
        openRoom(next);
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

  const shareUrl = () => { const url = new URL(window.location.origin + window.location.pathname); url.searchParams.set('open_lb_comunica', room); return url.toString(); };
  const makeShareText = async () => {
    const language = resolveShareLanguage(shareLanguage);
    const base = 'Te invito a participar en LB COMUNICACION, la sala de voz de LogBook eQSL EXPRESS para ' + (room === 'ham' ? 'Radioaficionados' : '11 Metros') + '. Para ingresar debes registrar y validar primero tu SD o indicativo en LogBook. Abre este enlace: ' + shareUrl();
    if (language === 'es') return base;
    try { const response = await fetch('/api/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: base, language }) }); if (response.ok) { const data = await response.json(); if (typeof data?.translated === 'string' && data.translated.trim()) return data.translated; } } catch { /* fallback */ }
    return base;
  };
  const shareInvitation = async (kind: 'native'|'whatsapp'|'telegram'|'email'|'copy') => {
    setShareBusy(true); setShareNotice('');
    try { const text = await makeShareText(); const url = shareUrl();
      if (kind === 'native') { if (navigator.share) await navigator.share({ title: 'LB COMUNICACION', text, url }); else window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener'); }
      else if (kind === 'whatsapp') window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank', 'noopener');
      else if (kind === 'telegram') window.open('https://t.me/share/url?url=' + encodeURIComponent(url) + '&text=' + encodeURIComponent(text), '_blank', 'noopener');
      else if (kind === 'email') window.location.href = 'mailto:?subject=' + encodeURIComponent('Invitación a LB COMUNICACION') + '&body=' + encodeURIComponent(text);
      else { await navigator.clipboard.writeText(text); setShareNotice('Invitación copiada.'); }
    } catch (error) { if (!(error instanceof DOMException && error.name === 'AbortError')) setShareNotice('No se pudo compartir. Inténtalo de nuevo.'); } finally { setShareBusy(false); }
  };

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
    const request=++playbackRequestRef.current;
    setPlayingIndex(index);
    setPttError('');
    player.pause();
    const start=async()=>{
      try{
        const response=await fetch(item.url,{mode:'cors',cache:'no-store'});
        if(!response.ok)throw new Error('HTTP '+response.status);
        const blob=await response.blob();
        if(!blob.size)throw new Error('El archivo de audio está vacío.');
        if(request!==playbackRequestRef.current)return;
        if(playbackObjectUrlRef.current)URL.revokeObjectURL(playbackObjectUrlRef.current);
        playbackObjectUrlRef.current=URL.createObjectURL(blob);
        player.crossOrigin='anonymous';
        player.src=playbackObjectUrlRef.current;
        player.playbackRate=playbackSpeed;
        player.load();
        const ctx=playbackContextRef.current;
        if(ctx&&ctx.state!=='running')await ctx.resume();
        await player.play();
      }catch(error){
        if(request!==playbackRequestRef.current)return;
        console.error('LB COMUNICACION reproducción:',error);
        setPttError('No se pudo cargar o reproducir este audio. Comprueba la conexión y los permisos del navegador.');
        setPlayingIndex(-1);
      }
    };
    void start();
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
      <button type="button" onClick={()=>openRoom()}
        className="mb-3 flex min-h-11 w-full flex-col items-center justify-center rounded-lg border border-emerald-300 bg-gradient-to-r from-emerald-950 via-teal-900 to-cyan-900 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:text-sm"
        aria-label="LB COMUNICACION, pulsa y habla">
        <span className="inline-flex items-center gap-2"><Headphones className="h-5 w-5 shrink-0"/>LB COMUNICACION</span>
        <span className="mt-0.5 text-xs font-semibold sm:text-sm">pulsa y habla</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-2 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="lb-comunica-title">
          <section className="flex h-full max-h-full min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-none border border-emerald-400/40 bg-slate-950 text-white shadow-2xl sm:h-auto sm:max-h-[94dvh] sm:rounded-2xl">
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-3 py-2 sm:px-4 sm:py-3">
              <div><h2 id="lb-comunica-title" className="text-base font-bold tracking-wide">LB COMUNICACION</h2><p className="text-xs font-semibold text-emerald-300">Sala {roomTitle}</p></div>
              <div className="flex items-center gap-1"><button type="button" onClick={()=>{setShareOpen(true);setShareLanguage("auto");setShareNotice("");}} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-950/60 px-3 py-2 text-xs font-bold text-emerald-100" aria-label="Compartir LB COMUNICACION"><Share2 className="h-4 w-4"/>Compartir</button><button type="button" onClick={closeRoom} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Salir de la sala"><X className="h-5 w-5"/></button></div>
            </header>
            <div className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-slate-900/80 px-2 py-1 sm:px-3 sm:py-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold"><Users className="h-4 w-4 text-emerald-300"/>Usuarios conectados</div>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-sm font-bold text-emerald-300">{connection==='connected'?participants.length:'—'}</span>
            </div>
            {!activeCallsign ? <div className="p-6 text-center font-semibold">Primero debes validar tu SD o indicativo en el chat general.</div> : (
              <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pb-8 p-1.5 sm:gap-3 sm:p-3 sm:pb-6 md:grid md:grid-cols-[minmax(210px,0.8fr)_minmax(0,1.2fr)]">
                <aside className="order-2 min-w-0 md:order-1">
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
                <div className={'relative order-1 flex min-w-0 flex-col items-center gap-2 overflow-hidden rounded-xl border p-2.5 pb-4 text-center shadow-[inset_0_0_35px_#000c,0_12px_35px_#0009] sm:gap-3 sm:p-4 md:order-2 '+(panelLight?'border-amber-300/40 bg-[linear-gradient(145deg,#44443e,#20211e_42%,#111310)]':'border-zinc-700 bg-[linear-gradient(145deg,#292a27,#10110f)]')}>
                  <div className="order-0 flex w-full items-center justify-between border-b border-amber-100/20 pb-1 text-[9px] font-black tracking-[.16em] text-amber-100"><span>LB • COMMUNICATIONS</span><span>● STANDBY</span></div>
                  <div className="order-1 w-full rounded-xl border-2 border-amber-200 bg-[linear-gradient(145deg,#d6bd7b_0%,#a98543_38%,#d0b36d_72%,#80602f_100%)] p-2.5 shadow-[inset_0_1px_5px_#fff8,0_5px_14px_#0009] sm:p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/20 bg-black/10 px-2 py-1.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-black tracking-wider text-zinc-950 sm:gap-2 sm:text-xs">
                        <span className="whitespace-nowrap">AUDIO RX</span>
                        <button type="button" aria-pressed={audioProfile==='radio'} onClick={()=>setAudioProfile('radio')} className={'rounded-md border px-2 py-1.5 text-[9px] font-black sm:px-3 sm:text-[10px] '+(audioProfile==='radio'?'border-amber-200 bg-amber-200 text-zinc-900':'border-amber-100/30 text-amber-100')}>MODO RADIO</button>
                        <button type="button" aria-pressed={audioProfile==='clean'} onClick={()=>setAudioProfile('clean')} className={'rounded-md border px-2 py-1.5 text-[9px] font-black sm:px-3 sm:text-[10px] '+(audioProfile==='clean'?'border-amber-200 bg-amber-200 text-zinc-900':'border-amber-100/30 text-amber-100')}>AUDIO LIMPIO</button>
                        <button type="button" onClick={()=>setRadioReceive(v=>!v)} aria-pressed={radioReceive} className="rounded-md border border-emerald-300/40 bg-emerald-950/70 px-2 py-1.5 text-[9px] font-black text-emerald-100 sm:px-3 sm:text-[10px]">{radioReceive?'RX AUDIO ON':'RX MUTED'}</button>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" onClick={()=>setPanelLight(v=>!v)} className="rounded-md border border-amber-100/30 bg-black/30 px-2.5 py-1.5 text-[9px] font-bold text-amber-100">{panelLight?'LAMP ON':'LAMP OFF'}</button>
                        <button type="button" onClick={()=>{setRfGain(80);setMicGain(70);setSquelch(0);setClarifier(50);setRadioVolume(85);setRadioReceive(true);setAudioProfile('radio');setPanelLight(true);}} className="rounded-md border border-white/20 bg-black/30 px-2.5 py-1.5 text-[9px] font-bold">RESET</button>
                      </div>
                    </div>
                    <div className="my-1 w-full flex justify-center"><div className="w-full max-w-[520px]"><SuperstarMeter level={isTalking ? 0.78 : remoteTalkers.length ? 0.58 : meterLevel} transmitting={isTalking} /></div></div>
                    <div className="grid w-full grid-cols-5 items-start gap-1 rounded-lg border border-black/30 bg-[linear-gradient(180deg,#59472cdd,#302719ee)] px-1 py-2 shadow-[inset_0_2px_7px_#000b] sm:gap-3 sm:px-3 sm:py-3">
                      <RadioKnob label="RF GAIN" value={rfGain} onChange={setRfGain}/>
                      <RadioKnob label="MIC GAIN" value={micGain} onChange={setMicGain}/>
                      <RadioKnob label="SQUELCH" value={squelch} onChange={setSquelch}/>
                      <RadioKnob label="CLARIFIER" value={clarifier} onChange={setClarifier}/>
                      <RadioKnob label="VOLUME" value={radioVolume} onChange={setRadioVolume}/>
                    </div>
                  <div className="mb-2 flex w-full flex-col items-center gap-2 rounded-lg border border-white/15 bg-black/35 px-3 py-2">
                    <span className="text-[10px] font-black tracking-wider text-slate-300">MODO PTT</span>
                    <div className="grid w-full grid-cols-2 gap-2">
                      <button type="button" aria-pressed={pttMode==='hold'} onClick={()=>{if(isTalking||isQueued)void releaseTurn();setPttMode('hold');}} className={'min-h-10 rounded-full border px-2 py-2 text-[10px] font-bold transition-colors '+(pttMode==='hold'?'border-emerald-200 bg-emerald-700 text-white shadow-[0_0_10px_#10b98166]':'border-white/20 bg-black/20 text-slate-300')}>MANTENER PULSADO</button>
                      <button type="button" aria-pressed={pttMode==='toggle'} onClick={()=>{if(isTalking||isQueued)void releaseTurn();setPttMode('toggle');}} className={'min-h-10 rounded-full border px-2 py-2 text-[10px] font-bold transition-colors '+(pttMode==='toggle'?'border-emerald-200 bg-emerald-700 text-white shadow-[0_0_10px_#10b98166]':'border-white/20 bg-black/20 text-slate-300')}>ALTERNADO</button>
                    </div>
                  </div>
                  <button type="button" disabled={connection!=='connected'}
                    onClick={pttMode==='toggle'?()=>togglePtt():undefined}
                    onPointerDown={pttMode==='hold'?(e)=>{e.preventDefault();if(localStorage.getItem('lb_comunica_ptt_consent_'+activeCallsign)==='accepted')void requestTurn();else setShowConsent(true);}:undefined}
                    onPointerUp={pttMode==='hold'?()=>void releaseTurn():undefined}
                    onPointerLeave={pttMode==='hold'?()=>{if(isTalking||isQueued)void releaseTurn();}:undefined}
                    onPointerCancel={pttMode==='hold'?()=>void releaseTurn():undefined}
                    className={'mt-2 mb-2 flex h-24 min-h-24 w-full max-w-none shrink-0 select-none flex-row items-center justify-center gap-3 rounded-[1.7rem] border-[3px] border-b-4 shadow-[inset_0_2px_5px_#ffffff22] transition '+(pttMode==='hold'?'touch-none ':'touch-manipulation ')+(isTalking?'border-red-300 bg-red-700 text-white':isQueued?'border-amber-300 bg-amber-900 text-white':'border-emerald-400 bg-emerald-950 text-emerald-100')+' disabled:cursor-not-allowed disabled:opacity-40'}>
                    <Mic className="h-9 w-9 shrink-0"/><span className="flex min-w-0 flex-col items-center leading-tight"><span className="text-base font-extrabold tracking-widest">{isTalking?'EN EL AIRE':isQueued?'EN COLA':'PULSA Y HABLA'}</span>{isTalking&&<span className="mt-1 rounded-md border border-white/30 bg-black/30 px-3 py-1 font-mono text-xl font-black tabular-nums">{formatDuration(Math.max(0,remainingSeconds)*1000)}</span>}</span>
                  </button>


                  </div>
                  {pttError&&<p role="alert" className="max-w-md text-sm text-amber-200">{pttError}</p>}
                  <div className="order-3 mt-1 flex w-full max-w-xs items-center justify-between gap-2 rounded-md border border-white/10 bg-black/35 px-2 py-1.5 text-left">
                    <div className="min-w-0"><p className="text-[10px] font-semibold text-slate-200">Avisos con LogBook cerrado</p><p className="text-[9px] text-slate-400">Este dispositivo · esta sala</p></div>
                    <button type="button" disabled={pushBusy} onClick={()=>void (pushEnabled?disablePush():enablePush())}
                      className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold '+(pushEnabled?'bg-emerald-700 text-white':'bg-slate-700 text-slate-100')}>
                      {pushBusy?'…':pushEnabled?'Activados':'Activar'}
                    </button>
                  </div>
                  <p className="order-3 max-w-md text-[10px] text-slate-400">Un único transmisor por sala. El servidor ordena la cola y concede un máximo de 30 segundos por turno.</p>
                </div>
                <details className="md:col-span-2 rounded-xl border border-white/10 bg-slate-900/70">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-xs font-bold text-slate-100 hover:bg-white/5">
                    <span className="flex min-w-0 items-center gap-1.5"><ListMusic className="h-3.5 w-3.5 shrink-0 text-emerald-300"/><span className="truncate">Historial · {roomTitle}</span><span className="rounded-full bg-slate-700 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">{recordings.length}</span></span>
                    <span className="shrink-0 text-[10px] font-semibold text-emerald-300">Ver ▾</span>
                  </summary>
                  <div className="border-t border-white/10 p-3">
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
                  <audio ref={audioPlayerRef} className="sr-only" preload="none" onEnded={handlePlaybackEnded} onError={()=>{if(playingIndex>=0){setPttError('El archivo no pudo decodificarse o no está disponible.');setPlayingIndex(-1);}}}/>
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
                </details>
              </div>
            )}
            <footer className="hidden shrink-0 border-t border-white/10 px-4 py-2 text-center text-xs text-slate-400 sm:block">Tu identidad activa determina la sala. HAM y 11 metros permanecen separados.</footer>
          </section>
        </div>
      )}
      {shareOpen && isOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-950/90 p-3" role="dialog" aria-modal="true" aria-labelledby="lb-share-title">
          <section className="w-full max-w-md rounded-2xl border border-emerald-400/40 bg-slate-900 p-4 text-white shadow-2xl">
            <header className="flex items-center justify-between gap-3"><h3 id="lb-share-title" className="flex items-center gap-2 text-base font-black"><Share2 className="h-5 w-5 text-emerald-300"/>Compartir LB COMUNICACION</h3><button type="button" onClick={()=>setShareOpen(false)} className="rounded-lg p-2 text-slate-300" aria-label="Cerrar"><X className="h-5 w-5"/></button></header>
            <p className="mt-2 rounded-lg bg-slate-950 p-3 text-sm">Invita a otros operadores a la sala <b>{roomTitle}</b>. Quien reciba el enlace y no tenga una SD o indicativo validado deberá registrarse primero.</p>
            <ShareLanguageSelector value={shareLanguage} onChange={setShareLanguage}/>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button type="button" disabled={shareBusy} onClick={()=>void shareInvitation("native")} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-emerald-700 px-2 py-2 text-xs font-bold"><Share2 size={16}/>Compartir…</button>
              <button type="button" disabled={shareBusy} onClick={()=>void shareInvitation("whatsapp")} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-green-700 px-2 py-2 text-xs font-bold"><MessageCircle size={16}/>WhatsApp</button>
              <button type="button" disabled={shareBusy} onClick={()=>void shareInvitation("telegram")} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-sky-700 px-2 py-2 text-xs font-bold"><Send size={16}/>Telegram</button>
              <button type="button" disabled={shareBusy} onClick={()=>void shareInvitation("email")} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-slate-700 px-2 py-2 text-xs font-bold"><Mail size={16}/>Correo electrónico</button>
              <button type="button" disabled={shareBusy} onClick={()=>void shareInvitation("copy")} className="col-span-2 flex min-h-10 items-center justify-center gap-2 rounded-lg border border-white/20 px-2 py-2 text-xs font-bold"><Copy size={15}/>Copiar invitación</button>
            </div>
            {shareBusy&&<p className="mt-2 text-center text-xs text-emerald-200">Preparando invitación…</p>}{shareNotice&&<p role="status" className="mt-2 text-center text-xs text-emerald-200">{shareNotice}</p>}
            <button type="button" onClick={()=>setShareOpen(false)} className="mt-3 w-full rounded-lg border border-white/20 p-2 text-xs">Cerrar</button>
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
