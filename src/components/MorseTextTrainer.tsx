import React, { useEffect, useRef, useState } from 'react';

type Props = { language?: string };

const getPersonalCallsign = (): string => {
  if (typeof window === 'undefined') return '';
  const cbCallsign = localStorage.getItem('cb_station_callsign')?.trim().toUpperCase();
  const verifiedSd = localStorage.getItem('community_chat_identity_token')
    ? localStorage.getItem('community_chat_sd')?.trim().toUpperCase()
    : '';
  const hamCallsign = localStorage.getItem('user_callsign')?.trim().toUpperCase();
  return cbCallsign || verifiedSd || hamCallsign || '';
};

const MORSE: Record<string,string> = {
  A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
  '.':'.-.-.-',',':'--..--','?':'..--..',"'":'.----.','!':'-.-.--','/':'-..-.','(':'-.--.',')':'-.--.-','&':'.-... ',':':'---...',';':'-.-.-.','=':'-...-','+':'.-.-.','-':'-....-','_':'..--.-','"':'.-..-.','$':'...-..-','@':'.--.-.','Ñ':'--.--'
};
const REVERSE: Record<string,string> = Object.fromEntries(Object.entries(MORSE).map(([letter,code])=>[code.trim(),letter]));
const normalize = (value:string) => value.toUpperCase().replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U').replace(/Ü/g,'U');
const encode = (value:string) => normalize(value).split(' ').map(word=>[...word].map(ch=>MORSE[ch]?.trim()||'').filter(Boolean).join(' ')).filter((word,index,all)=>word!==''||index===0||index===all.length-1).join(' / ');
const decode = (value:string) => value.trim().split(/\s*\/\s*/).map(word=>word.trim().split(/\s+/).filter(Boolean).map(code=>REVERSE[code]||'�').join('')).join(' ');

export function MorseTextTrainer({language='es'}:Props) {
  const es=language==='es'||language==='pt'||language==='pt-br';
  const [mode,setMode]=useState<'convert'|'learn'>('convert');
  const [text,setText]=useState(()=>{
    const callsign=getPersonalCallsign();
    return callsign ? `CQ CQ CQ DE ${callsign}` : 'CQ CQ CQ';
  });
  const [morseInput,setMorseInput]=useState('... --- ... / .- .-.. .-..');
  const [wpm,setWpm]=useState(18);
  const [playing,setPlaying]=useState(false);
  const [challenge,setChallenge]=useState('');
  const [answer,setAnswer]=useState('');
  const [result,setResult]=useState('');
  const playback=useRef<{ctx:AudioContext;osc:OscillatorNode}|null>(null);
  const output=encode(text);

  const stop=()=>{const current=playback.current;if(current){try{current.osc.stop();}catch{}void current.ctx.close();playback.current=null;}setPlaying(false);};
  useEffect(()=>()=>{const current=playback.current;if(current){try{current.osc.stop();}catch{}void current.ctx.close();}},[]);

  const play=async()=>{
    if(playing){stop();return;}
    if(!output)return;
    try{
      const ctx=new AudioContext();await ctx.resume();
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.value=700;gain.gain.value=0;osc.connect(gain);gain.connect(ctx.destination);
      const unit=1.2/wpm;let at=ctx.currentTime+0.06;
      const tone=(units:number)=>{const duration=unit*units;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(0.18,at+0.005);gain.gain.setValueAtTime(0.18,at+duration-0.005);gain.gain.linearRampToValueAtTime(0,at+duration);at+=duration;};
      const words=normalize(text).split(' ');
      words.forEach((word,wi)=>{
        [...word].forEach((letter,li)=>{
          const code=MORSE[letter]?.trim();if(!code)return;
          [...code].forEach((symbol,si)=>{tone(symbol==='.'?1:3);if(si<code.length-1)at+=unit;});
          if(li<word.length-1)at+=unit*3;
        });
        if(wi<words.length-1)at+=unit*4;
      });
      osc.start(ctx.currentTime+0.06);osc.stop(at+0.03);playback.current={ctx,osc};setPlaying(true);
      osc.onended=()=>{if(playback.current?.osc===osc){playback.current=null;setPlaying(false);void ctx.close();}};
    }catch{setPlaying(false);}
  };

  const newChallenge=()=>{const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';setChallenge(chars[Math.floor(Math.random()*chars.length)]);setAnswer('');setResult('');};
  useEffect(()=>{if(mode==='learn'&&!challenge)newChallenge();},[mode,challenge]);
  const check=()=>{
    if(!challenge||!answer.trim())return;
    const correct=answer.trim().toUpperCase()===challenge;
    if(correct){
      setResult(es?'¡Correcto! Muy bien.':'Correct! Well done.');
    }else{
      setResult(es?`Incorrecto. La respuesta correcta era ${challenge}.`:`Incorrect. The correct answer was ${challenge}.`);
      const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const next=chars[Math.floor(Math.random()*chars.length)];
      setChallenge(next);
      setAnswer('');
    }
  };

  return <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-bold text-slate-900">{es?'Aprende y transmite Morse':'Learn and transmit Morse'}</h3><p className="text-xs text-slate-600">{es?'Convierte texto, escucha los tonos y practica.':'Convert text, listen to tones and practice.'}</p></div>
      <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
        <button type="button" onClick={()=>setMode('convert')} className={'rounded-md px-3 py-1.5 text-xs font-bold '+(mode==='convert'?'bg-white text-cyan-800 shadow':'text-slate-600')}>{es?'Convertir':'Convert'}</button>
        <button type="button" onClick={()=>setMode('learn')} className={'rounded-md px-3 py-1.5 text-xs font-bold '+(mode==='learn'?'bg-white text-cyan-800 shadow':'text-slate-600')}>{es?'Practicar':'Practice'}</button>
      </div>
    </div>
    {mode==='convert'?<div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-800">{es?'Escribe tu mensaje':'Write your message'}</label>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={3} maxLength={500} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-base text-slate-900" placeholder={es?'Escribe aquí…':'Type here…'}/>
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700"><span>{es?'Velocidad':'Speed'}</span><span>{wpm} WPM</span></div>
      <input aria-label="WPM" type="range" min="5" max="40" value={wpm} onChange={e=>setWpm(Number(e.target.value))} className="w-full accent-cyan-700"/>
      <div className="rounded-lg bg-slate-950 p-3"><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Morse</div><div className="min-h-8 break-words font-mono text-lg leading-relaxed tracking-wider text-emerald-300">{output||'—'}</div></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={play} className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white">{playing?'■ '+(es?'Detener':'Stop'):'▶ '+(es?'Reproducir Morse':'Play Morse')}</button>
        <button type="button" onClick={()=>{void navigator.clipboard?.writeText(output);}} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-semibold text-slate-700">{es?'Copiar código':'Copy code'}</button>
      </div>
      <label className="block text-sm font-semibold text-slate-800">{es?'Morse a texto (modo inverso)':'Morse to text (reverse mode)'}</label>
      <textarea value={morseInput} onChange={e=>setMorseInput(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-base text-slate-900" placeholder="... --- ... / .- .-.. .-.."/>
      <div className="rounded-lg border border-slate-200 bg-white p-3 font-semibold text-slate-800">{decode(morseInput)||'—'}</div>
      <p className="text-xs text-slate-600">{es?'Punto = 1 unidad · Raya = 3 · Entre señales = 1 · Entre letras = 3 · Entre palabras = 7.':'Dot = 1 unit · Dash = 3 · Between signals = 1 · Between letters = 3 · Between words = 7.'}</p>
    </div>:<div className="space-y-3">
      <p className="text-sm text-slate-700">{es?'Descubre qué letra o número representa esta señal:':'Find the letter or number represented by this signal:'}</p>
      <div className="rounded-lg bg-slate-950 p-4 text-center font-mono text-3xl tracking-[0.25em] text-emerald-300">{challenge?MORSE[challenge]:'—'}</div>
      <div className="flex gap-2">
        <input value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={1} placeholder="?" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-2 text-center text-lg uppercase text-slate-900"/>
        <button type="button" onClick={check} disabled={!challenge||!answer.trim()} className="rounded-lg bg-cyan-700 px-4 py-2 font-semibold text-white disabled:opacity-40">{es?'Comprobar':'Check'}</button>
        <button type="button" onClick={newChallenge} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700">{es?'Otra':'Next'}</button>
      </div>
      {result&&<p role="status" className="font-bold text-slate-800">{result}</p>}
    </div>}
  </div>;
}
