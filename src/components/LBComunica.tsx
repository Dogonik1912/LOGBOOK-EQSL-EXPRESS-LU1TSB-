import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Headphones, Mic, Users, Wifi, X, Volume2, Play, ListMusic, Clock3, Share2, Copy, MessageCircle, Send, Mail } from 'lucide-react';
import { resolveShareLanguage, getInitialAppLanguage, type AppLanguage } from '../services/appLanguage';

// Radio callsigns are spoken with the ICAO/NATO phonetic alphabet in every room
// and language. Q-codes remain localized so the voice reads their local names.
const ICAO_WORDS:Record<string,string>={A:'Alfa',B:'Bravo',C:'Charlie',D:'Delta',E:'Echo',F:'Foxtrot',G:'Golf',H:'Hotel',I:'India',J:'Juliett',K:'Kilo',L:'Lima',M:'Mike',N:'November',O:'Oscar',P:'Papa',Q:'Quebec',R:'Romeo',S:'Sierra',T:'Tango',U:'Uniform',V:'Victor',W:'Whiskey',X:'X-ray',Y:'Yankee',Z:'Zulu'};
const Q_CODE_SAYINGS:Record<string,Record<string,string>>={
  es:{QRZ:'cu erre zeta',QSL:'cu ese ele',QSY:'cu ese i griega'},
  en:{QRZ:'cue are zee',QSL:'cue ess ell',QSY:'cue ess why'},
  pt:{QRZ:'quê erre zê',QSL:'quê esse ele',QSY:'quê esse ípsilon'},
  it:{QRZ:'cu erre zeta',QSL:'cu esse elle',QSY:'cu esse ipsilon'},
  fr:{QRZ:'ku èr zèd',QSL:'ku ès èl',QSY:'ku ès i grec'},
  de:{QRZ:'ku er zet',QSL:'ku es el',QSY:'ku es ypsilon'},
  nl:{QRZ:'kuu er zet',QSL:'kuu es el',QSY:'kuu es ypsilon'},
  pl:{QRZ:'ku er zet',QSL:'ku es el',QSY:'ku es igrek'},
  ru:{QRZ:'ku er ze',QSL:'ku es el',QSY:'ku es y'},
  uk:{QRZ:'ku er zet',QSL:'ku es el',QSY:'ku es i'},
  zh:{QRZ:'Q R Z',QSL:'Q S L',QSY:'Q S Y'},
  ja:{QRZ:'キュー アール ゼット',QSL:'キュー エス エル',QSY:'キュー エス ワイ'},
  ko:{QRZ:'큐 알 지',QSL:'큐 에스 엘',QSY:'큐 에스 와이'},
  ar:{QRZ:'كيو آر زي',QSL:'كيو إس إل',QSY:'كيو إس واي'},
  hi:{QRZ:'क्यू आर ज़ेड',QSL:'क्यू एस एल',QSY:'क्यू एस वाई'},
  tr:{QRZ:'kü er ze',QSL:'kü es el',QSY:'kü es vay'},
  sv:{QRZ:'ku er säta',QSL:'ku ess ell',QSY:'ku ess y'},
  no:{QRZ:'ku er sett',QSL:'ku ess ell',QSY:'ku ess y'},
  da:{QRZ:'ku er sæt',QSL:'ku es ell',QSY:'ku es y'},
  fi:{QRZ:'kuu er zet',QSL:'kuu es äl',QSY:'kuu es yy'},
  cs:{QRZ:'kju er zet',QSL:'kju es el',QSY:'kju es ypsilon'},
  el:{QRZ:'κιου αρ ζεντ',QSL:'κιου ες ελ',QSY:'κιου ες γουάι'},
  ro:{QRZ:'chiu ar zet',QSL:'chiu es el',QSY:'chiu es uai'},
  hu:{QRZ:'kju ár zé',QSL:'kju esz el',QSY:'kju esz ipszilon'},
  id:{QRZ:'kiu ar zet',QSL:'kiu es el',QSY:'kiu es wai'},
  th:{QRZ:'คิว อาร์ ซี',QSL:'คิว เอส แอล',QSY:'คิว เอส วาย'}
};
function prepareRadioSpeech(phrase:string, callsign:string, language:string):string {
  const spelled=String(callsign||'').toUpperCase().replace(/[A-Z]/g,c=>ICAO_WORDS[c]||c).replace(/(\d)/g,' $1 ');
  let result=phrase;
  if(callsign) result=result.split(callsign).join(spelled);
  const lang=String(language||'en').toLowerCase().split('-')[0];
  const sayings=Q_CODE_SAYINGS[lang]||Q_CODE_SAYINGS.en;
  return result.replace(/\b(QRZ|QSL|QSY)\b/gi,code=>sayings[code.toUpperCase()]||code);
}

const RADIO_DIGITS:Record<string,{en:string;es:string}>={0:{en:'zero',es:'cero'},1:{en:'one',es:'uno'},2:{en:'two',es:'dos'},3:{en:'three',es:'tres'},4:{en:'four',es:'cuatro'},5:{en:'five',es:'cinco'},6:{en:'six',es:'seis'},7:{en:'seven',es:'siete'},8:{en:'eight',es:'ocho'},9:{en:'nine',es:'nueve'}};
function speak11mCallsign(callsign:string,language:string):string {
  const spanish=language.toLowerCase().startsWith('es');
  const match=String(callsign||'').toUpperCase().match(/^(\d+)\s*([A-Z]+)\s*(\d+)?$/);
  if(!match) return prepareRadioSpeech(callsign,callsign,language);
  const [,prefix,letters,suffix='']=match;
  const digitWords=(value:string)=>value.split('').map(d=>RADIO_DIGITS[d]?.[spanish?'es':'en']||d).join(' ');
  let prefixWords=digitWords(prefix);
  if(spanish && prefix.length===2){const n=Number(prefix);if(n>=10&&n<=99){const tens=Math.floor(n/10)*10,ones=n%10;const teensEs:Record<number,string>={11:'once',12:'doce',13:'trece',14:'catorce',15:'quince',16:'dieciséis',17:'diecisiete',18:'dieciocho',19:'diecinueve'};const tensEs:Record<number,string>={10:'diez',20:'veinte',30:'treinta',40:'cuarenta',50:'cincuenta',60:'sesenta',70:'setenta',80:'ochenta',90:'noventa'};prefixWords=teensEs[n]||(ones===0?(tensEs[tens]||prefixWords):((tens===20?'veinti'+RADIO_DIGITS[String(ones)].es:tensEs[tens]+' y '+RADIO_DIGITS[String(ones)].es)));}}
  const phonetics=letters.split('').map(c=>ICAO_WORDS[c]||c).join(' ');
  return [prefixWords,phonetics,suffix?digitWords(suffix):''].filter(Boolean).join(' ');
}
function isSpanishRadioCountry(country:string):boolean {
  return /Argentina|Canary Islands|Spain|Chile|Mexico|Uruguay|Paraguay|Peru|Colombia|Venezuela|Ecuador|Bolivia|Cuba|Dominican Republic/i.test(country);
}
function radioCountryName(country:string,language:string):string {
  if(!language.toLowerCase().startsWith('es')) return country;
  const names:Record<string,string>={'United States':'Estados Unidos','United Kingdom':'Reino Unido','Canary Islands':'Islas Canarias','South Africa':'Sudáfrica','Germany':'Alemania','Italy':'Italia','France':'Francia','Spain':'España','Canada':'Canadá','Brazil':'Brasil','Japan':'Japón','Croatia':'Croacia','Finland':'Finlandia','Portugal':'Portugal','Romania':'Rumanía','Argentina':'Argentina','Thailand':'Tailandia','Austria':'Austria','Belgium':'Bélgica','Poland':'Polonia','Netherlands':'Países Bajos'};
  return names[country]||country;
}
// Memoria local de voces: evita que distintas estaciones suenen igual en llamadas consecutivas.
const recentAmbientVoiceUris = new Map<string,string[]>();
function chooseNaturalRadioVoice(voices:SpeechSynthesisVoice[], preferredGender:'male'|'female', allowGenderFallback=true):SpeechSynthesisVoice|undefined {
  const malePattern=/\\bmale\\b|david|mark|guy|daniel|james|george|ryan|christopher|brian|thomas|alexander|jorge|diego|pablo|carlos|miguel|luca|paolo|marco|giorgio|massimo|alessandro|federico|roberto|enrico|franco|stefano/i;
  const femalePattern=/\\bfemale\\b|zira|samantha|victoria|karen|susan|sara|sarah|anna|eva|lucia|monica|paulina|amelie|marie|helena|alice|joana|sofia|sophie|kate|emma|olivia|tessa|moira|fiona|female/i;
  const naturalPattern=/natural|neural|premium|enhanced|wavenet|studio|online/i;
  const key=(voices[0]?.lang||'default').toLowerCase().split(/[-_]/)[0]||'default';
  const recent=recentAmbientVoiceUris.get(key)||[];
  const gendered=voices.filter(v=>(preferredGender==='male'?malePattern:femalePattern).test(v.name+' '+v.voiceURI));
  // Para personajes masculinos no caer nunca en una voz identificada como femenina.
  const nonFemale=voices.filter(v=>!femalePattern.test(v.name+' '+v.voiceURI));
  const preferredPool=gendered.length?gendered:(preferredGender==='male'&&!allowGenderFallback?nonFemale:voices);
  const preferredNatural=preferredPool.filter(v=>naturalPattern.test(v.name+' '+v.voiceURI));
  const preferredChoices=preferredNatural.length?preferredNatural:preferredPool;
  let choices=preferredChoices.filter(v=>!recent.includes(v.voiceURI));
  // Si no hay otra voz de ese género, usa otra voz disponible antes de repetir.
  if(!choices.length && allowGenderFallback){
    const alternatives=voices.filter(v=>!recent.includes(v.voiceURI));
    const naturalAlternatives=alternatives.filter(v=>naturalPattern.test(v.name+' '+v.voiceURI));
    choices=naturalAlternatives.length?naturalAlternatives:alternatives;
  }
  if(!choices.length) choices=preferredChoices;
  if(!choices.length)return undefined;
  const selected=choices[Math.floor(Math.random()*choices.length)];
  recentAmbientVoiceUris.set(key,[selected.voiceURI,...recent.filter(uri=>uri!==selected.voiceURI)].slice(0,6));
  return selected;
}

import { ShareLanguageSelector } from './ShareLanguageSelector';
import { supabase } from '../services/supabaseClient';
import { flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type Participant = { callsign: string; status?: string; joinedAt?: string; visible?: boolean };
type Signal = {
  from: string; to: string; callsign: string; sessionId: string;
  kind: 'offer' | 'answer' | 'ice' | 'stop' | 'request';
  description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit;
};
type PeerEntry = { pc: RTCPeerConnection; audio: HTMLAudioElement; iceExpiresAt?: number | null; context?: AudioContext; rf?: GainNode; tone?: BiquadFilterNode; high?: BiquadFilterNode; low?: BiquadFilterNode; gate?: GainNode; analyser?: AnalyserNode; noiseGain?: GainNode; noiseSource?: AudioBufferSourceNode; qrmGain?: GainNode; qrmSource?: AudioBufferSourceNode; gateFrame?: number; disconnectTimer?: ReturnType<typeof setTimeout>; iceRestartAttempted?: boolean };
type Recording = { id: string; callsign: string; duration_ms: number; mime_type: string; created_at: string; url: string };
type QueueState = { ok: boolean; status?: 'transmitting' | 'queued' | 'listening'; active_callsign?: string | null; active_until?: string | null; queue_position?: number; queue?: { callsign: string }[]; reason?: string };

const createRadioNoise = (ctx: AudioContext, destination: AudioNode) => {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.55;
  const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
  const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 420; high.Q.value = 0.7;
  const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 3200; low.Q.value = 0.7;
  const gain = ctx.createGain(); gain.gain.value = 0.054;
  source.connect(high); high.connect(low); low.connect(gain); gain.connect(destination); source.start();
  return { source, gain };
};

const createRadioInterference = (ctx: AudioContext, destination: AudioNode) => {
  // A longer, irregular noise bed avoids the obvious five-second repeating dual-tone pattern.
  const duration = 24;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * duration, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let eventEnd = 0;
  let eventLevel = 0;
  let carrierHz = 650 + Math.random() * 1500;
  let phase = 0;
  for (let i = 0; i < data.length; i++) {
    if (i >= eventEnd) {
      const gap = ctx.sampleRate * (0.18 + Math.random() * 1.35);
      eventEnd = i + Math.floor(gap);
      eventLevel = Math.random() < 0.34 ? 0.55 + Math.random() * 0.45 : 0.08 + Math.random() * 0.28;
      carrierHz = 480 + Math.random() * 2050;
      phase = Math.random() * Math.PI * 2;
    }
    const t = i / ctx.sampleRate;
    const fade = Math.min(1, (eventEnd - i) / (ctx.sampleRate * 0.035));
    const slowFlutter = 0.72 + 0.28 * Math.sin(2 * Math.PI * (0.7 + (carrierHz % 13) / 10) * t + phase);
    const carrier = Math.sin(2 * Math.PI * carrierHz * t + phase) * 0.22;
    const sideTone = Math.sin(2 * Math.PI * (carrierHz * (1.18 + (phase % 0.12)) ) * t) * 0.08;
    const hiss = (Math.random() * 2 - 1) * 0.34;
    const crackle = Math.random() > 0.9992 ? (Math.random() * 2 - 1) * 0.9 : 0;
    data[i] = (carrier + sideTone + hiss + crackle) * eventLevel * slowFlutter * fade * 0.16;
  }
  const source = ctx.createBufferSource(); source.buffer = buffer; source.loop = true;
  const high = ctx.createBiquadFilter(); high.type = 'highpass'; high.frequency.value = 430; high.Q.value = 0.65;
  const low = ctx.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 2850; low.Q.value = 0.65;
  const gain = ctx.createGain(); gain.gain.value = 0.075;
  source.connect(high); high.connect(low); low.connect(gain); gain.connect(destination); source.start();
  return { source, gain };
};

const readCallsign = () => (
  localStorage.getItem('community_chat_active_callsign')
  || localStorage.getItem('community_chat_sd')
  || ''
).trim().toUpperCase();

const radioPreferenceKey = (name: string) => `lb_radio_${name}_${readCallsign() || 'default'}`;
const readRadioPreference = (name: string, fallback: number) => {
  const saved = localStorage.getItem(radioPreferenceKey(name));
  return saved === null ? fallback : Number(saved);
};

const identityTokenForDevice = () => {
  let token = localStorage.getItem('community_chat_identity_token') || '';
  if (!token) {
    token = crypto.randomUUID();
    localStorage.setItem('community_chat_identity_token', token);
  }
  return token;
};

const SuperstarMeter: React.FC<{ level: number; transmitting: boolean }> = ({ level, transmitting }) => {
  const normalized = Math.max(0, Math.min(1, level));
  const needleAngle = (-140 + normalized * 100) * Math.PI / 180;
  const needleX = 160 + Math.cos(needleAngle) * 91;
  const needleY = 108 + Math.sin(needleAngle) * 91;
  return (
    <div className="w-full max-w-[360px] rounded-md border-[5px] border-zinc-500 bg-zinc-900 p-1 shadow-[inset_0_0_14px_#000,0_5px_18px_#0008]">
      <svg viewBox="0 0 320 126" role="img" aria-label="Medidor analógico de aguja móvil estilo Superstar 3900. Escalas curvas SWR, CAL, RF y SIG; lectura de nivel de audio recibido o transmitido, no potencia RF calibrada." className="block w-full">
        <defs>
          <linearGradient id="ss3900-face" x2="0" y2="1"><stop stopColor="#17241b"/><stop offset="1" stopColor="#07110b"/></linearGradient>
          <linearGradient id="ss3900-glass" x2="0" y2="1"><stop stopColor="#fff" stopOpacity=".2"/><stop offset=".42" stopColor="#fff" stopOpacity="0"/><stop offset="1" stopColor="#000" stopOpacity=".2"/></linearGradient>
          <linearGradient id="ss3900-needle" x2="0" y2="1"><stop stopColor="#fff3d0"/><stop offset="1" stopColor="#d74335"/></linearGradient>
        </defs>
        <rect x="2" y="2" width="316" height="122" rx="5" fill="url(#ss3900-face)" stroke="#a8aaa3" strokeWidth="2"/>
        <rect x="12" y="12" width="296" height="99" rx="2" fill="#050b07" stroke="#687466" strokeWidth="1"/>
        <g fill="none" strokeLinecap="round">
          <path d="M24 96 Q160 4 296 96" stroke="#36c98a" strokeWidth="2.2"/>
          <path d="M35 99 Q160 24 285 99" stroke="#a6c96a" strokeWidth="1.8"/>
          <path d="M48 103 Q160 44 272 103" stroke="#36c98a" strokeWidth="1.8"/>
          <path d="M252 71 Q274 80 293 96" stroke="#ef5948" strokeWidth="3"/>
        </g>
        <g stroke="#8acb91" strokeWidth="1.1">
          {Array.from({length:11},(_,i)=>{const angle=(-140+i*10)*Math.PI/180;const x1=160+Math.cos(angle)*82;const y1=108+Math.sin(angle)*82;const x2=160+Math.cos(angle)*94;const y2=108+Math.sin(angle)*94;return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}/>;})}
        </g>
        <g fontFamily="Arial,sans-serif" fontWeight="bold" textAnchor="middle">
          <text x="34" y="38" fill="#36c98a" fontSize="9" letterSpacing=".7">SWR</text>
          <text x="86" y="26" fill="#36c98a" fontSize="9">1</text><text x="160" y="17" fill="#36c98a" fontSize="9">2</text><text x="234" y="26" fill="#36c98a" fontSize="9">3</text>
          <text x="286" y="44" fill="#ef5948" fontSize="9">CAL</text>
          <text x="40" y="72" fill="#a6c96a" fontSize="9">RF</text>
          <text x="81" y="55" fill="#a6c96a" fontSize="8">0</text><text x="121" y="43" fill="#a6c96a" fontSize="8">2</text><text x="160" y="39" fill="#a6c96a" fontSize="8">4</text><text x="199" y="43" fill="#a6c96a" fontSize="8">6</text><text x="239" y="55" fill="#a6c96a" fontSize="8">8</text><text x="278" y="72" fill="#a6c96a" fontSize="8">10</text>
          <text x="44" y="101" fill="#36c98a" fontSize="9">SIG</text>
          <text x="82" y="87" fill="#36c98a" fontSize="8">S1</text><text x="121" y="76" fill="#36c98a" fontSize="8">S3</text><text x="160" y="72" fill="#36c98a" fontSize="8">S5</text><text x="199" y="76" fill="#36c98a" fontSize="8">S7</text><text x="238" y="87" fill="#36c98a" fontSize="8">S9</text><text x="280" y="101" fill="#ef5948" fontSize="8">+30</text>
        </g>
        <line x1="160" y1="108" x2={needleX} y2={needleY} stroke="url(#ss3900-needle)" strokeWidth="2.7" strokeLinecap="round"/>
        <circle cx="160" cy="108" r="5.5" fill="#c7bda0" stroke="#3b3b35" strokeWidth="2"/>
        <circle cx="160" cy="108" r="1.8" fill="#f5e9c7"/>
        <rect x="12" y="12" width="296" height="99" rx="2" fill="url(#ss3900-glass)" pointerEvents="none"/>
        <text x="160" y="120" textAnchor="middle" fill={transmitting ? "#ff6b55" : "#9fd27c"} fontSize="7" letterSpacing="1">{transmitting ? "TX · AUDIO" : "RX · AUDIO"}</text>
      </svg>
    </div>
  );
};

const RadioKnob: React.FC<{label:string;value:number;onChange:(v:number)=>void}> = ({label,value,onChange}) => {
  const angle=-135+value*2.7;
  return <label className="flex min-w-0 flex-col items-center gap-1 text-center"><span className="max-w-full break-words text-[8px] font-black tracking-[.08em] text-amber-100 drop-shadow-[0_1px_2px_#000] sm:text-[9px] sm:tracking-widest">{label}</span><span className="relative block h-10 w-10 rounded-full sm:h-14 sm:w-14 border border-amber-100/30 bg-[radial-gradient(circle_at_32%_25%,#77736a,#33332f_48%,#090a08)] shadow-[inset_0_2px_5px_#ffffff35,0_5px_8px_#000b]"><span className="absolute inset-1 rounded-full border border-white/10 bg-[conic-gradient(from_220deg,#aaa69c,#292a26,#151612,#77736a)]"/><span className="absolute left-1/2 top-1/2 h-5 w-[3px] origin-[50%_100%] rounded-full bg-amber-200" style={{transform:'translate(-50%,-100%) rotate('+angle+'deg)'}}/><input aria-label={label} type="range" min="0" max="100" value={value} onChange={e=>onChange(Number(e.target.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0"/></span><span className="text-[10px] font-black text-amber-100 drop-shadow-[0_1px_2px_#000]">{value}%</span></label>;
};

export const LBComunica: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [backgroundEnabled, setBackgroundEnabled] = useState(false);
  const sessionActive = isOpen || backgroundEnabled;

  const [activeCallsign, setActiveCallsign] = useState(readCallsign);
  const [deviceToken, setDeviceToken] = useState('');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [connection, setConnection] = useState<'idle'|'connecting'|'connected'|'error'>('idle');
  const [mobileListOpen, setMobileListOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isTalking, setIsTalking] = useState(false);
  const [isQueued, setIsQueued] = useState(false);
  const [pttPending, setPttPending] = useState(false);
  const pttActionRef = useRef(false);
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
  const [ambientCall, setAmbientCall] = useState<any>(null);
  const ambientPlayedRef = useRef<Set<string>>(new Set());
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [playingIndex, setPlayingIndex] = useState(-1);
  const [playAll, setPlayAll] = useState(false);
  const [meterLevel, setMeterLevel] = useState(0.08);
  const meterFrameRef = useRef<number | null>(null);
  const [rfGain,setRfGain]=useState(()=>readRadioPreference('rf_gain',100));
  const [micGain,setMicGain]=useState(()=>Number(localStorage.getItem('lb_radio_mic_gain')||70));
  const [squelch,setSquelch]=useState(()=>Number(localStorage.getItem('lb_radio_squelch')||0));
  const [clarifier,setClarifier]=useState(()=>Number(localStorage.getItem('lb_radio_clarifier')||50));
  const [radioVolume,setRadioVolume]=useState(()=>readRadioPreference('volume',100));
  const [radioReceive,setRadioReceive]=useState(()=>localStorage.getItem('lb_radio_receive')!=='0');
  const [audioProfile,setAudioProfile]=useState<'radio'|'clean'>(()=>localStorage.getItem('lb_radio_audio_profile')==='clean'?'clean':'radio');
  const [panelLight,setPanelLight]=useState(()=>localStorage.getItem('lb_radio_panel_light')!=='0');
  const channelRef = useRef<any>(null);
  const streamRef = useRef<MediaStream|null>(null);
  const recorderRef = useRef<MediaRecorder|null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);
  const peerMapRef = useRef<Map<string,PeerEntry>>(new Map());
  const requestedTalkersRef = useRef<Set<string>>(new Set());
  const squelchRef=useRef(squelch);
  const audioProfileRef=useRef(audioProfile);
  const micContextRef=useRef<AudioContext|null>(null);
  const micGainRef=useRef<GainNode|null>(null);
  const processedMicRef=useRef<MediaStream|null>(null);
  const pendingIceRef = useRef<Map<string,RTCIceCandidateInit[]>>(new Map());
  const sessionRef = useRef('');
  const talkingRef = useRef(false);
  const beginningRef = useRef(false);
  const turnCancelledRef = useRef(false);
  const pttIntentRef = useRef(false);
  const audioPlayerRef = useRef<HTMLAudioElement|null>(null);
  const playbackObjectUrlRef = useRef<string>('');
  const playbackRequestRef = useRef(0);
  const playbackContextRef = useRef<AudioContext|null>(null);
  const playbackNodesRef = useRef<{tone:BiquadFilterNode;high:BiquadFilterNode;low:BiquadFilterNode;compressor:DynamicsCompressorNode;gate:GainNode;rf:GainNode;analyser:AnalyserNode;noiseGain:GainNode;noiseSource:AudioBufferSourceNode;qrmGain:GainNode;qrmSource:AudioBufferSourceNode;gateFrame:number|null}>({} as any);
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
      source.connect(high);high.connect(low);low.connect(tone);tone.connect(compressor);compressor.connect(analyser);analyser.connect(gate);gate.connect(rf);
      const noise=createRadioNoise(ctx,rf);const qrm=createRadioInterference(ctx,rf);rf.connect(ctx.destination);
      playbackContextRef.current=ctx;
      playbackNodesRef.current={tone,high,low,compressor,gate,rf,analyser,noiseGain:noise.gain,noiseSource:noise.source,qrmGain:qrm.gain,qrmSource:qrm.source,gateFrame:null};
    }catch{playbackContextRef.current=null;}
    return ()=>{
      const nodes=playbackNodesRef.current;
      if(nodes.gateFrame!==null&&nodes.gateFrame!==undefined)cancelAnimationFrame(nodes.gateFrame);
      try{nodes.noiseSource?.stop();nodes.noiseSource?.disconnect();nodes.noiseGain?.disconnect();nodes.qrmSource?.stop();nodes.qrmSource?.disconnect();nodes.qrmGain?.disconnect();}catch{}
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
    n.rf.gain.setTargetAtTime(radioReceive?Math.max(0.32,(rfGain/100)*(radioVolume/100)):0.32,now,.04);
    n.noiseGain.gain.setTargetAtTime(audioProfile==='radio'?(is11MeterStationIdentifier(activeCallsign)?0.070:0.054)-(squelch/100)*(is11MeterStationIdentifier(activeCallsign)?0.00034:0.00030):0,now,.18);
    n.qrmGain.gain.setTargetAtTime(audioProfile==='radio'?(is11MeterStationIdentifier(activeCallsign)?0.135:0.12):0,now,.2);
    if(n.gateFrame!==null)cancelAnimationFrame(n.gateFrame);
    const samples=new Uint8Array(n.analyser.fftSize);
    let voiceOpen=false;
    const updateGate=()=>{if(playbackContextRef.current!==ctx)return;n.analyser.getByteTimeDomainData(samples);let sum=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/samples.length);const threshold=0.0015+(squelch/100)*.018;if(squelch<=0)voiceOpen=true;else if(voiceOpen?rms<threshold*.85:rms>threshold*1.15)voiceOpen=!voiceOpen;n.gate.gain.setTargetAtTime(voiceOpen?1:0.32,ctx.currentTime,voiceOpen?0.02:0.18);
      n.noiseGain.gain.setTargetAtTime(audioProfile==='radio'?(voiceOpen?(is11MeterStationIdentifier(activeCallsign)?0.028:0.022):Math.max(is11MeterStationIdentifier(activeCallsign)?0.034:0.027,(is11MeterStationIdentifier(activeCallsign)?0.080:0.066)-squelch*(is11MeterStationIdentifier(activeCallsign)?0.00034:0.00030))):0,ctx.currentTime,voiceOpen?0.08:0.35);
      n.qrmGain.gain.setTargetAtTime(audioProfile==='radio'?(voiceOpen?(is11MeterStationIdentifier(activeCallsign)?0.052:0.045):(is11MeterStationIdentifier(activeCallsign)?0.135:0.12)):0,ctx.currentTime,voiceOpen?0.12:0.3);
      n.gateFrame=requestAnimationFrame(updateGate);};
    n.gateFrame=requestAnimationFrame(updateGate);
  },[audioProfile,rfGain,squelch,clarifier,radioVolume,radioReceive,isOpen,activeCallsign]);
  useEffect(()=>{squelchRef.current=squelch;},[squelch]);
  useEffect(()=>{audioProfileRef.current=audioProfile;},[audioProfile]);
  // Local-only simulated HF background stations. They are never connected to the mic,
  // peer streams, recordings, or room history; speech synthesis is intentionally subtle.
  useEffect(()=>{
    if(!sessionActive || connection!=='connected' || audioProfile!=='radio' || isTalking || activeSpeaker || remoteTalkers.length || participants.some(p=>p.status==='Transmitiendo')) {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel();
      return;
    }
    if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance==='undefined') return;
    const synth=window.speechSynthesis;
    let timer: ReturnType<typeof setTimeout> | null=null;
    let cancelled=false;
    const hamStations=[
      {call:'W1ABC',country:'United States'},
      {call:'VE3KLM',country:'Canada'},
      {call:'G4XYZ',country:'United Kingdom'},
      {call:'F4ABC',country:'France'},
      {call:'DL1ABC',country:'Germany'},
      {call:'I2XYZ',country:'Italy'},
      {call:'EA8ABC',country:'Canary Islands'},
      {call:'LU1ABC',country:'Argentina'},
      {call:'PY2ABC',country:'Brazil'},
      {call:'JA1ABC',country:'Japan'},
      {call:'VK3ABC',country:'Australia'},
      {call:'ZS6ABC',country:'South Africa'},
      {call:'W1YL',country:'United States',female:true},
      {call:'9A1ABC',country:'Croatia'},
      {call:'OH2ABC',country:'Finland'},
      {call:'CT1ABC',country:'Portugal'},
      {call:'YO3ABC',country:'Romania'},
      {call:'PA3ABC',country:'Netherlands'},
      {call:'SP5ABC',country:'Poland'},
      {call:'OE1ABC',country:'Austria'},
      {call:'ON4ABC',country:'Belgium'}
    ];
    const hamPhrases=[
      (call:string,country:string)=>`CQ CQ CQ, this is ${call} from ${country}, calling amateur radio stations worldwide.`,
      (call:string,country:string)=>`This is ${call}, ${country}, listening for any station. Please call me.`,
      (call:string,country:string)=>`CQ DX, CQ DX. ${call} from ${country}. Any station, please come back.`,
      (call:string,country:string)=>`${call} calling QRZ. I am listening on this frequency. Over.`,
      (call:string,country:string)=>`Good evening from ${country}. This is ${call}, standing by for a contact.`,
      (call:string,country:string)=>`Calling any amateur radio station. ${call}, ${country}, listening.`,
      (call:string,country:string)=>`CQ, CQ. This is ${call}. Is the frequency in use?`
    ];
    const hamSpanishPhrases=[
      (call:string,country:string)=>`CQ, CQ, CQ. Aquí ${call} desde ${country}, llamando a estaciones de radioaficionados. ¿Quién me copia?`,
      (call:string,country:string)=>`${call}, ${country}, llamando. Quedo a la escucha para cualquier estación. Adelante.`,
      (call:string,country:string)=>`CQ DX, CQ DX. ${call} desde ${country}. ¿Alguna estación por frecuencia? Cambio.`,
      (call:string,country:string)=>`Atención estaciones. Aquí ${call}, desde ${country}, llamando y a la escucha.`,
      (call:string,country:string)=>`¿Está ocupada la frecuencia? ${call}, ${country}, esperando indicativo.`
    ];
    const elevenMeterStations=[
      {call:'1AT 001',country:'Italy'},
      {call:'14RC 022',country:'France'},
      {call:'13EK 087',country:'Germany'},
      {call:'26CT 145',country:'United Kingdom'},
      {call:'30SD 004',country:'Spain'},
      {call:'19AT 210',country:'Netherlands'},
      {call:'34 RC 879',country:'Canary Islands',male:true},
      {call:'31ES 014',country:'Portugal'},
      {call:'4SD 215',country:'Argentina'},
      {call:'153AT 067',country:'Thailand'},
      {call:'35DX 118',country:'Austria'},
      {call:'16RC 305',country:'Belgium'},
      {call:'161DX 072',country:'Poland'},
      {call:'30YL 001',country:'Spain',female:true}
    ];
    const elevenMeterLines=[
      (call:string,country:string)=>`CQ eleven meters, CQ DX. This is ${call} from ${country}, calling worldwide. Any station, come back.`,
      (call:string,country:string)=>`Breaker, breaker. ${call}, ${country}. Calling stations around the world, standing by.`,
      (call:string,country:string)=>`CQ DX on twenty-seven five five five. ${call} from ${country}. Is anybody copying?`,
      (call:string,country:string)=>`This is ${call}, calling Europe and the world. Give me a call, please.`,
      (call:string,country:string)=>`Station calling DX, ${call} in ${country}. Listening for your signal report.`,
      (call:string,country:string)=>`Good evening, eleven-meter operators. ${call} from ${country}, mobile station standing by.`
    ];
    const elevenMeterSpanishLines=[
      (call:string,country:string)=>`CQ 11 metros, CQ DX. Aquí ${call} desde ${country}, llamando a estaciones de todo el mundo. ¿Quién me copia?`,
      (call:string,country:string)=>`Atención, atención. ${call}, ${country}, llamando a estaciones de 11 metros. Quedo a la escucha.`,
      (call:string,country:string)=>`CQ DX, CQ DX. Aquí ${call} desde ${country}. ¿Alguna estación por frecuencia? Cambio.`,
      (call:string,country:string)=>`${call}, ${country}, llamando a Europa y al mundo. Espero vuestra llamada.`,
      (call:string,country:string)=>`Estaciones de 11 metros, aquí ${call} desde ${country}, llamando y a la escucha.`
    ];
    const schedule=(delay:number)=>{if(!cancelled)timer=setTimeout(speak,delay);};
    const speak=()=>{
      const presenceNow=channelRef.current?.presenceState?.() || {};
      const roomPeers=Object.values(presenceNow).flat() as Participant[];
      const leaderToken=Object.keys(presenceNow).filter(key=>(presenceNow[key] as Participant[]).some(peer=>peer.visible!==false)).sort()[0];
      const roomTransmitting=roomPeers.some(peer=>peer.status==='Transmitiendo');
      if(cancelled || document.hidden || isTalking || activeSpeaker || remoteTalkers.length || roomTransmitting) { schedule(5000+Math.random()*7000); return; }
      if(leaderToken!==deviceToken) { schedule(1200+Math.random()*600); return; }
      const voices=synth.getVoices();
      const isElevenMeters=is11MeterStationIdentifier(activeCallsign);
      let phrase:string;
      let language='en-US';
      let available=voices.filter(v=>/^en([-_]|$)/i.test(v.lang));
      let ambientStation:{call:string;country:string;female?:boolean;male?:boolean}|null=null;
      if(isElevenMeters){
        ambientStation=elevenMeterStations[Math.floor(Math.random()*elevenMeterStations.length)];
        // 34 RC 879 (Islas Canarias / norte de África) llama siempre en castellano.
        const isCanaryNorthAfrica=ambientStation.call.replace(/\s+/g,'')==='34RC879';
        const useSpanish=isCanaryNorthAfrica || Math.random()<0.5;
        language=useSpanish?'es-ES':'en-US';
        const spokenCall=speak11mCallsign(ambientStation.call,language);
        const country=radioCountryName(ambientStation.country,language);
        const lines=useSpanish?elevenMeterSpanishLines:elevenMeterLines;
        phrase=isCanaryNorthAfrica
          ? 'Atenta frecuencia, atenta frecuencia. Treinta y cuatro división Islas Canarias, España, llama. Tres cuatro Romeo Charlie, ocho siete nueve. Islas Canarias, España, llama al noreste de África. Islas Canarias llama.'
          : lines[Math.floor(Math.random()*lines.length)](spokenCall,country);
        available=voices.filter(v=>v.lang.toLowerCase().startsWith(language.slice(0,2)));
      }else{
        ambientStation=hamStations[Math.floor(Math.random()*hamStations.length)];
        const useSpanish=isSpanishRadioCountry(ambientStation.country)&&Math.random()<0.5;
        language=useSpanish?'es-ES':'en-US';
        const spokenCall=prepareRadioSpeech(ambientStation.call,ambientStation.call,language);
        const country=radioCountryName(ambientStation.country,language);
        const lines=useSpanish?hamSpanishPhrases:hamPhrases;
        phrase=lines[Math.floor(Math.random()*lines.length)](spokenCall,country);
        available=voices.filter(v=>v.lang.toLowerCase().startsWith(language.slice(0,2)));
      }
      // De vez en cuando, una llamada identificativa potente y grave de Oscar Italia,
      // exclusiva de 11 metros. Es una estación ambiental ficticia, no una transmisión real.
      const specialRoll=ambientStation?.call.replace(/\s+/g,'')==='34RC879'?1:Math.random();
      const oscarItalia=isElevenMeters && specialRoll<0.24;
      const comandante=isElevenMeters && specialRoll>=0.24 && specialRoll<0.42;
      const primoItalia=isElevenMeters && specialRoll>=0.42 && specialRoll<0.52;
      if(oscarItalia){
        // Oscar conserva la frase española, pero usa voz italiana si el dispositivo la ofrece.
        const italian=voices.filter(v=>/^it([-_]|$)/i.test(v.lang));
        const spanish=voices.filter(v=>/^es([-_]|$)/i.test(v.lang));
        const oscarLines=[
          '¡Oscar Italia!... La estación más fuerte del mundo está llamando.',
          '¡Cuerrido amigo!... ¡Vamos, vamos!... ¡Oscar te escucha muy bon!'
        ];
        phrase=oscarLines[Math.floor(Math.random()*oscarLines.length)];
        // El personaje habla en castellano con una voz masculina grave; no forzamos
        // una voz italiana leyendo español porque suele producir una dicción artificial.
        language='es-ES';
        available=spanish.length?spanish:voices;
      } else if(primoItalia){
        phrase='Primo Italia, Primo Italia! Qui è Primo Italia in frequenza. Un saluto a tutti gli amici. Ciao, ciao!';
        language='it-IT';
        const italianVoices=voices.filter(v=>/^it([-_]|$)/i.test(v.lang));
        available=italianVoices.length?italianVoices:voices;
      } else if(comandante){
        const appLang=getInitialAppLanguage();
        const commanderLines:Partial<Record<AppLanguage,string>>={
          es:'¡Atención, atención!... Aquí el Comandante. / ¡Tonto, que eres tonto!... ¡Te lo digo yo, el Comandante!',
          en:'Attention, attention! This is the Commander. You fool, are you really that foolish? The Commander told you so!',
          pt:'Atenção, atenção! Aqui é o Comandante. Tonto, és mesmo tonto. Eu, o Comandante, é que te digo!',
          'pt-br':'Atenção, atenção! Aqui é o Comandante. Tonto, você é muito tonto. Estou dizendo, eu sou o Comandante!',
          it:'Attenzione, attenzione! Qui è il Comandante. Sciocco, sei proprio sciocco. Te lo dice il Comandante!',
          fr:'Attention, attention! Ici le Commandant. Idiot, tu es vraiment idiot. C’est moi, le Commandant, qui te le dis!',
          de:'Achtung, Achtung! Hier spricht der Kommandant. Du Dummkopf, bist du wirklich so dumm? Das sagt dir der Kommandant!',
          nl:'Attentie, attentie! Hier spreekt de Commandant. Domoor, ben je echt zo dom? Dat zegt de Commandant!',
          pl:'Uwaga, uwaga! Tu Komendant. Głupcze, ale z ciebie głupiec. Mówi ci to sam Komendant!',
          ru:'Внимание, внимание! Говорит Командир. Ну ты и глупец! Это тебе говорит сам Командир!',
          uk:'Увага, увага! Говорить Командир. Ну й дурню ж ти! Це тобі каже сам Командир!',
          zh:'注意，注意！这里是指挥官。你这个傻瓜，真是个傻瓜！这是指挥官告诉你的！',
          ja:'こちら司令官。注意、注意！まったく、君は本当におバカだな。司令官からの忠告だ！',
          ko:'주목, 주목! 여기는 사령관이다. 이 바보야, 정말 바보구나! 사령관이 하는 말이다!',
          ar:'انتباه، انتباه! معكم القائد. يا لك من أحمق! أنا القائد وأقول لك ذلك!',
          hi:'ध्यान दें, ध्यान दें! कमांडर बोल रहा है। अरे मूर्ख, तुम सच में मूर्ख हो! यह कमांडर कह रहा है!',
          tr:'Dikkat, dikkat! Komutan konuşuyor. Seni aptal, gerçekten aptalsın! Bunu sana Komutan söylüyor!',
          sv:'Hallå, hallå! Här talar Kommendören. Din tok, är du verkligen så tokig? Det säger Kommendören!',
          no:'Hallo, hallo! Dette er Kommandanten. Din tosk, er du virkelig så dum? Det sier Kommandanten!',
          da:'Hallo, hallo! Her taler Kommandanten. Din tåbe, er du virkelig så dum? Det siger Kommandanten!',
          fi:'Huomio, huomio! Täällä komentaja. Senkin hölmö, oletpa todella hölmö! Näin sanoo komentaja!',
          cs:'Pozor, pozor! Tady velitel. Ty hlupáku, ty jsi ale hlupák. To ti říká velitel!',
          el:'Προσοχή, προσοχή! Εδώ ο Διοικητής. Ανόητε, είσαι πραγματικά ανόητος! Στο λέει ο Διοικητής!',
          ro:'Atenție, atenție! Aici Comandantul. Prostule, chiar ești prost. Ți-o spune Comandantul!',
          hu:'Figyelem, figyelem! Itt a Parancsnok. Te bolond, tényleg bolond vagy! Ezt a Parancsnok mondja!',
          id:'Perhatian, perhatian! Ini Komandan. Dasar bodoh, memang bodoh! Ini Komandan yang mengatakannya!',
          th:'โปรดทราบ โปรดทราบ! นี่คือผู้บัญชาการ เจ้าโง่เอ๊ย โง่จริง ๆ! ผู้บัญชาการบอกเอง!'
        };
        const commanderOptions=(commanderLines[appLang]||commanderLines.en!).split(' / ');
        phrase=commanderOptions[Math.floor(Math.random()*commanderOptions.length)];
        language=appLang==='pt-br'?'pt-BR':appLang==='zh'?'zh-CN':appLang==='ja'?'ja-JP':appLang==='ko'?'ko-KR':appLang==='ar'?'ar-SA':appLang==='hi'?'hi-IN':appLang==='th'?'th-TH':appLang==='sv'?'sv-SE':appLang==='no'?'nb-NO':appLang==='da'?'da-DK':appLang==='fi'?'fi-FI':appLang==='cs'?'cs-CZ':appLang==='el'?'el-GR':appLang==='ro'?'ro-RO':appLang==='hu'?'hu-HU':appLang==='id'?'id-ID':appLang==='uk'?'uk-UA':appLang==='ru'?'ru-RU':appLang==='pl'?'pl-PL':appLang==='nl'?'nl-NL':appLang==='de'?'de-DE':appLang==='fr'?'fr-FR':appLang==='it'?'it-IT':appLang==='pt'?'pt-PT':appLang==='en'?'en-US':'es-ES';
        const langPrefix=language.slice(0,2).toLowerCase();
        const localizedVoices=voices.filter(v=>v.lang.toLowerCase().startsWith(langPrefix));
        available=localizedVoices.length?localizedVoices:voices;
      }
      const femaleStation=!!ambientStation?.female;
      const spokenPhrase=prepareRadioSpeech(phrase,'',language);
      const utterance=new SpeechSynthesisUtterance(spokenPhrase);
      // Preferir voces masculinas cuando el dispositivo las ofrece; los nombres varían por sistema.
      const maleStation=!!ambientStation?.male;
       const gender: 'male'|'female' = (comandante||oscarItalia||primoItalia||maleStation) ? 'male' : (femaleStation ? 'female' : (Math.random()<0.5?'male':'female'));
      const voicePool=comandante||oscarItalia||primoItalia ? (voices.filter(v=>v.lang.toLowerCase().startsWith(language.slice(0,2).toLowerCase())).length?voices.filter(v=>v.lang.toLowerCase().startsWith(language.slice(0,2).toLowerCase())):voices) : available;
      const selectedVoice=chooseNaturalRadioVoice(voicePool,gender,!(comandante||oscarItalia||primoItalia||maleStation));
      if(selectedVoice) utterance.voice=selectedVoice;
      utterance.lang=language;
      // Prosodia menos de lectura: ritmo conversacional, pequeñas variaciones y pausas.
      // El tono del Comandante se conserva; Oscar usa una voz más grave sin hundir el pitch.
      utterance.rate=comandante?0.95+Math.random()*0.04:oscarItalia?0.86+Math.random()*0.08:primoItalia?0.88+Math.random()*0.08:0.90+Math.random()*0.10;
      utterance.pitch=comandante?0.78:oscarItalia?0.62+Math.random()*0.08:primoItalia?0.58+Math.random()*0.04:maleStation?0.76+Math.random()*0.06:0.88+Math.random()*0.14;
      // Señal variable pero siempre inteligible: la distancia cambia el nivel, no deforma la voz.
      // RF GAIN, VOLUME y RX ATENUADA también actúan sobre las llamadas ambientales.
      const distanceLevel=0.42+Math.random()*0.58;
      const receiverLevel=Math.max(0.06,Math.min(1,(radioVolume/100)*(rfGain/100)))*(radioReceive?1:0.35);
      const characterLevel=oscarItalia?0.82:comandante?0.78:primoItalia?0.72:1;
      const sharedSignalLevel=Math.max(0.08,Math.min(1,distanceLevel*characterLevel));
      utterance.volume=Math.max(0.04,Math.min(1,sharedSignalLevel*receiverLevel));
      void channelRef.current?.send({type:'broadcast',event:'ambient-call',payload:{room:is11MeterStationIdentifier(activeCallsign)?'11m':'ham',origin:deviceToken,eventId:crypto.randomUUID(),phrase,language,callsign:ambientStation?.call||'',signalLevel:sharedSignalLevel,style:oscarItalia?'oscar':comandante?'commander':primoItalia?'primo':maleStation?'station-male':'station',voiceGender:gender,startedAt:Date.now()+220}});
      const next=()=>{setMeterLevel(0.04);schedule(650+Math.random()*1400);};
      utterance.onstart=()=>{setMeterLevel(primoItalia?0.82+Math.random()*0.16:comandante?0.82:oscarItalia?0.62+Math.random()*0.38:0.72);};
      utterance.onboundary=(event)=>{const syllableStrength=Math.min(1,0.72+Math.min(20,event.charLength||8)*0.014);setMeterLevel(syllableStrength);};
      utterance.onend=next;
      utterance.onerror=next;
      synth.speak(utterance);
    };
    schedule(700+Math.random()*1100);
    return ()=>{cancelled=true;if(timer)clearTimeout(timer);synth.cancel();};
  },[sessionActive,connection,audioProfile,isTalking,activeSpeaker,remoteTalkers.length,participants.some(p=>p.status==='Transmitiendo'),radioVolume,rfGain,radioReceive,activeCallsign,deviceToken]);

  // Play the same room-wide call on every device. Spoken text and timing are shared;
  // each receiver uses its own installed voice and local RF/volume controls.
  useEffect(()=>{
    if(!ambientCall || ambientCall.room!==(is11MeterStationIdentifier(activeCallsign)?'11m':'ham') || !sessionActive || connection!=='connected' || audioProfile!=='radio') return;
    const eventId=String(ambientCall.eventId||'');
    if(eventId && ambientPlayedRef.current.has(eventId)) return;
    if(isTalking || activeSpeaker || remoteTalkers.length || participants.some(p=>p.status==='Transmitiendo')) {
      if(eventId) ambientPlayedRef.current.add(eventId);
      if('speechSynthesis' in window) window.speechSynthesis.cancel();
      return;
    }
    if(!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance==='undefined') return;
    const delay=Math.max(0,Math.min(1200,Number(ambientCall.startedAt||Date.now())-Date.now()));
    let cancelled=false;
    const timer=window.setTimeout(()=>{
      if(cancelled || isTalking || activeSpeaker || remoteTalkers.length || participants.some(p=>p.status==='Transmitiendo')) { if(eventId) ambientPlayedRef.current.add(eventId); return; }
      if(eventId) ambientPlayedRef.current.add(eventId);
      const synth=window.speechSynthesis;
      const spokenPhrase=prepareRadioSpeech(String(ambientCall.phrase||''),String(ambientCall.callsign||''),String(ambientCall.language||'en-US'));
      const utterance=new SpeechSynthesisUtterance(spokenPhrase);
      utterance.lang=String(ambientCall.language||'en-US');
      const voices=synth.getVoices();
      const prefix=utterance.lang.slice(0,2).toLowerCase();
      const available=voices.filter(v=>v.lang.toLowerCase().startsWith(prefix));
      const maleStation=ambientCall.style==='station-male';
      const gender: 'male'|'female' = (ambientCall.style==='commander'||ambientCall.style==='oscar'||ambientCall.style==='primo'||maleStation)?'male':(ambientCall.voiceGender==='female'?'female':ambientCall.voiceGender==='male'?'male':(Math.random()<0.5?'male':'female'));
      const selectedVoice=chooseNaturalRadioVoice(available.length?available:voices,gender,!(ambientCall.style==='commander'||ambientCall.style==='oscar'||ambientCall.style==='primo'||maleStation));
      if(selectedVoice) utterance.voice=selectedVoice;
      const localLevel=Math.max(0.06,Math.min(1,(radioVolume/100)*(rfGain/100)))*(radioReceive?1:0.35);
      utterance.volume=Math.max(0.04,Math.min(1,Number(ambientCall.signalLevel||0.5)*localLevel));
      utterance.rate=ambientCall.style==='commander'?0.96:ambientCall.style==='oscar'?0.91:0.96;
      utterance.pitch=ambientCall.style==='commander'?0.78:ambientCall.style==='oscar'?0.66:ambientCall.style==='primo'?0.74:maleStation?0.76:0.96;
      utterance.onstart=()=>setMeterLevel(0.72*Number(ambientCall.signalLevel||0.5));
      utterance.onend=()=>setMeterLevel(0.04);
      utterance.onerror=()=>setMeterLevel(0.04);
      synth.speak(utterance);
    },delay);
    return ()=>{cancelled=true;window.clearTimeout(timer);};
  },[ambientCall,activeCallsign,sessionActive,connection,audioProfile,isTalking,activeSpeaker,remoteTalkers.length,participants,radioVolume,rfGain,radioReceive]);

  // Continuous static, QRM and QRN in both rooms; it ducks while an operator transmits.
  useEffect(()=>{
    if(!sessionActive || connection!=='connected' || audioProfile!=='radio') return;
    const Ctor=window.AudioContext||(window as any).webkitAudioContext;
    if(!Ctor) return;
    let ctx:AudioContext;
    try{ctx=new Ctor();}catch{return;}
    const noise=createRadioNoise(ctx,ctx.destination);
    const qrm=createRadioInterference(ctx,ctx.destination);
    let timer:number|null=null;
    const update=()=>{
      const state=channelRef.current?.presenceState?.()||{};
      const peers=Object.values(state).flat() as Participant[];
      const transmitting=isTalking||!!activeSpeaker||remoteTalkers.length>0||peers.some(p=>p.status==='Transmitiendo');
      const localLevel=Math.max(0.05,Math.min(1,(radioVolume/100)*(rfGain/100)))*(radioReceive?1:0.35);
      const duck=transmitting?0.22:1;
      const eleven=is11MeterStationIdentifier(activeCallsign);
      noise.gain.gain.setTargetAtTime((eleven?0.052:0.034)*localLevel*duck,ctx.currentTime,0.18);
      qrm.gain.gain.setTargetAtTime((eleven?0.092:0.064)*localLevel*duck,ctx.currentTime,0.22);
    };
    void ctx.resume();update();timer=window.setInterval(update,300);
    return ()=>{if(timer)clearInterval(timer);try{noise.source.stop();qrm.source.stop();noise.source.disconnect();qrm.source.disconnect();noise.gain.disconnect();qrm.gain.disconnect();}catch{}void ctx.close().catch(()=>{});};
  },[sessionActive,connection,audioProfile,isTalking,activeSpeaker,remoteTalkers.length,participants,activeCallsign,radioVolume,rfGain,radioReceive]);

  // Distant environmental dog barks: local ambience only, never sent or recorded.
  useEffect(()=>{
    if(!sessionActive || connection!=='connected' || audioProfile!=='radio' || isTalking || activeSpeaker || remoteTalkers.length) return;
    const Ctor=window.AudioContext||(window as any).webkitAudioContext;
    if(!Ctor) return;
    let ctx:AudioContext;
    try{ctx=new Ctor();}catch{return;}
    let cancelled=false;
    let timer:ReturnType<typeof setTimeout>|null=null;
    const bark=()=>{
      if(cancelled||document.hidden||isTalking||activeSpeaker||remoteTalkers.length){schedule(18000+Math.random()*30000);return;}
      const now=ctx.currentTime;
      const duration=.24+Math.random()*.12;
      const length=Math.ceil(ctx.sampleRate*duration);
      const buffer=ctx.createBuffer(1,length,ctx.sampleRate);
      const data=buffer.getChannelData(0);
      for(let i=0;i<length;i++){
        const t=i/length;
        const envelope=Math.pow(Math.sin(Math.PI*t),1.3)*(1-t*.45);
        data[i]=(Math.random()*2-1)*envelope;
      }
      const source=ctx.createBufferSource();source.buffer=buffer;
      const band=ctx.createBiquadFilter();band.type='bandpass';band.frequency.value=520+Math.random()*260;band.Q.value=.7;
      const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=1450;
      const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.018+Math.random()*.008,now+.035);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      source.connect(band);band.connect(low);low.connect(gain);gain.connect(ctx.destination);
      source.start(now);source.stop(now+duration+.02);
      source.onended=()=>{try{source.disconnect();band.disconnect();low.disconnect();gain.disconnect();}catch{}};
      // Occasionally a second, slightly quieter bark follows the first.
      if(Math.random()<.58){
        const delay=.28+Math.random()*.42;
        timer=setTimeout(()=>{if(!cancelled)barkSingle();},delay*1000);
      }else schedule(55000+Math.random()*95000);
    };
    const barkSingle=()=>{
      if(cancelled||ctx.state==='closed')return;
      const now=ctx.currentTime,duration=.20+Math.random()*.13,length=Math.ceil(ctx.sampleRate*duration);
      const buffer=ctx.createBuffer(1,length,ctx.sampleRate),data=buffer.getChannelData(0);
      for(let i=0;i<length;i++){const t=i/length;data[i]=(Math.random()*2-1)*Math.pow(Math.sin(Math.PI*t),1.35);}
      const source=ctx.createBufferSource();source.buffer=buffer;
      const band=ctx.createBiquadFilter();band.type='bandpass';band.frequency.value=480+Math.random()*300;band.Q.value=.75;
      const low=ctx.createBiquadFilter();low.type='lowpass';low.frequency.value=1350;
      const gain=ctx.createGain();gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(.013+Math.random()*.006,now+.03);gain.gain.exponentialRampToValueAtTime(.0001,now+duration);
      source.connect(band);band.connect(low);low.connect(gain);gain.connect(ctx.destination);source.start(now);source.stop(now+duration+.02);
      source.onended=()=>{try{source.disconnect();band.disconnect();low.disconnect();gain.disconnect();}catch{}};
      schedule(65000+Math.random()*105000);
    };
    const schedule=(delay:number)=>{if(!cancelled)timer=setTimeout(bark,delay);};
    schedule(35000+Math.random()*55000);
    return ()=>{cancelled=true;if(timer)clearTimeout(timer);void ctx.close().catch(()=>{});};
  },[sessionActive,connection,audioProfile,isTalking,activeSpeaker,remoteTalkers.length]);

  useEffect(()=>{localStorage.setItem('lb_radio_audio_profile',audioProfile);},[audioProfile]);
  useEffect(()=>{localStorage.setItem(radioPreferenceKey('rf_gain'),String(rfGain));localStorage.setItem(radioPreferenceKey('volume'),String(radioVolume));localStorage.setItem('lb_radio_mic_gain',String(micGain));localStorage.setItem('lb_radio_squelch',String(squelch));localStorage.setItem('lb_radio_clarifier',String(clarifier));},[rfGain,micGain,squelch,clarifier,radioVolume]);
  useEffect(()=>{localStorage.setItem('lb_radio_receive',radioReceive?'1':'0');},[radioReceive]);
  useEffect(()=>{localStorage.setItem('lb_radio_panel_light',panelLight?'1':'0');},[panelLight]);
  useEffect(()=>{localStorage.setItem('lb_comunica_ptt_mode',pttMode);},[pttMode]);
  useEffect(()=>{if(micGainRef.current)micGainRef.current.gain.setTargetAtTime(micGain/70,micGainRef.current.context.currentTime,.04);for(const entry of peerMapRef.current.values()){if(entry.rf)entry.rf.gain.setTargetAtTime(radioReceive?Math.max(0.32,(rfGain/100)*(radioVolume/100)):0.32,entry.context?.currentTime||0,.04);if(entry.noiseGain)entry.noiseGain.gain.setTargetAtTime(audioProfile==='radio'?(isElevenMeters?0.070:0.054)-(squelch/100)*(isElevenMeters?0.00034:0.00030):0,entry.context?.currentTime||0,.18);if(entry.qrmGain)entry.qrmGain.gain.setTargetAtTime(audioProfile==='radio'?(isElevenMeters?0.135:0.12):0,entry.context?.currentTime||0,.2);if(entry.tone){entry.tone.frequency.setTargetAtTime(1450+(clarifier-50)*12,entry.context?.currentTime||0,.08);entry.tone.gain.setTargetAtTime(audioProfile==='radio'?1.2+((clarifier-50)/50)*1.2:0,entry.context?.currentTime||0,.08);}if(entry.high)entry.high.frequency.setTargetAtTime(audioProfile==='radio'?220:10,entry.context?.currentTime||0,.08);if(entry.low)entry.low.frequency.setTargetAtTime(audioProfile==='radio'?3400:20000,entry.context?.currentTime||0,.08);}},[rfGain,micGain,squelch,clarifier,radioVolume,radioReceive,audioProfile,activeCallsign]);

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
    const channel = channelRef.current;
    if (!channel) throw new Error('Canal de señalización no disponible.');
    let lastStatus = 'error';
    for (let attempt = 0; attempt < 3; attempt++) {
      lastStatus = await channel.send({ type: 'broadcast', event: 'signal', payload });
      if (lastStatus === 'ok') return;
      if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
    }
    throw new Error('No se pudo entregar la señal WebRTC (' + lastStatus + ').');
  };

  const closePeer = (key: string) => {
    const entry = peerMapRef.current.get(key);
    if (!entry) return;
    if (entry.disconnectTimer) clearTimeout(entry.disconnectTimer);
    entry.disconnectTimer = undefined;
    entry.pc.ontrack = null;
    entry.pc.onicecandidate = null;
    entry.pc.oniceconnectionstatechange = null;
    entry.pc.onconnectionstatechange = null;
    entry.pc.onsignalingstatechange = null;
    entry.pc.close();
    if(entry.gateFrame)cancelAnimationFrame(entry.gateFrame);
    try{entry.noiseSource?.stop();entry.noiseSource?.disconnect();entry.noiseGain?.disconnect();entry.qrmSource?.stop();entry.qrmSource?.disconnect();entry.qrmGain?.disconnect();}catch{}
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

  const createPeer = async (peerId: string, sessionId: string, callsign: string): Promise<RTCPeerConnection> => {
    const key = peerId + ':' + sessionId;
    const old = peerMapRef.current.get(key);
    if (old) return old.pc;
    const connectionIceServers = iceServersRef.current;
    let iceExpiresAt: number | null = null;
    // Every peer starts with STUN only; TURN is requested only for this peer after ICE recovery is needed.
    const pc = new RTCPeerConnection({ iceServers: connectionIceServers });
    const audio = new Audio();
    audio.autoplay = true;
    audio.setAttribute('playsinline', '');
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
        const rf=ctx.createGain();rf.gain.value=radioReceive?Math.max(0.32,(rfGain/100)*(radioVolume/100)):0.32;
        const dest=ctx.createMediaStreamDestination();
        const outputAnalyser=ctx.createAnalyser();outputAnalyser.fftSize=512;
        source.connect(high);high.connect(low);low.connect(tone);tone.connect(compressor);compressor.connect(analyser);analyser.connect(gate);gate.connect(rf);
        const noise=createRadioNoise(ctx,rf);const qrm=createRadioInterference(ctx,rf);noise.gain.gain.value=isElevenMeters?0.070:0.054;qrm.gain.gain.value=isElevenMeters?0.135:0.12;rf.connect(outputAnalyser);outputAnalyser.connect(dest);
        audio.srcObject=dest.stream;
        const entry=peerMapRef.current.get(key);
        if(entry){entry.context=ctx;entry.rf=rf;entry.tone=tone;entry.high=high;entry.low=low;entry.gate=gate;entry.analyser=analyser;entry.noiseGain=noise.gain;entry.noiseSource=noise.source;entry.qrmGain=qrm.gain;entry.qrmSource=qrm.source;}
        const samples=new Uint8Array(analyser.fftSize);const meterSamples=new Uint8Array(outputAnalyser.fftSize);
        let voiceOpen=false;let lastMeterUpdate=0;let lastAnalysisUpdate=0;let meterEnvelope=0;
        const loop=()=>{const current=peerMapRef.current.get(key);if(!current||current.context!==ctx)return;const now=performance.now();if(now-lastAnalysisUpdate<50){current.gateFrame=requestAnimationFrame(loop);return;}lastAnalysisUpdate=now;analyser.getByteTimeDomainData(samples);let sum=0;for(let i=0;i<samples.length;i++){const v=(samples[i]-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/samples.length);outputAnalyser.getByteTimeDomainData(meterSamples);let meterSum=0;for(let i=0;i<meterSamples.length;i++){const v=(meterSamples[i]-128)/128;meterSum+=v*v;}const meterRms=Math.sqrt(meterSum/meterSamples.length);const target=Math.min(1,Math.max(0,(meterRms-0.008)*16));meterEnvelope += (target-meterEnvelope)*(target>meterEnvelope?0.48:0.16);if(now-lastMeterUpdate>45){setMeterLevel(meterEnvelope);lastMeterUpdate=now;}const level=squelchRef.current;const threshold=0.0015+(level/100)*.018;if(level<=0)voiceOpen=true;else if(voiceOpen?rms<threshold*.85:rms>threshold*1.15)voiceOpen=!voiceOpen;gate.gain.setTargetAtTime(voiceOpen?1:0.32,ctx.currentTime,voiceOpen?0.02:0.18);
          noise.gain.gain.setTargetAtTime(audioProfileRef.current==='radio'?(voiceOpen?(isElevenMeters?0.007:0.005):Math.max(isElevenMeters?0.035:0.025,(isElevenMeters?0.060:0.048)-level*(isElevenMeters?0.00030:0.00023))):0,ctx.currentTime,voiceOpen?0.06:0.35);
          qrm.gain.gain.setTargetAtTime(audioProfileRef.current==='radio'?(voiceOpen?(isElevenMeters?0.012:0.008):(isElevenMeters?0.095:0.072)):0,ctx.currentTime,voiceOpen?0.08:0.3);
          current.gateFrame=requestAnimationFrame(loop);};
        const current=peerMapRef.current.get(key);if(current)current.gateFrame=requestAnimationFrame(loop);
        const processedStream=dest.stream;
        if(ctx.state!=='running') {
          audio.srcObject=remote;
          void ctx.resume().then(()=>{
            if(ctx.state==='running' && audio.srcObject===remote) audio.srcObject=processedStream;
          }).catch(()=>{ audio.srcObject=remote; });
        }
      } catch { audio.srcObject=remote;audio.volume=radioReceive?Math.max(0.32,radioVolume/100):0.32; }
      void audio.play().catch(()=>setPttError('Toca la pantalla para permitir la reproducción del audio recibido.'));
      setRemoteTalkers(current=>current.includes(callsign)?current:[...current,callsign]);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) void sendSignal({
        from: deviceToken, to: peerId, callsign: activeCallsign, sessionId,
        kind: 'ice', candidate: event.candidate.toJSON(),
      }).catch(error => console.warn('LB COMUNICACION ICE signal:', error));
    };
    const restartIceConnection = async () => {
      const entry = peerMapRef.current.get(key);
      if (!entry || entry.iceRestartAttempted || pc.connectionState === 'closed') return;
      entry.iceRestartAttempted = true;
      if (entry.disconnectTimer) clearTimeout(entry.disconnectTimer);
      entry.disconnectTimer = setTimeout(() => {
        entry.disconnectTimer = undefined;
        if (pc.connectionState !== 'connected') {
          closePeer(key);
          setRemoteTalkers(current => current.filter(call => call !== callsign));
        }
      }, 20000);
      try {
        const expiresSoon = !entry.iceExpiresAt || entry.iceExpiresAt <= Date.now() + 60_000;
        if (expiresSoon) {
          const freshIce = await api('ice');
          const refreshedServers = Array.isArray(freshIce.iceServers)
            ? freshIce.iceServers.filter((server: RTCIceServer) => !!server?.urls)
            : [];
          if (refreshedServers.length) {
            pc.setConfiguration({ ...pc.getConfiguration(), iceServers: refreshedServers });
            entry.iceExpiresAt = freshIce.expiresAt ? Date.parse(freshIce.expiresAt) : null;
          }
        }
        // Espera a que termine cualquier negociación de oferta/respuesta antes del ICE restart.
        if (pc.signalingState !== 'stable') {
          entry.iceRestartAttempted = false;
          return;
        }
        // Renegocia ICE antes de abandonar una sesión que sufrió un corte transitorio.
        const offer = await pc.createOffer({ iceRestart: true });
        await pc.setLocalDescription(offer);
        await sendSignal({ from: deviceToken, to: peerId, callsign: activeCallsign, sessionId, kind: 'offer', description: pc.localDescription?.toJSON() });
      } catch (error) {
        console.warn('LB COMUNICACION ICE restart:', error);
      }
    };
    const handlePeerState = (state: string) => {
      const entry = peerMapRef.current.get(key);
      if (!entry) return;
      if (state === 'connected' || state === 'completed') {
        if (entry.disconnectTimer) clearTimeout(entry.disconnectTimer);
        entry.disconnectTimer = undefined;
        entry.iceRestartAttempted = false;
        return;
      }
      if (state === 'disconnected') {
        // Las redes Wi-Fi pueden perder paquetes unos segundos; no cerrar el audio enseguida.
        if (!entry.disconnectTimer) entry.disconnectTimer = setTimeout(() => {
          entry.disconnectTimer = undefined;
          if (pc.connectionState === 'disconnected' || pc.iceConnectionState === 'disconnected') {
            void restartIceConnection();
          }
        }, 4000);
        return;
      }
      if (state === 'failed') {
        void restartIceConnection();
        return;
      }
      if (state === 'closed') {
        closePeer(key);
        setRemoteTalkers(current => current.filter(call => call !== callsign));
      }
    };
    pc.oniceconnectionstatechange = () => handlePeerState(pc.iceConnectionState);
    pc.onconnectionstatechange = () => handlePeerState(pc.connectionState);
    pc.onsignalingstatechange = () => {
      const current = peerMapRef.current.get(key);
      if (current && pc.signalingState === 'stable' && !current.iceRestartAttempted
        && (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected')) {
        void restartIceConnection();
      }
    };
    peerMapRef.current.set(key,{pc,audio,iceExpiresAt});
    return pc;
  };

  const acceptSignal = async (payload: Signal) => {
    if (payload.to !== deviceToken || payload.from === deviceToken) return;
    const key = payload.from + ':' + payload.sessionId;
    try {
      if (payload.kind === 'stop') {
        closePeer(key);
        setRemoteTalkers((current) => current.filter((call) => call !== payload.callsign));
      } else if (payload.kind === 'request') {
        // Un operador acaba de entrar mientras este equipo ya transmite.
        // Abrimos un enlace de audio nuevo hacia ese participante sin esperar otro PTT.
        if (!talkingRef.current && !beginningRef.current) return;
        const transmitStream = processedMicRef.current || streamRef.current;
        if (!transmitStream || !sessionRef.current) return;
        const outgoingKey = payload.from + ':' + sessionRef.current;
        if (peerMapRef.current.has(outgoingKey)) return;
        const outgoing = await createPeer(payload.from,sessionRef.current, String(payload.callsign||''));
        transmitStream.getAudioTracks().forEach(track=>outgoing.addTrack(track,transmitStream));
        const offer = await outgoing.createOffer();
        await outgoing.setLocalDescription(offer);
        await sendSignal({from:deviceToken,to:payload.from,callsign:activeCallsign,sessionId:sessionRef.current,kind:'offer',description:outgoing.localDescription?.toJSON()});
      } else if (payload.kind === 'offer' && payload.description) {
        const pc = await createPeer(payload.from,payload.sessionId,payload.callsign);
        // Resolve simultaneous offers deterministically: one side is polite and rolls back;
        // the other ignores the colliding offer, preventing both peers from answering offers.
        const offerCollision = pc.signalingState !== 'stable';
        const politePeer = deviceToken.localeCompare(payload.from) > 0;
        if (offerCollision && !politePeer) return;
        if (offerCollision && politePeer) {
          // Roll back only our own pending offer; never try to roll back a remote offer.
          if (pc.signalingState !== 'have-local-offer') return;
          await pc.setLocalDescription({ type: 'rollback' });
        }
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
      if (data.ok) {
        await loadArchive();
        const archiveChannel=channelRef.current;
        if (archiveChannel) {
          const status=await archiveChannel.send({
            type:'broadcast',
            event:'archive-updated',
            payload:{room,origin:deviceToken,recordingId:data.recording?.id||null,createdAt:new Date().toISOString()},
          });
          if(status!=='ok') console.warn('LB COMUNICACION historial: aviso no confirmado',status);
        }
      }
    } catch (error) {
      console.error('LB COMUNICACION archivo:',error);
      setPttError('La voz se transmitió, pero no se pudo guardar en el historial: '+(error instanceof Error ? error.message : 'error'));
    }
  };

  const endLocalAudio = (save = true) => {
    pttIntentRef.current = false;
    turnCancelledRef.current = true;
    talkingRef.current = false;
    beginningRef.current = false;
    setIsTalking(false);
    if(meterFrameRef.current!==null){cancelAnimationFrame(meterFrameRef.current);meterFrameRef.current=null;}
    setMeterLevel(0.04);
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
    try { void channelRef.current?.track({callsign:activeCallsign,status:'Escuchando',visible:!document.hidden,joinedAt:new Date().toISOString()}); } catch {}
    const sessionId = sessionRef.current;
    Array.from(peerMapRef.current.keys()).filter((key)=>key.endsWith(':'+sessionId)).forEach((key)=>{
      const peerId=key.slice(0,key.lastIndexOf(':'));
      void sendSignal({from:deviceToken,to:peerId,callsign:activeCallsign,sessionId,kind:'stop'}).catch(()=>{});
      closePeer(key);
    });
    streamRef.current?.getTracks().forEach((track)=>track.stop());
    processedMicRef.current?.getTracks().forEach(track=>track.stop());processedMicRef.current=null;micGainRef.current=null;void micContextRef.current?.close().catch(()=>{});micContextRef.current=null;
    streamRef.current = null;
  };

  const assertTransmitGrant = async () => {
    const grant = await api('queue',{queue_action:'state'});
    const expiresAt = Date.parse(String(grant.active_until || ''));
    if (grant.status !== 'transmitting' || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw new Error('El turno de transmisión ya no está autorizado. Vuelve a solicitarlo.');
    }
  };

  const beginAudio = async () => {
    if (!pttIntentRef.current || talkingRef.current || beginningRef.current || !channelRef.current) return;
    beginningRef.current = true;
    turnCancelledRef.current = false;
    setPttError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false,
      });
      try { await assertTransmitGrant(); }
      catch (grantError) { stream.getTracks().forEach(track=>track.stop()); throw grantError; }
      let transmitStream=stream;
      try{
        const Ctor=window.AudioContext||(window as any).webkitAudioContext;
        if(Ctor){
          const ctx:AudioContext=new Ctor();
          const source=ctx.createMediaStreamSource(stream);
          const gain=ctx.createGain();
          gain.gain.value=Math.max(0.32,Math.min(2,micGain/70));
          const meterAnalyser=ctx.createAnalyser();meterAnalyser.fftSize=512;
          const dest=ctx.createMediaStreamDestination();
          source.connect(gain);
          gain.connect(meterAnalyser);
          meterAnalyser.connect(dest);
          const meterSamples=new Uint8Array(meterAnalyser.fftSize);let meterEnvelope=0;let lastMeterUpdate=0;
          const updateTransmitMeter=()=>{if(micContextRef.current!==ctx)return;meterAnalyser.getByteTimeDomainData(meterSamples);let sum=0;for(let i=0;i<meterSamples.length;i++){const v=(meterSamples[i]-128)/128;sum+=v*v;}const rms=Math.sqrt(sum/meterSamples.length);const target=Math.min(1,Math.max(0,rms*14));meterEnvelope+=(target-meterEnvelope)*(target>meterEnvelope?0.48:0.16);const now=performance.now();if(now-lastMeterUpdate>45){setMeterLevel(meterEnvelope);lastMeterUpdate=now;}meterFrameRef.current=requestAnimationFrame(updateTransmitMeter);};
          meterFrameRef.current=requestAnimationFrame(updateTransmitMeter);
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
      if (turnCancelledRef.current || !pttIntentRef.current) { stream.getTracks().forEach((track)=>track.stop());transmitStream.getTracks().forEach((track)=>track.stop());beginningRef.current=false;return; }
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
      await assertTransmitGrant();
      const presence = channelRef.current.presenceState?.() || {};
      for (const [peerId,values] of Object.entries(presence) as Array<[string,Participant[]]>) {
        if (peerId===deviceToken) continue;
        const participant = values?.[0];
        if (!participant?.callsign) continue;
        const pc = await createPeer(peerId,sessionId,participant.callsign);
        if (!pttIntentRef.current) { endLocalAudio(false); return; }
        transmitStream.getAudioTracks().forEach((track)=>pc.addTrack(track,transmitStream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal({
          from:deviceToken,to:peerId,callsign:activeCallsign,sessionId,
          kind:'offer',description:pc.localDescription?.toJSON(),
        });
        if (!pttIntentRef.current) { endLocalAudio(false); return; }
      }
      if (!pttIntentRef.current) { endLocalAudio(false); return; }
      await assertTransmitGrant();
      if (!pttIntentRef.current) { endLocalAudio(false); return; }
      talkingRef.current = true;
      setRemainingSeconds(current=>current>0?current:30);
      setIsTalking(true);
      await channelRef.current.track({callsign:activeCallsign,status:'Transmitiendo',visible:!document.hidden,joinedAt:new Date().toISOString()});
    } catch (error) {
      pttIntentRef.current = false;
      endLocalAudio(false);
      setPttError(error instanceof DOMException && error.name==='NotAllowedError'
        ? 'No diste permiso para usar el micrófono. Habilítalo en el navegador.'
        : error instanceof Error && error.message.includes('turno de transmisión')
          ? error.message
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
    if (data.status==='transmitting' && !talkingRef.current && !beginningRef.current) {
      if (pttIntentRef.current) void beginAudio();
      else if (queue_action !== 'release' && queue_action !== 'cancel') void api('queue',{queue_action:'release'}).catch(()=>{});
    }
    if (data.status!=='transmitting' && (talkingRef.current || beginningRef.current)) endLocalAudio(true);
    return data as QueueState;
  };

  const requestTurn = async () => {
    if (connection!=='connected' || talkingRef.current || beginningRef.current || pttActionRef.current) return;
    pttActionRef.current = true;
    pttIntentRef.current = true;
    turnCancelledRef.current = false;
    setPttPending(true);
    setPttError('');
    try {
      await queueAction('request');
      // Si el usuario soltó PTT mientras la petición estaba en vuelo, la concesión tardía se libera.
      if (!pttIntentRef.current) await api('queue',{queue_action:'release'});
    } catch (error) {
      pttIntentRef.current = false;
      setPttError(error instanceof Error ? error.message : 'No se pudo solicitar turno.');
      try { await api('queue',{queue_action:'cancel'}); } catch {}
    } finally { pttActionRef.current = false; setPttPending(false); }
  };

  const releaseTurn = async () => {
    pttIntentRef.current = false;
    turnCancelledRef.current = true;
    // Cortar primero el audio local: no esperar al servidor para dejar de emitir.
    if (talkingRef.current || beginningRef.current) endLocalAudio(true);
    setIsQueued(false);
    setQueuePosition(0);
    setIsTalking(false);
    setIsQueued(false);
    setPttPending(false);
    pttActionRef.current = false;
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
    if (!sessionActive || !activeCallsign || !deviceToken || !supabase) {
      if (sessionActive) setConnection('error');
      return;
    }
    const client = supabase;
    let mounted = true;
    setConnection('connecting');
    setParticipants([]);
    const channel = client.channel('lb-comunica:'+room,{
      config:{presence:{key:deviceToken},broadcast:{self:false,ack:true}},
    });
    channelRef.current = channel;
    channel
      .on('presence',{event:'sync'},()=>{
        if (!mounted) return;
        const state = channel.presenceState<Participant>();
        const all = Object.values(state).flat();
        if(all.some((p:any)=>p?.status==='Transmitiendo') && 'speechSynthesis' in window) window.speechSynthesis.cancel();
        // Si entramos con una transmisión ya iniciada, solicitamos que el emisor
        // abra una conexión WebRTC hacia nosotros. Broadcasts anteriores no se recuperan.
        const activeTalkers = new Set<string>();
        for (const [peerId,values] of Object.entries(state) as Array<[string,Participant[]]>) {
          const speaker = values?.find(p=>p?.status==='Transmitiendo' && p?.callsign);
          if (!speaker || peerId===deviceToken) continue;
          activeTalkers.add(peerId);
          if (!requestedTalkersRef.current.has(peerId)) {
            requestedTalkersRef.current.add(peerId);
            void sendSignal({from:deviceToken,to:peerId,callsign:activeCallsign,sessionId:'request-'+deviceToken,kind:'request'}).catch(()=>requestedTalkersRef.current.delete(peerId));
          }
        }
        for (const peerId of Array.from(requestedTalkersRef.current)) if (!activeTalkers.has(peerId)) requestedTalkersRef.current.delete(peerId);
        const unique = new Map<string,Participant>();
        all.forEach((p)=>{const call=String(p.callsign||'').toUpperCase();if(call)unique.set(call,{...p,callsign:call});});
        setParticipants(Array.from(unique.values()).sort((a,b)=>a.callsign.localeCompare(b.callsign)));
      })
      .on('broadcast',{event:'signal'},({payload}:{payload:Signal})=>{if(mounted)void acceptSignal(payload);})
      .on('broadcast',{event:'archive-updated'},({payload}:{payload:any})=>{
        if(mounted && payload?.room===room && payload?.origin!==deviceToken) {
          void loadArchive();
        }
      })
      .on('broadcast',{event:'ambient-call'},({payload}:{payload:any})=>{if(mounted && payload?.room===(is11MeterStationIdentifier(activeCallsign)?'11m':'ham') && payload?.origin!==deviceToken && Date.now()-Number(payload?.startedAt||0)<6000)setAmbientCall(payload);})
      .subscribe(async(status)=>{
        if (!mounted) return;
        if (status==='SUBSCRIBED') {
          try {
            // Cada RTCPeerConnection obtiene credenciales ICE frescas al crearse.
            iceServersRef.current = [{ urls: 'stun:stun.l.google.com:19302' }];
            await channel.track({callsign:activeCallsign,status:'Escuchando',visible:!document.hidden,joinedAt:new Date().toISOString()});
            const consent = await api('consent_status');
            if (consent.accepted) localStorage.setItem('lb_comunica_ptt_consent_'+activeCallsign,'accepted');
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
    const syncVisibility = () => { void channel.track({callsign:activeCallsign,status:talkingRef.current?'Transmitiendo':'Escuchando',visible:!document.hidden,joinedAt:new Date().toISOString()}).catch(()=>{}); };
    document.addEventListener('visibilitychange',syncVisibility);
    const releaseOnExit = () => { void api('queue',{queue_action:'release'}).catch(()=>{}); };
    window.addEventListener('pagehide',releaseOnExit);
    return () => {
      document.removeEventListener('visibilitychange',syncVisibility);
      window.removeEventListener('pagehide',releaseOnExit);
      void api('queue',{queue_action:'release'}).catch(()=>{});
      mounted=false;
      channelRef.current=null;
      void channel.untrack();
      void client.removeChannel(channel);
      if (talkingRef.current) endLocalAudio(true);
      closeAllPeers();
    };
  },[sessionActive,activeCallsign,deviceToken,room]);

  useEffect(() => {
    if (!sessionActive || connection!=='connected') return;
    let stopped=false;
    let polling=false;
    const poll = async () => {
      if (polling) return;
      polling=true;
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
      } finally { polling=false; }
    };
    void poll();
    const timer=window.setInterval(()=>void poll(),1500);
    return ()=>{stopped=true;window.clearInterval(timer);};
  },[sessionActive,connection,activeCallsign,deviceToken,room]);

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
    setShareOpen(false);
    setShowConsent(false);
    if (backgroundEnabled) return;
    setConnection('idle');
    setParticipants([]);
    setRecordings([]);
    setPttError('');
  };

  const disableBackgroundAudio = () => {
    setBackgroundEnabled(false);
    if (!isOpen) {
      setConnection('idle');
      setParticipants([]);
      setRecordings([]);
      setPttError('');
    }
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
        className="mb-2 flex min-h-11 w-full flex-col items-center justify-center rounded-lg border border-emerald-300 bg-gradient-to-r from-emerald-950 via-teal-900 to-cyan-900 px-3 py-2 text-center text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-emerald-300 sm:text-sm"
        aria-label="LB COMUNICACION, pulsa y habla">
        <span className="inline-flex items-center gap-2"><Headphones className="h-5 w-5 shrink-0"/>LB COMUNICACION</span>
        <span className="mt-0.5 text-xs font-semibold sm:text-sm">pulsa y habla</span>
      </button>

      {backgroundEnabled && !isOpen && <div role="status" aria-live="polite" className="fixed bottom-4 right-4 md:bottom-auto md:top-4 md:right-4 z-[95] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-xl border border-emerald-400/50 bg-slate-950 px-3 py-2 text-white shadow-2xl"><span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-emerald-400"/><span className="min-w-0"><span className="block text-[10px] font-black tracking-wide">LB COMUNICACION · RX ACTIVA</span><span className="block truncate text-xs text-emerald-200">{roomTitle} · {participants.length} en sala</span></span><button type="button" onClick={()=>setIsOpen(true)} className="rounded-lg bg-emerald-700 px-2.5 py-1.5 text-[11px] font-bold">Volver</button><button type="button" onClick={disableBackgroundAudio} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-red-300 bg-red-700 text-white shadow-[0_0_12px_#ef444499] transition hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-400/70" aria-label="Cerrar y desactivar RX segundo plano" title="Cerrar LB COMUNICACION"><X className="h-6 w-6 stroke-[3]"/></button></div>}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-slate-950/80 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="lb-comunica-title">
          <section className={'flex h-[100dvh] max-h-[100dvh] min-h-0 w-full max-w-7xl sm:h-[94dvh] sm:max-h-[94dvh] flex-col overflow-hidden rounded-none border border-emerald-400/40 shadow-2xl sm:rounded-2xl '+(panelLight?'bg-slate-100 text-slate-900':'bg-slate-950 text-white')}>
            <header className={'flex shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2 sm:px-4 sm:py-3 '+(panelLight?'border-slate-300':'border-white/10')}>
              <div className="min-w-0 flex-1"><h2 id="lb-comunica-title" className="truncate text-base font-bold tracking-wide">LB COMUNICACION</h2><p className={'text-xs font-semibold '+(isElevenMeters&&panelLight?'text-emerald-700':'text-emerald-300')}>Sala {roomTitle}</p></div>
              <div className="flex max-w-full flex-wrap items-center justify-end gap-1"><button type="button" onClick={()=>{setShareOpen(true);setShareLanguage("auto");setShareNotice("");}} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/40 bg-emerald-950/60 px-3 py-2 text-xs font-bold text-emerald-100" aria-label="Compartir LB COMUNICACION"><Share2 className="h-4 w-4"/>Compartir</button><button type="button" aria-pressed={backgroundEnabled} onClick={()=>setBackgroundEnabled(v=>!v)} className={'rounded-lg border px-2 py-2 text-[10px] font-bold '+(backgroundEnabled?'border-emerald-300 bg-emerald-800 text-white':'border-sky-300/40 bg-sky-950/60 text-sky-100')}>{backgroundEnabled?'RX segundo plano ✓':'RX segundo plano'}</button><button type="button" onClick={closeRoom} className="rounded-lg p-2 text-slate-300 hover:bg-white/10" aria-label="Salir de la sala"><X className="h-5 w-5"/></button></div>
              {backgroundEnabled && <p className="border-b border-emerald-400/30 bg-emerald-950/60 px-3 py-1.5 text-center text-[10px] text-emerald-100">La recepción seguirá activa mientras navegas dentro de LogBook. No activa el micrófono ni garantiza audio con la aplicación cerrada o bloqueada.</p>}
            </header>
            {!activeCallsign ? <div className="p-6 text-center font-semibold">Primero debes validar tu SD o indicativo en el chat general.</div> : (
              <div className={'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overscroll-contain pb-[calc(7rem+env(safe-area-inset-bottom))] p-1.5 sm:gap-3 sm:p-3 sm:pb-3 md:grid md:items-stretch md:gap-3 md:overflow-y-auto md:overflow-x-hidden '+(historyOpen?'md:grid-cols-[minmax(250px,.72fr)_minmax(0,1.8fr)]':'md:grid-cols-[minmax(0,.32fr)_minmax(0,2.68fr)]')}>
                <div className={'relative order-1 flex min-w-0 flex-col items-center gap-2 overflow-visible md:overflow-visible rounded-xl border p-2.5 pb-4 text-center shadow-[inset_0_0_35px_#000c,0_12px_35px_#0009] sm:gap-3 sm:p-4 md:order-1 md:col-start-2 md:row-start-1 md:h-full md:min-h-0 md:grid md:grid-cols-2 md:content-start md:items-start md:gap-2 '+(panelLight?'border-slate-300 bg-[linear-gradient(145deg,#f8fafc,#e2e8f0_55%,#cbd5e1)] text-slate-900':'border-zinc-700 bg-[linear-gradient(145deg,#292a27,#10110f)] text-white')}>
                  <div className="order-0 md:col-span-2 flex w-full items-center justify-between border-b border-amber-100/20 pb-1 text-[9px] font-black tracking-[.16em] text-amber-100"><span>LB • COMMUNICATIONS</span><span>● STANDBY</span></div>
                  <div className={'order-0 md:col-span-2 flex w-full min-w-0 flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border px-2.5 py-2 text-left '+(panelLight?'border-emerald-300 bg-emerald-50 text-emerald-950':'border-emerald-400/30 bg-emerald-950/50 text-emerald-100')}>
                    <span className="shrink-0 text-[10px] font-black tracking-wide">EN SALA · {participants.length}</span>
                    <span className="text-[10px] opacity-70">|</span>
                    {participants.length ? <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                      {participants.slice(0,6).map((participant)=><span key={participant.callsign} className="inline-flex items-center gap-1 rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>{participant.callsign}</span>)}
                      {participants.length>6 && <details className="min-w-0 text-[10px]">
                        <summary className="cursor-pointer select-none rounded-full border border-current/30 px-2 py-1 font-black">Ver todos (+{participants.length-6})</summary>
                        <div className="mt-2 flex max-h-36 flex-wrap gap-1.5 overflow-y-auto rounded-md border border-current/20 bg-black/10 p-2">{participants.slice(6).map((participant)=><span key={participant.callsign} className="inline-flex items-center gap-1 rounded-full border border-current/20 px-2 py-0.5 text-[10px] font-bold"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500"/>{participant.callsign}</span>)}</div>
                      </details>}
                    </div> : <span className="text-[10px] opacity-75">{connection==='connected'?'Esperando operadores…':'Conectando con la sala…'}</span>}
                  </div>
                  {participants.some(participant=>participant.status==='Transmitiendo') && <div role="status" aria-live="polite" className={'order-0 md:col-span-2 flex w-full flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-left '+(panelLight?'border-red-300 bg-red-50 text-red-950':'border-red-400/40 bg-red-950/50 text-red-100')}>
                    <span className="inline-flex items-center gap-1 text-[10px] font-black tracking-wide"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500"/>EN EL AIRE</span>
                    {participants.filter(participant=>participant.status==='Transmitiendo').map(participant=><span key={'tx-'+participant.callsign} className="inline-flex items-center gap-1.5 rounded-full border border-current/25 bg-black/5 px-2.5 py-1 text-xs font-extrabold"><span aria-label="Bandera del país">{flagForCallsign(participant.callsign,undefined,isElevenMeters)}</span><span>{participant.callsign}</span></span>)}
                  </div>}
                  <div className="order-1 md:col-span-2 md:grid md:grid-cols-[minmax(0,1fr)_minmax(220px,.85fr)] md:items-center md:gap-3 w-full rounded-xl border-2 border-amber-200 bg-[linear-gradient(145deg,#d6bd7b_0%,#a98543_38%,#d0b36d_72%,#80602f_100%)] p-2.5 shadow-[inset_0_1px_5px_#fff8,0_5px_14px_#0009] sm:p-3">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-md border border-black/20 md:col-span-2 bg-black/10 px-2 py-1.5">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[10px] font-black tracking-wider text-zinc-950 sm:gap-2 sm:text-xs">
                        <span className="whitespace-nowrap">AUDIO RX</span>
                        <button type="button" aria-pressed={audioProfile==='radio'} onClick={()=>setAudioProfile('radio')} className={'rounded-md border px-2 py-1.5 text-[9px] font-black sm:px-3 sm:text-[10px] '+(audioProfile==='radio'?'border-amber-200 bg-amber-200 text-zinc-900':'border-amber-100/30 text-amber-100')}>MODO RADIO</button>
                        <button type="button" aria-pressed={audioProfile==='clean'} onClick={()=>setAudioProfile('clean')} className={'rounded-md border px-2 py-1.5 text-[9px] font-black sm:px-3 sm:text-[10px] '+(audioProfile==='clean'?'border-amber-200 bg-amber-200 text-zinc-900':'border-amber-100/30 text-amber-100')}>AUDIO LIMPIO</button>
                        <button type="button" onClick={()=>setRadioReceive(v=>!v)} aria-pressed={radioReceive} className="rounded-md border border-emerald-300/40 bg-emerald-950/70 px-2 py-1.5 text-[9px] font-black text-emerald-100 sm:px-3 sm:text-[10px]">{radioReceive?'RX NORMAL':'RX ATENUADA'}</button>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button type="button" aria-label={panelLight?'Cambiar a modo oscuro':'Cambiar a modo claro'} aria-pressed={panelLight} onClick={()=>setPanelLight(v=>!v)} className={'rounded-md border px-2.5 py-1.5 text-[9px] font-bold '+(panelLight?'border-slate-500 bg-white text-slate-900':'border-amber-100/30 bg-black/30 text-amber-100')}>{panelLight?'☀ LAMP ON':'☾ LAMP OFF'}</button>
                        <button type="button" onClick={()=>{setRfGain(80);setMicGain(70);setSquelch(0);setClarifier(50);setRadioVolume(85);setRadioReceive(true);setAudioProfile('radio');setPanelLight(true);}} className="rounded-md border border-white/20 bg-black/30 px-2.5 py-1.5 text-[9px] font-bold">RESET</button>
                      </div>
                    </div>
                    <div className="my-1 w-full flex justify-center md:col-start-1 md:row-start-2"><div className="w-full max-w-[520px]"><SuperstarMeter level={meterLevel} transmitting={isTalking} /></div></div>
                    <div className="md:col-start-1 md:row-start-3 grid w-full grid-cols-5 items-start gap-1 rounded-lg border border-black/30 bg-[linear-gradient(180deg,#59472cdd,#302719ee)] px-1 py-2 shadow-[inset_0_2px_7px_#000b] sm:gap-3 sm:px-3 sm:py-3">
                      <RadioKnob label="RF GAIN" value={rfGain} onChange={setRfGain}/>
                      <RadioKnob label="MIC GAIN" value={micGain} onChange={setMicGain}/>
                      <RadioKnob label="SQUELCH" value={squelch} onChange={setSquelch}/>
                      <RadioKnob label="CLARIFIER" value={clarifier} onChange={setClarifier}/>
                      <RadioKnob label="VOLUME" value={radioVolume} onChange={setRadioVolume}/>
                    </div>
                  <div className="mb-2 flex w-full flex-col items-center gap-2 rounded-lg md:col-start-2 md:row-start-3 border border-white/15 bg-black/35 px-3 py-2">
                    <span className="text-[10px] font-black tracking-wider text-slate-300">MODO PTT</span>
                    <div className="grid w-full grid-cols-2 gap-2">
                      <button type="button" aria-pressed={pttMode==='hold'} onClick={()=>{if(isTalking||isQueued)void releaseTurn();setPttMode('hold');}} className={'min-h-10 rounded-full border px-2 py-2 text-[10px] font-bold transition-colors '+(pttMode==='hold'?'border-emerald-200 bg-emerald-700 text-white shadow-[0_0_10px_#10b98166]':'border-white/20 bg-black/20 text-slate-300')}>MANTENER PULSADO</button>
                      <button type="button" aria-pressed={pttMode==='toggle'} onClick={()=>{if(isTalking||isQueued)void releaseTurn();setPttMode('toggle');}} className={'min-h-10 rounded-full border px-2 py-2 text-[10px] font-bold transition-colors '+(pttMode==='toggle'?'border-emerald-200 bg-emerald-700 text-white shadow-[0_0_10px_#10b98166]':'border-white/20 bg-black/20 text-slate-300')}>ALTERNADO</button>
                    </div>
                  </div>
                  <button type="button" disabled={connection!=='connected'}
                    onClick={undefined}
                    onPointerDown={(e)=>{e.preventDefault();if(pttMode==='toggle')togglePtt();else if(localStorage.getItem('lb_comunica_ptt_consent_'+activeCallsign)==='accepted')void requestTurn();else setShowConsent(true);}}
                    onPointerUp={pttMode==='hold'?()=>void releaseTurn():undefined}
                    onPointerLeave={pttMode==='hold'?()=>{if(talkingRef.current||beginningRef.current||isQueued)void releaseTurn();}:undefined}
                    onPointerCancel={pttMode==='hold'?()=>void releaseTurn():undefined}
                    onLostPointerCapture={pttMode==='hold'?()=>{if(talkingRef.current||beginningRef.current)void releaseTurn();}:undefined}
                    className={'sticky bottom-3 z-30 mt-2 mb-2 flex h-24 min-h-24 w-full max-w-none shrink-0 md:static md:col-start-2 md:row-start-2 select-none flex-row items-center justify-center gap-3 rounded-[1.7rem] border-[3px] border-b-4 shadow-[inset_0_2px_5px_#ffffff22] transition '+(pttMode==='hold'?'touch-none ':'touch-manipulation ')+(isTalking?'border-red-300 bg-red-700 text-white':pttPending||isQueued?'border-amber-300 bg-amber-900 text-white':'border-emerald-400 bg-emerald-950 text-emerald-100')+' disabled:cursor-not-allowed disabled:opacity-40'}>
                    <Mic className="h-9 w-9 shrink-0"/><span className="flex min-w-0 flex-col items-center leading-tight"><span className="text-base font-extrabold tracking-widest">{isTalking?'EN EL AIRE':pttPending?'SOLICITANDO':isQueued?'EN COLA':'PULSA Y HABLA'}</span>{isTalking&&<span className="mt-1 rounded-md border border-white/30 bg-black/30 px-3 py-1 font-mono text-xl font-black tabular-nums">{formatDuration(Math.max(0,remainingSeconds)*1000)}</span>}</span>
                  </button>


                  </div>
                  {pttError&&<p role="alert" className="max-w-md text-sm text-amber-200">{pttError}</p>}
                  <div className="order-3 mt-1 flex w-full max-w-xs md:col-span-2 items-center justify-between gap-2 rounded-md border border-white/10 bg-black/35 px-2 py-1.5 text-left">
                    <div className="min-w-0"><p className="text-[10px] font-semibold text-slate-200">Avisos con LogBook cerrado</p><p className="text-[9px] text-slate-400">Este dispositivo · esta sala</p></div>
                    <button type="button" disabled={pushBusy} onClick={()=>void (pushEnabled?disablePush():enablePush())}
                      className={'shrink-0 rounded-full px-2 py-1 text-[10px] font-bold '+(pushEnabled?'bg-emerald-700 text-white':'bg-slate-700 text-slate-100')}>
                      {pushBusy?'…':pushEnabled?'Activados':'Activar'}
                    </button>
                  </div>
                  <p className="order-3 md:col-span-2 max-w-md text-[10px] text-slate-400">Un único transmisor por sala. El servidor ordena la cola y concede un máximo de 30 segundos por turno.</p>
                </div>
                <details open={historyOpen} onToggle={(e)=>setHistoryOpen(e.currentTarget.open)} className="md:col-start-1 md:row-start-1 md:min-h-0 md:overflow-y-auto rounded-xl border border-white/10 bg-slate-900/70">
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
        <div className="fixed inset-0 z-[130] flex items-start justify-center overflow-y-auto overscroll-contain bg-slate-950/90 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="lb-share-title">
          <section className="w-full max-w-md max-h-[calc(100dvh-1.5rem)] overflow-y-auto overscroll-contain rounded-2xl border border-emerald-400/40 bg-slate-900 p-4 text-white shadow-2xl">
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
        <div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto overscroll-contain bg-black/80 p-4 sm:items-center" role="dialog" aria-modal="true" aria-labelledby="lb-ptt-consent-title">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain rounded-xl border border-emerald-400/40 bg-slate-900 p-5 text-white">
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