import React, { useEffect, useRef, useState } from 'react';
import { Activity, AudioLines, Check, Copy, Gauge, Mic, MicOff, Radio, Trash2 } from 'lucide-react';
import { getInitialAppLanguage } from '../services/appLanguage';
import { CWAudioDecoder, type CWStats } from '../services/cwAudioDecoder';

type AudioSession = { stream: MediaStream; context: AudioContext; source: MediaStreamAudioSourceNode; processor: ScriptProcessorNode; silentGain: GainNode; decoder: CWAudioDecoder };

const label: Record<string,string> = {
  es:'Decodificador Morse',en:'Morse decoder',pt:'Descodificador Morse','pt-br':'Decodificador Morse',fr:'Décodeur Morse',de:'Morse-Decoder',it:'Decodificatore Morse',nl:'Morse-decoder',pl:'Dekoder Morse',
  ru:'Декодер Морзе',uk:'Декодер Морзе',zh:'摩斯電碼解碼器',ja:'モールス信号デコーダー',ko:'모스 부호 디코더',ar:'فك شفرة مورس',hi:'मोर्स डिकोडर',tr:'Mors kodu çözücü',sv:'Morseavkodare',no:'Morse-dekoder',da:'Morse-dekoder',fi:'Morsedekooderi',cs:'Morseov dekodér',el:'Αποκωδικοποιητής Μορς',ro:'Decodor Morse',hu:'Morse-dekóder',id:'Dekoder Morse'
};
const words = {
  es:{start:'Activar micrófono',stop:'Detener recepción',clear:'Borrar',copy:'Copiar texto',copied:'Copiado',decoded:'Texto recibido',morse:'Señal Morse',listening:'Escuchando CW en tiempo real',idle:'Pulsa Activar micrófono y acerca el teléfono al altavoz de la radio.',permission:'No se pudo acceder al micrófono. Comprueba los permisos del navegador y vuelve a intentarlo.',noDevice:'No se detectó un micrófono disponible.',insecure:'El micrófono requiere HTTPS o la aplicación instalada.',unsupported:'Este navegador no permite capturar audio.',frequency:'Tono objetivo',bandwidth:'Ancho de filtro',sensitivity:'Umbral de ruido',auto:'Velocidad automática',manual:'Velocidad manual',speed:'Velocidad estimada',signal:'Nivel de señal',snr:'Relación señal/ruido',receiving:'RECIBIENDO',monitoring:'En espera',privacy:'El audio se procesa localmente en este dispositivo. No se envía ni se guarda en ningún servidor.',tip:'Para mejores resultados, usa el altavoz de la radio a volumen moderado, centra el tono CW y evita que el micrófono roce el teléfono.'},
  en:{start:'Enable microphone',stop:'Stop reception',clear:'Clear',copy:'Copy text',copied:'Copied',decoded:'Received text',morse:'Morse signal',listening:'Listening to CW in real time',idle:'Tap Enable microphone and place the phone near the radio speaker.',permission:'Microphone access failed. Check browser permissions and try again.',noDevice:'No microphone was detected.',insecure:'Microphone access requires HTTPS or the installed app.',unsupported:'This browser does not support audio capture.',frequency:'Target tone',bandwidth:'Filter bandwidth',sensitivity:'Noise threshold',auto:'Automatic speed',manual:'Manual speed',speed:'Estimated speed',signal:'Signal level',snr:'Signal/noise ratio',receiving:'RECEIVING',monitoring:'Standby',privacy:'Audio is processed locally on this device. It is not uploaded or stored on a server.',tip:'For best results, use moderate radio speaker volume, center the CW tone, and keep the microphone unobstructed.'}
};

export function MorseDecoder() {
  const [open,setOpen]=useState(false),[active,setActive]=useState(false),[status,setStatus]=useState('');
  const [code,setCode]=useState(''),[decoded,setDecoded]=useState('');
  const [frequency,setFrequency]=useState(700),[bandwidth,setBandwidth]=useState(90),[squelch,setSquelch]=useState(0);
  const [adaptive,setAdaptive]=useState(true),[manualWpm,setManualWpm]=useState(20),[stats,setStats]=useState<CWStats|null>(null),[copied,setCopied]=useState(false);
  const [language]=useState(getInitialAppLanguage);
  const sessionRef=useRef<AudioSession|null>(null),codeRef=useRef(''),decodedRef=useRef('');
  const lang=language==='es'?'es':'en',t=words[lang];

  const stop=()=>{
    const s=sessionRef.current;
    if(s){
      try{s.decoder.flushPending();}catch{}
      s.processor.onaudioprocess=null;
      try{s.source.disconnect();s.processor.disconnect();s.silentGain.disconnect();}catch{}
      s.stream.getTracks().forEach(track=>track.stop());
      void s.context.close();sessionRef.current=null;
    }
    setActive(false);setStatus(lang==='es'?'Recepción detenida':'Reception stopped');
  };

  useEffect(()=>()=>{const s=sessionRef.current;if(s){s.processor.onaudioprocess=null;s.stream.getTracks().forEach(track=>track.stop());try{s.source.disconnect();s.processor.disconnect();s.silentGain.disconnect();}catch{}void s.context.close();}},[]);
  useEffect(()=>{
    const s=sessionRef.current;if(!s)return;
    s.decoder.setToneFreq(frequency);s.decoder.setFilterBandwidth(bandwidth);
    s.decoder.setSquelch(squelch===0?0:0.05*Math.pow(squelch/100,2));
    s.decoder.setAdaptive(adaptive);if(!adaptive)s.decoder.setWpm(manualWpm);
  },[frequency,bandwidth,squelch,adaptive,manualWpm]);

  const start=async()=>{
    let pendingStream:MediaStream|null=null;
    let pendingContext:AudioContext|null=null;
    if(!window.isSecureContext){setStatus(t.insecure);return;}
    if(!navigator.mediaDevices?.getUserMedia){setStatus(t.unsupported);return;}
    setStatus(lang==='es'?'Esperando autorización del micrófono…':'Waiting for microphone permission…');
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false,channelCount:1},video:false});
      pendingStream=stream;
      const context=new AudioContext();pendingContext=context;await context.resume();
      const source=context.createMediaStreamSource(stream),processor=context.createScriptProcessor(4096,1,1),silentGain=context.createGain();
      silentGain.gain.value=0;
      const decoder=new CWAudioDecoder(context.sampleRate,frequency,manualWpm,Math.max(1,frequency/bandwidth));
      decoder.setToneFreq(frequency);decoder.setFilterBandwidth(bandwidth);
      decoder.setSquelch(squelch===0?0:0.05*Math.pow(squelch/100,2));decoder.setAdaptive(adaptive);
      if(!adaptive)decoder.setWpm(manualWpm);
      decoder.onElement=(element)=>{codeRef.current+=(element==='dot'?'.':'-');setCode(codeRef.current);};
      decoder.onCharDecoded=()=>{codeRef.current+=' ';setCode(codeRef.current);};
      decoder.onText=(chunk)=>{
        if(chunk===' '){codeRef.current+=' / ';setCode(codeRef.current);}
        decodedRef.current+=chunk;setDecoded(decodedRef.current);
      };
      processor.onaudioprocess=(event)=>{const result=decoder.process(event.inputBuffer.getChannelData(0));setStats(result);};
      source.connect(processor);processor.connect(silentGain);silentGain.connect(context.destination);
      sessionRef.current={stream,context,source,processor,silentGain,decoder};
      pendingStream=null;pendingContext=null;
      setStats(decoder.getStats());setActive(true);setStatus(t.listening);
    }catch(error){
      const err=error as DOMException;
      if(err?.name==='NotFoundError'||err?.name==='DevicesNotFoundError')setStatus(t.noDevice);
      else if(err?.name==='NotAllowedError'||err?.name==='PermissionDeniedError')setStatus(t.permission);
      else setStatus(t.permission+(err?.message?' ('+err.message+')':''));
      const s=sessionRef.current;if(s){s.stream.getTracks().forEach(track=>track.stop());void s.context.close();sessionRef.current=null;}
      if(pendingStream)pendingStream.getTracks().forEach(track=>track.stop());
      if(pendingContext)void pendingContext.close();
      setActive(false);
    }
  };

  const clear=()=>{codeRef.current='';decodedRef.current='';setCode('');setDecoded('');sessionRef.current?.decoder.reset();
    const decoder=sessionRef.current?.decoder;
    if(decoder){decoder.setToneFreq(frequency);decoder.setFilterBandwidth(bandwidth);decoder.setSquelch(squelch===0?0:0.05*Math.pow(squelch/100,2));decoder.setAdaptive(adaptive);if(!adaptive)decoder.setWpm(manualWpm);}
    setStats(decoder?.getStats()||null);};
  const copyText=async()=>{
    if(!decodedRef.current)return;
    try{await navigator.clipboard.writeText(decodedRef.current);setCopied(true);window.setTimeout(()=>setCopied(false),1600);}
    catch{setStatus(lang==='es'?'No se pudo copiar el texto.':'Could not copy the text.');}
  };
  const toggleOpen=()=>{if(open&&active)stop();setOpen(value=>!value);if(!open)setStatus(t.idle);};

  return <section className="my-4" data-no-translate>
    <button type="button" aria-expanded={open} onClick={toggleOpen} className="mb-2 flex min-h-[56px] w-full items-center gap-3 rounded-xl border border-blue-700 bg-blue-500 px-4 py-2.5 text-left font-bold text-black shadow-sm hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-700">
      <Radio className="h-5 w-5"/><span>Decodificador Morse (CW)</span><span className="ml-auto text-xs font-semibold">{open?'−':'+'}</span>
    </button>
    {open&&<div className="rounded-2xl border border-cyan-300 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <div className="rounded-xl bg-cyan-100 p-2 text-cyan-800"><AudioLines className="h-5 w-5"/></div>
        <div className="min-w-0 flex-1"><h2 className="text-lg font-bold text-slate-900">{label[language]||label.es}</h2><p className="text-xs text-slate-600">CW · Micrófono del teléfono · Procesamiento local</p></div>
        <span className={'rounded-full px-2.5 py-1 text-[10px] font-bold tracking-wide '+(active?'bg-emerald-100 text-emerald-800':'bg-slate-100 text-slate-600')}>{active?t.receiving:t.monitoring}</span>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {!active?<button type="button" onClick={start} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"><Mic className="h-4 w-4"/>{t.start}</button>
          :<button type="button" onClick={stop} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white hover:bg-red-700"><MicOff className="h-4 w-4"/>{t.stop}</button>}
        <button type="button" onClick={clear} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-slate-700 hover:bg-slate-50"><Trash2 className="h-4 w-4"/>{t.clear}</button>
        <button type="button" onClick={copyText} disabled={!decoded} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-slate-700 disabled:opacity-40"><Copy className="h-4 w-4"/>{copied?t.copied:t.copy}</button>
      </div>
      <p role="status" className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{status||t.idle}</p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-slate-900 p-3 text-white"><div className="mb-1 flex items-center gap-1.5 text-xs text-slate-300"><Gauge className="h-3.5 w-3.5"/>{t.speed}</div><div className="text-2xl font-bold tabular-nums">{stats?(adaptive?stats.adaptiveWpm:stats.wpm):'—'} <span className="text-xs font-medium text-slate-300">WPM</span></div></div>
        <div className="rounded-xl bg-slate-900 p-3 text-white"><div className="mb-1 flex items-center gap-1.5 text-xs text-slate-300"><Activity className="h-3.5 w-3.5"/>{t.signal}</div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-emerald-400 transition-all" style={{width:(Math.min(100,Math.max(0,(stats?.envelopeLevel||0)*500)))+'%'}}/></div><div className="mt-1 text-xs text-slate-300">{!stats||stats.snrDb===null?'—':stats.snrDb.toFixed(1)+' dB'} · {t.snr}</div></div>
      </div>
      <div className="space-y-3 rounded-xl border border-slate-200 p-3">
        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800"><span>{t.frequency}</span><span className="font-mono tabular-nums">{frequency} Hz</span></label>
        <input aria-label={t.frequency} className="w-full accent-cyan-700" type="range" min="300" max="1500" step="25" value={frequency} onChange={e=>setFrequency(Number(e.target.value))}/>
        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800"><span>{t.bandwidth}</span><span className="font-mono tabular-nums">{bandwidth} Hz</span></label>
        <input aria-label={t.bandwidth} className="w-full accent-cyan-700" type="range" min="40" max="250" step="10" value={bandwidth} onChange={e=>setBandwidth(Number(e.target.value))}/>
        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800"><span>{t.sensitivity}</span><span className="font-mono tabular-nums">{squelch}%</span></label>
        <input aria-label={t.sensitivity} className="w-full accent-cyan-700" type="range" min="0" max="100" step="5" value={squelch} onChange={e=>setSquelch(Number(e.target.value))}/>
        <label className="flex items-center justify-between gap-3 text-sm font-semibold text-slate-800"><span>{t.auto}</span><input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={adaptive} onChange={e=>setAdaptive(e.target.checked)}/></label>
        {!adaptive&&<label className="flex items-center justify-between gap-3 text-sm text-slate-700"><span>{t.manual}</span><span className="font-mono">{manualWpm} WPM</span><input className="w-28 accent-cyan-700" type="range" min="5" max="60" step="1" value={manualWpm} onChange={e=>setManualWpm(Number(e.target.value))}/></label>}
      </div>
      <label className="mb-1 mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">{t.morse}</label>
      <div className="min-h-12 break-all rounded-lg bg-slate-950 p-3 font-mono text-lg tracking-widest text-emerald-300">{code||stats?.partialSymbol||'· · ·'}</div>
      <label className="mb-1 mt-4 block text-xs font-bold uppercase tracking-wide text-slate-500">{t.decoded}</label>
      <div aria-live="polite" className="min-h-24 whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-lg leading-relaxed text-slate-900">{decoded||'…'}</div>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{t.tip}</p>
      <p className="mt-2 flex items-start gap-1.5 text-xs leading-relaxed text-emerald-800"><Check className="mt-0.5 h-3.5 w-3.5 shrink-0"/>{t.privacy}</p>
    </div>}
  </section>;
}
