import React, { useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, Languages, Trash2 } from 'lucide-react';
import { getInitialAppLanguage } from '../services/appLanguage';

const MORSE: Record<string, string> = {
  '.-':'A','-...':'B','-.-.':'C','-..':'D','.':'E','..-.':'F','--.':'G','....':'H','..':'I',
  '.---':'J','-.-':'K','.-..':'L','--':'M','-.':'N','---':'O','.--.':'P','--.-':'Q','.-.':'R',
  '...':'S','-':'T','..-':'U','...-':'V','.--':'W','-..-':'X','-.--':'Y','--..':'Z',
  '-----':'0','.----':'1','..---':'2','...--':'3','....-':'4','.....':'5','-....':'6','--...':'7',
  '---..':'8','----.':'9','.-.-.-':'.','--..--':',','..--..':'?','-.-.--':'!','-..-.':'/',
  '-.--.':'(','-.--.-':')','.-...':'&','---...':':','-.-.-.':';','-...-':'=','.-.-.':'+',
  '-....-':'-','..--.-':'_','.-..-.':'"','...-..-':'$','.--.-.':'@'
};
const MORSE_REVERSE = Object.fromEntries(Object.entries(MORSE).map(([k,v])=>[v,k]));
const label: Record<string,string> = {
  es:'Decodificador Morse',en:'Morse decoder',pt:'Descodificador Morse','pt-br':'Decodificador Morse',
  fr:'Décodeur Morse',de:'Morse-Decoder',it:'Decodificatore Morse',nl:'Morse-decoder',pl:'Dekoder Morse',
  ru:'Декодер Морзе',uk:'Декодер Морзе',zh:'摩斯电码解码器',ja:'モールス信号デコーダー',ko:'모스 부호 디코더',
  ar:'فك شفرة مورس',hi:'मोर्स डिकोडर',tr:'Mors kodu çözücü',sv:'Morseavkodare',no:'Morse-dekoder',
  da:'Morse-dekoder',fi:'Morsedekooderi',cs:'Morseov dekodér',el:'Αποκωδικοποιητής Μορς',
  ro:'Decodor Morse',hu:'Morse-dekóder',id:'Dekoder Morse'
};
const words: Record<string,Record<string,string>> = {
  es:{start:'Activar micrófono',stop:'Detener',clear:'Borrar',decoded:'Texto decodificado',morse:'Código Morse',listening:'Escuchando el micrófono…',idle:'Pulsa Activar micrófono y acerca el teléfono al audio Morse.',permission:'No se pudo acceder al micrófono. Comprueba los permisos del navegador.',translate:'Traduciendo…',translation:'Traducción',unsupported:'Este navegador no permite capturar audio.'},
  en:{start:'Enable microphone',stop:'Stop',clear:'Clear',decoded:'Decoded text',morse:'Morse code',listening:'Listening to microphone…',idle:'Tap Enable microphone and place the phone near the Morse audio.',permission:'Could not access the microphone. Check browser permissions.',translate:'Translating…',translation:'Translation',unsupported:'This browser does not support audio capture.'}
};
function morseText(code:string) {
  return code.trim().split(' / ').map(word=>word.split(' ').map(symbol=>MORSE[symbol] || '').join('')).join(' ').replace(/\s+/g,' ').trim();
}
export function MorseDecoder() {
  const [active,setActive]=useState(false);
  const [status,setStatus]=useState('');
  const [code,setCode]=useState('');
  const [decoded,setDecoded]=useState('');
  const [translated,setTranslated]=useState('');
  const [frequency,setFrequency]=useState(700);
  const [language,setLanguage]=useState(getInitialAppLanguage);
  const audioRef=useRef<{stream:MediaStream,context:AudioContext,source:MediaStreamAudioSourceNode,analyser:AnalyserNode,raf:number}|null>(null);
  const refs=useRef({on:false,lastTone:false,started:0,lastChange:0,unit:90,current:'',word:'',text:'',code:''});
  const lang=language === 'es' ? 'es' : 'en';
  const t=words[lang] || words.en;
  const stop = () => {
    const r=refs.current;
    if(r.current){
      const finalChar=MORSE[r.current]||'';
      r.text+=finalChar;
      setDecoded(r.text);
      if(!r.code.endsWith(' ')) r.code+=' ';
      setCode(r.code);
      r.current='';
    }
    const a=audioRef.current;
    if(a){cancelAnimationFrame(a.raf);a.source.disconnect();a.stream.getTracks().forEach(track=>track.stop());void a.context.close();audioRef.current=null;}
    r.on=false;setActive(false);
  };
  useEffect(()=>()=>{const a=audioRef.current;if(a){cancelAnimationFrame(a.raf);a.stream.getTracks().forEach(track=>track.stop());void a.context.close();}},[]);
  useEffect(()=>{
    const text=decoded.trim();
    if(!text){setTranslated('');return;}
    if(language==='es'){setTranslated(text);return;}
    let cancelled=false;
    const timer=window.setTimeout(async()=>{
      try{const response=await fetch('/api/translate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text,language})});if(!response.ok)throw new Error('translation unavailable');const data=await response.json();if(!cancelled)setTranslated(typeof data.translated==='string'?data.translated:text);}
      catch{if(!cancelled)setTranslated(text);}
    },500);
    return()=>{cancelled=true;window.clearTimeout(timer);};
  },[decoded,language]);
  const start = async () => {
    if(!navigator.mediaDevices?.getUserMedia){setStatus(t.unsupported);return;}
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
      const context=new AudioContext();await context.resume();
      const source=context.createMediaStreamSource(stream);const analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=0.12;source.connect(analyser);
      const data=new Uint8Array(analyser.frequencyBinCount);const r=refs.current;
      Object.assign(r,{on:true,lastTone:false,started:0,lastChange:performance.now(),unit:90,current:'',word:'',text:decoded,code});
      const tick=()=>{
        if(!audioRef.current||!refs.current.on)return;
        analyser.getByteFrequencyData(data);
        const binWidth=context.sampleRate/analyser.fftSize;const target=Math.round(frequency/binWidth);
        let energy=0,near=0;
        for(let i=Math.max(1,target-2);i<=Math.min(data.length-1,target+2);i++){near=Math.max(near,data[i]);}
        for(let i=1;i<data.length;i++)energy+=data[i];
        const noise=energy/data.length;
        const tone=near>Math.max(18,noise*2.6);
        const now=performance.now();const state=refs.current;
        if(tone!==state.lastTone){
          const duration=now-state.lastChange;
          if(state.lastTone){
            if(duration>35){const unit=state.unit;const symbol=duration<unit*2.15?'.':'-';state.current+=symbol;state.code+=symbol;setCode(state.code);}
          } else {
            if(duration>state.unit*2.1 && state.current){const char=MORSE[state.current]||'';state.text+=char;state.code+=' ';state.current='';setDecoded(state.text);setCode(state.code);}
            if(duration>state.unit*5.3 && state.text && !state.text.endsWith(' ')){state.text+=' ';state.code+='/ ';setDecoded(state.text);setCode(state.code);}
          }
          state.lastTone=tone;state.lastChange=now;
        }
        audioRef.current.raf=requestAnimationFrame(tick);
      };
      audioRef.current={stream,context,source,analyser,raf:requestAnimationFrame(tick)};
      setActive(true);setStatus(t.listening);
    }catch{setStatus(t.permission);stop();}
  };
  const clear=()=>{setCode('');setDecoded('');setTranslated('');Object.assign(refs.current,{current:'',text:'',code:''});};
  return <section className="my-4" data-no-translate>
    <button type="button" onClick={()=>setStatus(status ? '' : t.idle)} className="mb-2 w-full rounded-xl border border-blue-700 bg-blue-500 px-4 py-3 text-left font-bold text-black shadow-sm hover:bg-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-700">
      Traductor Morse
    </button>
    <div className="rounded-2xl border border-cyan-300 bg-white/95 p-4 shadow-sm">
    <div className="flex items-center gap-3 mb-3"><div className="rounded-xl bg-cyan-100 p-2 text-cyan-800"><AudioLines className="h-5 w-5"/></div><div className="min-w-0 flex-1"><h2 className="font-bold text-lg text-slate-900">{label[language]||label.es}</h2><p className="text-xs text-slate-600">Solo micrófono del teléfono · decodificación en directo</p></div></div>
    <div className="flex flex-wrap items-center gap-2 mb-3">
      {!active?<button onClick={start} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 font-semibold text-white"><Mic className="h-4 w-4"/>{t.start}</button>:<button onClick={stop} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-semibold text-white"><MicOff className="h-4 w-4"/>{t.stop}</button>}
      <button onClick={clear} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-slate-700"><Trash2 className="h-4 w-4"/>{t.clear}</button>
      <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">Hz <input aria-label="Frecuencia del tono Morse" type="range" min="400" max="1000" step="25" value={frequency} onChange={e=>setFrequency(Number(e.target.value))}/><span className="w-10 tabular-nums">{frequency}</span></label>
    </div>
    <p role="status" className="mb-3 text-sm text-slate-600">{status||t.idle}</p>
    <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.morse}</label><div className="min-h-10 break-all rounded-lg bg-slate-50 p-3 font-mono text-lg text-slate-800">{code||'…'}</div>
    <label className="mb-1 mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">{t.decoded}</label><div aria-live="polite" className="min-h-12 whitespace-pre-wrap break-words rounded-lg border border-slate-200 p-3 text-lg text-slate-900">{decoded||'…'}</div>
    {language!=='es'&&<><label className="mb-1 mt-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500"><Languages className="h-3 w-3"/>{t.translation}</label><div aria-live="polite" className="min-h-10 whitespace-pre-wrap break-words rounded-lg bg-cyan-50 p-3 text-slate-900">{translated||t.translate}</div></>}
    <p className="mt-3 text-xs leading-relaxed text-slate-500">El resultado depende de la claridad del tono, la velocidad y el ruido ambiental. Ajusta la frecuencia y mantén el teléfono cerca del altavoz; comprueba el texto antes de usarlo.</p>
    </div>
  </section>;
}
