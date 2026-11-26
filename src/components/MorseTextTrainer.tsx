import React, { useEffect, useRef, useState } from 'react';

type Props = { language?: string; activeCallsign?: string };
type CourseProgress = { step: number; level: number; mastery: Record<string, number> };

const getPersonalCallsign = (): string => {
  if (typeof window === 'undefined') return '';
  return (localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
};
const MORSE: Record<string,string> = {
  A:'.-',B:'-...',C:'-.-.',D:'-..',E:'.',F:'..-.',G:'--.',H:'....',I:'..',J:'.---',K:'-.-',L:'.-..',M:'--',N:'-.',O:'---',P:'.--.',Q:'--.-',R:'.-.',S:'...',T:'-',U:'..-',V:'...-',W:'.--',X:'-..-',Y:'-.--',Z:'--..',
  '0':'-----','1':'.----','2':'..---','3':'...--','4':'....-','5':'.....','6':'-....','7':'--...','8':'---..','9':'----.',
  '.':'.-.-.-',',':'--..--','?':'..--..',"'":'.----.','!':'-.-.--','/':'-..-.','(':'-.--.',')':'-.--.-','&':'.-... ',':':'---...',';':'-.-.-.','=':'-...-','+':'.-.-.','-':'-....-','_':'..--.-','"':'.-..-.','$':'...-..-','@':'.--.-.','Ñ':'--.--'
};
const REVERSE: Record<string,string> = Object.fromEntries(Object.entries(MORSE).map(([letter,code])=>[code.trim(),letter]));
const GROUPS = ['ET','AN','IM','SO','RH','DU','CK','WG','PB','LF','QV','XYZ','1234567890'];
const getCourseGroups = (identity:string):string[] => {
  const personal = [...new Set([...identity].filter((character) => /^[A-Z0-9]$/.test(character) && !GROUPS[0].includes(character)))].join('');
  return personal ? [GROUPS[0], personal, ...GROUPS.slice(1)] : GROUPS;
};
const normalize = (value:string) => value.toUpperCase().replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U').replace(/Ü/g,'U').replace(/Ñ/g,'N');
const encode = (value:string) => normalize(value).split(' ').map(word=>[...word].map(ch=>MORSE[ch]?.trim()||'').filter(Boolean).join(' ')).filter((word,index,all)=>word!==''||index===0||index===all.length-1).join(' / ');
const decode = (value:string) => value.trim().split(/\s*\/\s*/).map(word=>word.trim().split(/\s+/).filter(Boolean).map(code=>REVERSE[code]||'�').join('')).join(' ');
const emptyProgress = (): CourseProgress => ({ step: 0, level: 0, mastery: {} });
const readProgress = (key:string): CourseProgress => {
  try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (saved && Number.isInteger(saved.step) && Number.isInteger(saved.level) && saved.mastery && typeof saved.mastery === 'object') return { step: Math.max(0,Math.min(4,saved.step)), level: Math.max(0,Math.min(50,saved.level)), mastery: saved.mastery }; } catch {}
  return emptyProgress();
};
const pickChallenge = (level:number, mastery:Record<string,number>, groups:string[] = GROUPS):string => {
  const pool = groups.slice(0,Math.max(1,level+1)).join('');
  const weighted = [...pool].flatMap(character => Array(Math.max(1,3-Math.min(2,mastery[character]||0))).fill(character));
  return weighted[Math.floor(Math.random()*weighted.length)] || 'E';
};

export function MorseTextTrainer({language='es',activeCallsign=''}:Props) {
  const es=language==='es'||language==='pt'||language==='pt-br';
  const identity=(activeCallsign||getPersonalCallsign()).trim().toUpperCase();
  const storageKey='morse_course_progress_'+(identity||'sin-identidad').replace(/[^A-Z0-9_-]/g,'_');
  const courseGroups=getCourseGroups(identity);
  const [mode,setMode]=useState<'convert'|'learn'>('learn');
  const [text,setText]=useState(()=>identity?`CQ CQ CQ DE ${identity}`:'CQ CQ CQ');
  const [morseInput,setMorseInput]=useState('... --- ... / .- .-.. .-..');
  const [wpm,setWpm]=useState(18);
  const [playing,setPlaying]=useState(false);
  const [progress,setProgress]=useState<CourseProgress>(()=>readProgress(storageKey));
  const [challenge,setChallenge]=useState('E');
  const [answer,setAnswer]=useState('');
  const [lessonAnswer,setLessonAnswer]=useState('');
  const [result,setResult]=useState('');
  const playback=useRef<{ctx:AudioContext;osc:OscillatorNode}|null>(null);
  const skipSave=useRef(false);
  const output=encode(text);
  const callMessage=identity?`CQ CQ CQ DE ${identity}`:'CQ CQ CQ';

  useEffect(()=>{
    const saved=readProgress(storageKey);skipSave.current=true;setProgress(saved);setChallenge(pickChallenge(saved.level,saved.mastery,courseGroups));
    setAnswer('');setLessonAnswer('');setResult('');setText(identity?`CQ CQ CQ DE ${identity}`:'CQ CQ CQ');
  },[storageKey,identity]);
  useEffect(()=>{if(skipSave.current){skipSave.current=false;return;}try{localStorage.setItem(storageKey,JSON.stringify(progress));}catch{}},[progress,storageKey]);

  const stop=()=>{const current=playback.current;if(current){try{current.osc.stop();}catch{}void current.ctx.close();playback.current=null;}setPlaying(false);};
  useEffect(()=>()=>{const current=playback.current;if(current){try{current.osc.stop();}catch{}void current.ctx.close();}},[]);
  const playText=async(message:string)=>{
    if(playing){stop();return;}const clean=normalize(message).trim();if(!clean)return;
    try{
      const ctx=new AudioContext();await ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.value=700;gain.gain.value=0;osc.connect(gain);gain.connect(ctx.destination);
      const unit=1.2/wpm;let at=ctx.currentTime+0.06;
      const tone=(units:number)=>{const duration=unit*units;gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(0.18,at+0.005);gain.gain.setValueAtTime(0.18,at+duration-0.005);gain.gain.linearRampToValueAtTime(0,at+duration);at+=duration;};
      const words=clean.split(/\s+/);
      words.forEach((word,wi)=>{[...word].forEach((letter,li)=>{const code=MORSE[letter]?.trim();if(!code)return;[...code].forEach((symbol,si)=>{tone(symbol==='.'?1:3);if(si<code.length-1)at+=unit;});if(li<word.length-1)at+=unit*3;});if(wi<words.length-1)at+=unit*7;});
      osc.start(ctx.currentTime+0.06);osc.stop(at+0.03);playback.current={ctx,osc};setPlaying(true);
      osc.onended=()=>{if(playback.current?.osc===osc){playback.current=null;setPlaying(false);void ctx.close();}};
    }catch{setPlaying(false);}
  };
  const play=()=>void playText(text);
  const newChallenge=(level=progress.level,mastery=progress.mastery)=>{setChallenge(pickChallenge(level,mastery,courseGroups));setAnswer('');};

  const checkLesson=()=>{
    if(progress.step===1){
      const meaning=normalize(lessonAnswer).trim();
      if(!/(llamada general|llamada a todos|llamar a todos|a todas las estaciones|general|a todos)/.test(meaning)){setResult(es?'No exactamente. CQ es una llamada general dirigida a cualquier estación.':'Not quite. CQ is a general call addressed to any station.');setLessonAnswer('');return;}
      setProgress(current=>({...current,step:2}));setLessonAnswer('');setResult(es?'¡Correcto! Ahora practica transmitir CQ CQ CQ.':'Correct! Now practise sending CQ CQ CQ.');return;
    }
    if(progress.step===2){
      if(normalize(lessonAnswer).replace(/\s/g,'')!=='CQCQCQ'){setResult(es?'La transmisión correcta es: CQ CQ CQ. Volvé a intentarlo.':'The correct transmission is CQ CQ CQ. Try again.');setLessonAnswer('');return;}
      setProgress(current=>({...current,step:3}));setLessonAnswer('');setResult(es?'¡Correcto! Ahora transmití tu propia señal distintiva.':'Correct! Now send your own callsign.');return;
    }
    if(progress.step===3){
      if(!identity){setResult(es?'Primero necesitás una identidad validada en la aplicación.':'You need a validated identity in the app first.');return;}
      if(normalize(lessonAnswer).replace(/\s/g,'')!==normalize(identity).replace(/\s/g,'')){setResult(es?`La señal distintiva activa es ${identity}. Volvé a intentarlo.`:`Your active callsign is ${identity}. Try again.`);setLessonAnswer('');return;}
      const next={...progress,step:4,level:0,mastery:{}};setProgress(next);setChallenge(pickChallenge(0,{}));setLessonAnswer('');setResult(es?'¡Excelente! Comienza la primera serie de letras: E y T.':'Excellent! Your first letter group is E and T.');
    }
  };
  const checkCharacter=()=>{
    if(!challenge||!answer.trim())return;
    if(answer.trim().toUpperCase()!==challenge){setResult(es?`Incorrecto. La respuesta correcta era ${challenge}. Vamos con otra.`:`Incorrect. The correct answer was ${challenge}. Here is another.`);newChallenge();return;}
    const mastery={...progress.mastery,[challenge]:(progress.mastery[challenge]||0)+1};
    const group=courseGroups[progress.level]||courseGroups[courseGroups.length-1];
    const complete=[...group].every(character=>(mastery[character]||0)>=2);
    const nextLevel=complete?Math.min(progress.level+1,courseGroups.length-1):progress.level;
    setProgress({...progress,mastery,level:nextLevel});
    setResult(complete&&nextLevel!==progress.level?(es?`¡Correcto! Muy bien. Nuevo grupo: ${GROUPS[nextLevel].split('').join(' · ')}.`:`Correct! Well done. New group: ${GROUPS[nextLevel].split('').join(' · ')}.`):(es?'¡Correcto! Muy bien.':'Correct! Well done.'));
    newChallenge(nextLevel,mastery);
  };
  const resetCourse=()=>{setProgress(emptyProgress());setChallenge('E');setAnswer('');setLessonAnswer('');setResult(es?'Curso reiniciado para esta identidad.':'Course reset for this identity.');};

  return <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-bold text-slate-900">{es?'Aprende y transmite Morse':'Learn and transmit Morse'}</h3><p className="text-xs text-slate-600">{es?'Curso progresivo · progreso guardado por identidad':'Progressive course · progress saved per identity'}</p></div>
      <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
        <button type="button" onClick={()=>setMode('learn')} className={'rounded-md px-3 py-1.5 text-xs font-bold '+(mode==='learn'?'bg-white text-cyan-800 shadow':'text-slate-600')}>{es?'Curso':'Course'}</button>
        <button type="button" onClick={()=>setMode('convert')} className={'rounded-md px-3 py-1.5 text-xs font-bold '+(mode==='convert'?'bg-white text-cyan-800 shadow':'text-slate-600')}>{es?'Convertir':'Convert'}</button>
      </div>
    </div>
    {mode==='convert'?<div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-800">{es?'Escribe tu mensaje':'Write your message'}</label>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={3} maxLength={500} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-base text-slate-900" placeholder={es?'Escribe aquí…':'Type here…'}/>
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700"><span>{es?'Velocidad':'Speed'}</span><span>{wpm} WPM</span></div>
      <input aria-label="WPM" type="range" min="5" max="40" value={wpm} onChange={e=>setWpm(Number(e.target.value))} className="w-full accent-cyan-700"/>
      <div className="rounded-lg bg-slate-950 p-3"><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Morse</div><div className="min-h-8 break-words font-mono text-lg leading-relaxed tracking-wider text-emerald-300">{output||'—'}</div></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={play} className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white">{playing?'■ '+(es?'Detener':'Stop'):'▶ '+(es?'Reproducir Morse':'Play Morse')}</button><button type="button" onClick={()=>{void navigator.clipboard?.writeText(output);}} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-semibold text-slate-700">{es?'Copiar código':'Copy code'}</button></div>
      <label className="block text-sm font-semibold text-slate-800">{es?'Morse a texto (modo inverso)':'Morse to text (reverse mode)'}</label>
      <textarea value={morseInput} onChange={e=>setMorseInput(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-base text-slate-900" placeholder="... --- ... / .- .-.. .-.."/>
      <div className="rounded-lg border border-slate-200 bg-white p-3 font-semibold text-slate-800">{decode(morseInput)||'—'}</div>
      <p className="text-xs text-slate-600">{es?'Punto = 1 unidad · Raya = 3 · Entre señales = 1 · Entre letras = 3 · Entre palabras = 7.':'Dot = 1 unit · Dash = 3 · Between signals = 1 · Between letters = 3 · Between words = 7.'}</p>
    </div>:<div className="space-y-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-cyan-900">{es?'Lección 1 · Mi primera llamada CQ':'Lesson 1 · My first CQ call'}</p><span className="text-[11px] text-slate-600">{progress.step<4?(es?`Paso ${progress.step+1} de 4`:`Step ${progress.step+1} of 4`):(es?`Nivel ${progress.level+1} de ${courseGroups.length}`:`Level ${progress.level+1} of ${courseGroups.length}`)}</span></div>
      {progress.step===0&&<div className="space-y-3"><p className="text-sm text-slate-700">{es?'Primero escuchá la llamada completa con tu identidad activa:':'First, listen to the complete call using your active identity:'}</p><div className="rounded-lg bg-slate-950 p-3 text-center font-mono text-lg font-bold text-amber-300">{callMessage}</div><div className="rounded-lg bg-slate-950 p-3 text-center font-mono text-base tracking-widest text-emerald-300">{encode(callMessage)}</div><div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void playText(callMessage)} className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white">{playing?'■ '+(es?'Detener':'Stop'):'▶ '+(es?'Escuchar llamada completa':'Listen to full call')}</button><button type="button" onClick={()=>{setProgress(current=>({...current,step:1}));setResult('');}} className="rounded-lg bg-cyan-700 px-4 py-2.5 font-semibold text-white">{es?'Ya la escuché':'I listened'}</button></div></div>}
      {progress.step===1&&<div className="space-y-3"><p className="text-sm font-semibold text-slate-800">{es?'¿Qué significa CQ en una llamada de radio?':'What does CQ mean in a radio call?'}</p><input value={lessonAnswer} onChange={e=>setLessonAnswer(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900" placeholder={es?'Escribí el significado…':'Enter the meaning…'}/><button type="button" disabled={!lessonAnswer.trim()} onClick={checkLesson} className="rounded-lg bg-cyan-700 px-4 py-2.5 font-semibold text-white disabled:opacity-40">{es?'Comprobar':'Check'}</button></div>}
      {(progress.step===2||progress.step===3)&&<div className="space-y-3"><p className="text-sm font-semibold text-slate-800">{progress.step===2?(es?'Ahora transmití CQ CQ CQ. Escribí la llamada completa:':'Now send CQ CQ CQ. Enter the complete call:'):(es?'Transmití tu propia señal distintiva:':'Send your own callsign:')}</p><div className="rounded-lg bg-slate-950 p-3 text-center font-mono text-lg font-bold text-amber-300">{progress.step===2?'CQ CQ CQ':identity||'—'}</div><input value={lessonAnswer} onChange={e=>setLessonAnswer(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono uppercase text-slate-900" placeholder={es?'Escribí lo que transmitirías…':'Type what you would send…'}/><div className="flex flex-wrap gap-2"><button type="button" disabled={!lessonAnswer.trim()} onClick={()=>void playText(lessonAnswer)} className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white">{es?'Escuchar mi transmisión':'Listen to my transmission'}</button><button type="button" disabled={!lessonAnswer.trim()} onClick={checkLesson} className="rounded-lg bg-cyan-700 px-4 py-2.5 font-semibold text-white disabled:opacity-40">{es?'Comprobar':'Check'}</button></div></div>}
      {progress.step>=4&&<div className="space-y-3"><p className="text-sm text-slate-700">{es?'Reconocé la letra que representa esta señal. Las letras nuevas se incorporan por grupos y las que cuestan más aparecen con mayor frecuencia.':'Identify the character represented by this signal. New characters are introduced in groups, and weaker ones appear more often.'}</p><div className="text-xs font-semibold text-cyan-900">{es?'Letras incorporadas:':'Characters learned:'} {courseGroups.slice(0,progress.level+1).join(' · ')}</div><div className="rounded-lg bg-slate-950 p-4 text-center font-mono text-3xl tracking-[0.25em] text-emerald-300">{MORSE[challenge]||'—'}</div><div className="flex gap-2"><input value={answer} onChange={e=>setAnswer(e.target.value)} maxLength={1} onKeyDown={e=>{if(e.key==='Enter')checkCharacter();}} placeholder="?" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white p-2 text-center text-lg uppercase text-slate-900"/><button type="button" onClick={checkCharacter} disabled={!answer.trim()} className="rounded-lg bg-cyan-700 px-4 py-2 font-semibold text-white disabled:opacity-40">{es?'Comprobar':'Check'}</button><button type="button" onClick={()=>newChallenge()} className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-semibold text-slate-700">{es?'Otra':'Next'}</button></div></div>}
      {result&&<p role="status" className="rounded-lg bg-white p-2 text-sm font-bold text-slate-800">{result}</p>}
      <div className="flex items-center justify-between border-t border-cyan-200 pt-2"><span className="text-[10px] text-slate-500">{identity?((es?'Identidad: ':'Identity: ')+identity):(es?'Sin identidad seleccionada':'No identity selected')}</span><button type="button" onClick={resetCourse} className="text-[10px] font-semibold text-slate-500 underline">{es?'Reiniciar curso':'Reset course'}</button></div>
    </div>}
  </div>;
}
