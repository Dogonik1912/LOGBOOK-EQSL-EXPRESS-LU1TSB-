import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';

type Props = { language?: string; activeCallsign?: string };
type LetterStats = { correct: number; wrong: number };
type CourseProgress = { level: number; stats: Record<string, LetterStats> };

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
// C and Q are deliberately taught first as a listening contrast. CQ itself is explained much later.
const GROUPS = ['CQ','ET','AN','IM','SO','RH','DU','KG','WF','LP','BX','VJ','ZY','1234567890'];
const normalize = (value:string) => value.toUpperCase().replace(/Á/g,'A').replace(/É/g,'E').replace(/Í/g,'I').replace(/Ó/g,'O').replace(/Ú/g,'U').replace(/Ü/g,'U').replace(/Ñ/g,'N');
const encode = (value:string) => normalize(value).split(' ').map(word=>[...word].map(ch=>MORSE[ch]?.trim()||'').filter(Boolean).join(' ')).filter((word,index,all)=>word!==''||index===0||index===all.length-1).join(' / ');
const decode = (value:string) => value.trim().split(/\s*\/\s*/).map(word=>word.trim().split(/\s+/).filter(Boolean).map(code=>REVERSE[code]||'�').join('')).join(' ');
const emptyProgress = (): CourseProgress => ({ level: 0, stats: {} });
const readProgress = (key:string): CourseProgress => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || 'null');
    if (saved && Number.isInteger(saved.level) && saved.stats && typeof saved.stats === 'object') {
      return { level: Math.max(0,Math.min(GROUPS.length,saved.level)), stats: saved.stats };
    }
  } catch {}
  return emptyProgress();
};
const getStats = (stats:Record<string,LetterStats>,letter:string):LetterStats => stats[letter] || {correct:0,wrong:0};
const isMastered = (stats:Record<string,LetterStats>,letter:string) => {
  const value=getStats(stats,letter), attempts=value.correct+value.wrong;
  return value.correct>=5 && attempts>0 && value.correct/attempts>=0.8;
};
const shuffle = <T,>(items:T[]):T[] => [...items].sort(()=>Math.random()-0.5);
const makeChoices = (letter:string,available:string[]) => shuffle([letter,...shuffle(available.filter(item=>item!==letter)).slice(0,Math.min(3,Math.max(0,available.length-1)))]);
const pickChallenge = (available:string[],stats:Record<string,LetterStats>) => {
  const weighted=available.flatMap(letter=>{
    const value=getStats(stats,letter), accuracy=(value.correct+value.wrong)>0?value.correct/(value.correct+value.wrong):0;
    const weight=Math.max(1,Math.round((1.25-accuracy)*5));
    return Array(weight).fill(letter);
  });
  return weighted[Math.floor(Math.random()*weighted.length)] || available[0] || 'C';
};

export function MorseTextTrainer({language='es',activeCallsign=''}:Props) {
  const es=language==='es'||language==='pt'||language==='pt-br';
  const identity=(activeCallsign||getPersonalCallsign()).trim().toUpperCase();
  // v2 intentionally starts a new course: the previous CQ-first lesson is not carried forward.
  const storageKey='morse_course_progress_v2_'+(identity||'sin-identidad').replace(/[^A-Z0-9_-]/g,'_');
  const [mode,setMode]=useState<'learn'|'convert'>('learn');
  const [text,setText]=useState('');
  const [morseInput,setMorseInput]=useState('... --- ... / .- .-.. .-..');
  const [wpm,setWpm]=useState(10);
  const [playing,setPlaying]=useState(false);
  const [progress,setProgress]=useState<CourseProgress>(()=>readProgress(storageKey));
  const [challenge,setChallenge]=useState('C');
  const [choices,setChoices]=useState<string[]>(['C','Q']);
  const [result,setResult]=useState('');
  const [pendingNext,setPendingNext]=useState(false);
  const playback=useRef<{ctx:AudioContext;osc:OscillatorNode}|null>(null);
  const [sessionRunning,setSessionRunning]=useState(false);
  const [sessionSeconds,setSessionSeconds]=useState(0);
  const [sessionCount,setSessionCount]=useState(0);
  const [sessionTotalSeconds,setSessionTotalSeconds]=useState(0);
  const [sessionMessage,setSessionMessage]=useState('');
  const [sessionSyncError,setSessionSyncError]=useState(false);
  const sessionId=useRef<string|null>(null);
  const sessionFinished=useRef(false);
  const identityToken=typeof window!=='undefined'?localStorage.getItem('community_chat_identity_token')||'':'';
  const output=encode(text);
  const available=GROUPS.slice(0,Math.min(progress.level+1,GROUPS.length)).join('').split('');
  const currentGroup=GROUPS[Math.min(progress.level,GROUPS.length-1)] || 'CQ';
  const courseComplete=progress.level>=GROUPS.length;

  useEffect(()=>{
    const saved=readProgress(storageKey);
    setProgress(saved);
    const first=pickChallenge(GROUPS[0].split(''),saved.stats);
    setChallenge(first);setChoices(makeChoices(first,GROUPS[0].split('')));
    setResult('');setPendingNext(false);setText('');
  },[storageKey,identity]);
  useEffect(()=>{try{localStorage.setItem(storageKey,JSON.stringify(progress));}catch{}},[progress,storageKey]);
  useEffect(()=>{
    let alive=true;
    const loadSessions=async()=>{
      if(!supabase||!identity||!identityToken){setSessionCount(0);setSessionTotalSeconds(0);return;}
      const {data,error}=await supabase.rpc('get_morse_practice_stats',{p_callsign:identity,p_token:identityToken});
      if(!alive||error||!data?.ok)return;
      setSessionCount(Number(data.sessions_completed)||0);
      setSessionTotalSeconds(Number(data.total_seconds)||0);
    };
    void loadSessions();
    return()=>{alive=false;};
  },[identity,identityToken]);
  useEffect(()=>{
    if(!sessionRunning||mode!=='learn')return;
    const tick=()=>{if(document.visibilityState==='visible')setSessionSeconds(value=>Math.min(600,value+1));};
    const timer=window.setInterval(tick,1000);
    return()=>window.clearInterval(timer);
  },[sessionRunning,mode]);
  useEffect(()=>{
    if(sessionSeconds<600||!sessionRunning||sessionFinished.current)return;
    sessionFinished.current=true;
    setSessionRunning(false);
    const completedId=sessionId.current;
    const save=async()=>{
      if(!supabase||!identity||!identityToken||!completedId){setSessionSyncError(true);return;}
      const {data,error}=await supabase.rpc('record_morse_practice_session',{
        p_callsign:identity,p_token:identityToken,p_session_id:completedId,p_duration_seconds:600
      });
      if(error||!data?.ok){setSessionSyncError(true);return;}
      setSessionSyncError(false);
      const {data:stats}=await supabase.rpc('get_morse_practice_stats',{p_callsign:identity,p_token:identityToken});
      if(stats?.ok){setSessionCount(Number(stats.sessions_completed)||0);setSessionTotalSeconds(Number(stats.total_seconds)||0);}
      const nextCount=Number(stats?.sessions_completed)||sessionCount+1;
      setSessionMessage(es
        ?(nextCount===1?'¡Felicidades! Has completado tu primera sesión de 10 minutos. Vuelve mañana y sigue practicando.':'¡Bienvenido a tu sesión '+nextCount+'! ¡Has cumplido tus 10 minutos de hoy! Vuelve mañana para seguir avanzando.')
        :(nextCount===1?'Congratulations! You completed your first 10-minute session. Come back tomorrow and keep practising.':'Welcome to session '+nextCount+'! You completed your 10 minutes today. Come back tomorrow to keep improving.'));
    };
    void save();
  },[sessionSeconds,sessionRunning,identity,identityToken,sessionCount,es]);
  const startPracticeSession=()=>{
    if(!identity||!identityToken||!supabase)return;
    sessionId.current=crypto.randomUUID();
    sessionFinished.current=false;
    setSessionSeconds(0);
    setSessionMessage('');
    setSessionSyncError(false);
    setSessionRunning(true);
  };
  const stop=()=>{
    const current=playback.current;
    if(current){try{current.osc.stop();}catch{}void current.ctx.close();playback.current=null;}
    setPlaying(false);
  };
  useEffect(()=>()=>{const current=playback.current;if(current){try{current.osc.stop();}catch{}void current.ctx.close();}},[]);
  const playMessage=async(message:string)=>{
    if(playing){stop();return;}
    const clean=normalize(message).trim();if(!clean)return;
    try{
      const ctx=new AudioContext();await ctx.resume();
      const osc=ctx.createOscillator(),gain=ctx.createGain();
      osc.type='sine';osc.frequency.value=650;gain.gain.value=0;osc.connect(gain);gain.connect(ctx.destination);
      const unit=1.2/wpm;let at=ctx.currentTime+0.06;
      const tone=(units:number)=>{
        const duration=unit*units;
        gain.gain.setValueAtTime(0,at);gain.gain.linearRampToValueAtTime(0.18,at+0.006);
        gain.gain.setValueAtTime(0.18,at+Math.max(0.008,duration-0.006));gain.gain.linearRampToValueAtTime(0,at+duration);at+=duration;
      };
      const words=clean.split(/\s+/);
      words.forEach((word,wi)=>{
        [...word].forEach((letter,li)=>{
          const code=MORSE[letter]?.trim();if(!code)return;
          [...code].forEach((symbol,si)=>{tone(symbol==='.'?1:3);if(si<code.length-1)at+=unit;});
          if(li<word.length-1)at+=unit*3;
        });
        if(wi<words.length-1)at+=unit*7;
      });
      osc.start(ctx.currentTime+0.06);osc.stop(at+0.04);playback.current={ctx,osc};setPlaying(true);
      osc.onended=()=>{if(playback.current?.osc===osc){playback.current=null;setPlaying(false);void ctx.close();}};
    }catch{setPlaying(false);}
  };
  const newChallenge=(level=progress.level,stats=progress.stats)=>{
    const pool=GROUPS.slice(0,Math.min(level+1,GROUPS.length)).join('').split('');
    const next=pickChallenge(pool,stats);
    setChallenge(next);setChoices(makeChoices(next,pool));setPendingNext(false);
  };
  const checkCharacter=(answer:string)=>{
    if(!answer||pendingNext||courseComplete)return;
    const updated={...progress.stats};
    const previous=getStats(updated,challenge);
    updated[challenge]=answer===challenge
      ? {...previous,correct:previous.correct+1}
      : {...previous,wrong:previous.wrong+1};
    const group=GROUPS[progress.level] || '';
    const groupMastered=[...group].every(letter=>isMastered(updated,letter));
    const nextLevel=groupMastered?Math.min(progress.level+1,GROUPS.length):progress.level;
    setProgress({level:nextLevel,stats:updated});
    if(answer===challenge){
      setResult(es?'¡Correcto! Has reconocido el sonido. Escucha otra vez y consolida la letra.':'Correct! You recognised the sound. Listen again and reinforce the letter.');
    }else{
      setResult(es?('Todavía no. Era '+challenge+'. Su sonido es '+MORSE[challenge].split('').join(' ')+'.'):('Not quite. It was '+challenge+'. Its signal is '+MORSE[challenge].split('').join(' ')+'.'));
    }
    setPendingNext(true);
    if(groupMastered){
      setResult(es?('¡Excelente! Ya diferencias '+group.split('').join(' y ')+'. Se incorpora el siguiente grupo.'):('Excellent! You can distinguish '+group.split('').join(' and ')+'. The next group is unlocked.'));
    }
  };
  const continueCourse=()=>{
    const level=progress.level;
    if(level>=GROUPS.length){setPendingNext(false);return;}
    newChallenge(level,progress.stats);
    setResult('');
  };
  const resetCourse=()=>{
    const fresh=emptyProgress();setProgress(fresh);setChallenge('C');setChoices(['C','Q']);setPendingNext(false);
    setResult(es?'Curso reiniciado. Empezamos diferenciando C y Q.':'Course reset. We start by distinguishing C and Q.');
  };
  const personalPractice=identity || (es?'tu indicativo':'your callsign');
  const callMessage=identity?'CQ CQ CQ DE '+identity:'CQ CQ CQ';

  return <div className="mb-4 rounded-xl border border-cyan-200 bg-cyan-50/60 p-3">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-bold text-slate-900">{es?'Aprende Morse de oído':'Learn Morse by ear'}</h3><p className="text-xs text-slate-600">{es?'Escucha, observa la señal y reconoce cada letra. Tu progreso se guarda por identidad.':'Listen, see the signal and recognise each character. Progress is saved per identity.'}</p></div>
      <div className="flex gap-1 rounded-lg bg-slate-200 p-1">
        <button type="button" onClick={()=>setMode('learn')} className={'rounded-md px-3 py-1.5 text-xs font-bold '+(mode==='learn'?'bg-white text-cyan-800 shadow':'text-slate-600')}>{es?'Curso':'Course'}</button>
        <button type="button" onClick={()=>setMode('convert')} className={'rounded-md px-3 py-1.5 text-xs font-bold '+(mode==='convert'?'bg-white text-cyan-800 shadow':'text-slate-600')}>{es?'Convertir':'Convert'}</button>
      </div>
    </div>
    {mode==='learn'&&<div className="rounded-lg border border-cyan-200 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm font-bold text-slate-800">{es?'Aprende Morse: dedica 10 minutos al día':'Learn Morse: practise 10 minutes a day'}</p><p className="text-xs text-slate-600">{es?'Sesiones completadas':'Completed sessions'}: <strong>{sessionCount}</strong> · {es?'Tiempo acumulado':'Total practice'}: {Math.floor(sessionTotalSeconds/60)} min</p></div>
        <div className="text-right"><div className="font-mono text-2xl font-black text-cyan-800">{String(Math.floor((600-sessionSeconds)/60)).padStart(2,'0')}:{String((600-sessionSeconds)%60).padStart(2,'0')}</div><p className="text-[10px] text-slate-500">{sessionRunning?(es?'Sesión en curso':'Session in progress'):(sessionSeconds>=600?(es?'Sesión completada':'Session completed'):(es?'10 minutos por sesión':'10 minutes per session'))}</p></div>
      </div>
      {!sessionRunning&&sessionSeconds<600&&<button type="button" disabled={!identity||!identityToken||!supabase} onClick={startPracticeSession} className="mt-2 w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-bold text-white disabled:opacity-40">{sessionSeconds>0?(es?'Reanudar sesión':'Resume session'):(es?'Comenzar sesión de 10 minutos':'Start 10-minute session')}</button>}
      {sessionRunning&&<p className="mt-2 text-xs text-emerald-700">{es?'El tiempo cuenta mientras el curso está visible. Si cambias al conversor o sales de la página, se pausa.':'Time counts while the course is visible. Switching to the converter or leaving the page pauses it.'}</p>}
      {sessionMessage&&<p role="status" className="mt-2 rounded-lg bg-emerald-50 p-2 text-sm font-semibold text-emerald-800">{sessionMessage}</p>}
      {sessionSyncError&&<p role="status" className="mt-2 text-xs text-amber-700">{es?'No se pudo sincronizar la sesión. Comprueba la conexión y vuelve a intentarlo.':'The session could not sync. Check your connection and try again.'}</p>}
      {!identity&&<p className="mt-2 text-xs text-amber-700">{es?'Selecciona tu identidad para sincronizar las sesiones entre dispositivos.':'Select your identity to sync sessions across devices.'}</p>}
    </div>}
    {mode==='convert'?<div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-800">{es?'Escribe tu mensaje':'Write your message'}</label>
      <textarea value={text} onChange={e=>setText(e.target.value)} rows={3} maxLength={500} className="w-full rounded-lg border border-slate-300 bg-white p-3 text-base text-slate-900" placeholder={es?'Escribe aquí…':'Type here…'}/>
      <div className="flex items-center justify-between text-sm font-semibold text-slate-700"><span>{es?'Velocidad':'Speed'}</span><span>{wpm} WPM</span></div>
      <input aria-label="WPM" type="range" min="5" max="25" value={wpm} onChange={e=>setWpm(Number(e.target.value))} className="w-full accent-cyan-700"/>
      <div className="rounded-lg bg-slate-950 p-3"><div className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">Morse</div><div className="min-h-8 break-words font-mono text-lg leading-relaxed tracking-wider text-emerald-300">{output||'—'}</div></div>
      <div className="flex flex-wrap gap-2"><button type="button" onClick={()=>void playMessage(text)} className="rounded-lg bg-emerald-600 px-4 py-2.5 font-semibold text-white">{playing?'■ '+(es?'Detener':'Stop'):'▶ '+(es?'Reproducir Morse':'Play Morse')}</button><button type="button" onClick={()=>{void navigator.clipboard?.writeText(output);}} className="rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-semibold text-slate-700">{es?'Copiar código':'Copy code'}</button></div>
      <label className="block text-sm font-semibold text-slate-800">{es?'Morse a texto (modo inverso)':'Morse to text (reverse mode)'}</label>
      <textarea value={morseInput} onChange={e=>setMorseInput(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 bg-white p-3 font-mono text-base text-slate-900" placeholder="... --- ... / .- .-.. .-.."/>
      <div className="rounded-lg border border-slate-200 bg-white p-3 font-semibold text-slate-800">{decode(morseInput)||'—'}</div>
      <p className="text-xs text-slate-600">{es?'Punto = 1 unidad · Raya = 3 · Entre señales = 1 · Entre letras = 3 · Entre palabras = 7.':'Dot = 1 unit · Dash = 3 · Between signals = 1 · Between letters = 3 · Between words = 7.'}</p>
    </div>:<div className="space-y-3">
      <div className="flex items-center justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-cyan-900">{es?'Entrenamiento auditivo':'Listening practice'}</p><span className="text-[11px] text-slate-600">{courseComplete?(es?'Curso básico completado':'Basic course completed'):(es?('Etapa '+(progress.level+1)+' de '+GROUPS.length):('Stage '+(progress.level+1)+' of '+GROUPS.length))}</span></div>
      {!courseComplete&&<>
        <div className="rounded-lg border border-cyan-200 bg-white p-3">
          <p className="text-sm font-semibold text-slate-800">{progress.level===0?(es?'Primero vamos a aprender a distinguir C y Q. Escucha el tono y observa cómo se forma cada señal.':'First, learn to tell C and Q apart. Listen to the tone and watch how each signal is formed.'):(es?'Escucha la letra y reconoce su sonido. Mira los puntos y las rayas para reforzar la memoria.':'Listen to the character and recognise its sound. Use the dots and dashes to reinforce your memory.')}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[...currentGroup].map(letter=><div key={letter} className={'rounded-lg p-3 text-center '+(letter===challenge?'bg-slate-900 text-white':'bg-slate-100 text-slate-800')}>
              <div className="text-2xl font-black">{letter}</div><div className="font-mono text-lg tracking-[0.2em]">{MORSE[letter]}</div>
              <div className="mt-1 text-[10px] opacity-75">{es?'Aciertos':'Correct'}: {getStats(progress.stats,letter).correct} · {es?'Errores':'Misses'}: {getStats(progress.stats,letter).wrong}</div>
            </div>)}
          </div>
        </div>
        <div className="rounded-xl bg-slate-950 p-4 text-center">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">{es?'Escucha esta señal':'Listen to this signal'}</p>
          <div className="text-4xl font-mono font-bold tracking-[0.28em] text-emerald-300">{MORSE[challenge]?.split('').join(' ')||'—'}</div>
          <p className="mt-2 text-xs text-slate-400">{es?'El sonido y la representación aparecen juntos durante el aprendizaje.':'Sound and visual pattern are shown together while learning.'}</p>
          <button type="button" onClick={()=>void playMessage(challenge)} className="mt-3 rounded-lg bg-emerald-500 px-5 py-2.5 font-bold text-white hover:bg-emerald-400">{playing?'■ '+(es?'Detener sonido':'Stop sound'):'▶ '+(es?'Escuchar letra':'Listen to character')}</button>
        </div>
        <div className="space-y-2">
          <p className="text-center text-sm font-semibold text-slate-800">{es?'¿Qué letra has escuchado?':'Which character did you hear?'}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {choices.map(choice=><button key={choice} type="button" disabled={pendingNext} onClick={()=>checkCharacter(choice)} className="min-h-14 rounded-lg border-2 border-cyan-300 bg-white px-3 py-3 text-2xl font-black text-slate-900 hover:bg-cyan-100 disabled:opacity-50">{choice}</button>)}
          </div>
          {pendingNext&&<button type="button" onClick={continueCourse} className="w-full rounded-lg bg-cyan-700 px-4 py-3 font-bold text-white">{es?'Siguiente ejercicio':'Next exercise'} →</button>}
        </div>
        <div className="rounded-lg bg-white p-3">
          <div className="mb-1 flex items-center justify-between text-xs font-semibold text-slate-600"><span>{es?'Dominio de este grupo':'Group mastery'}</span><span>{[...currentGroup].filter(letter=>isMastered(progress.stats,letter)).length}/{currentGroup.length}</span></div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-emerald-500 transition-all" style={{width:(100*[...currentGroup].filter(letter=>isMastered(progress.stats,letter)).length/currentGroup.length)+'%'}}/></div>
          <p className="mt-2 text-[11px] text-slate-500">{es?'Cada letra requiere al menos 5 aciertos y un 80 % de precisión. Las letras que cuestan más aparecen con mayor frecuencia.':'Each character needs at least 5 correct answers and 80% accuracy. Characters you find harder appear more often.'}</p>
        </div>
      </>}
      {courseComplete&&<div className="space-y-3 rounded-xl border border-emerald-200 bg-white p-3">
        <p className="font-bold text-emerald-800">{es?'¡Has completado el alfabeto y los números Morse!':'You have completed the Morse alphabet and numbers!'}</p>
        <p className="text-sm text-slate-700">{es?'Ahora practica con tu propia señal distintiva. Escucha cada carácter dentro de una secuencia real.':'Now practise with your own callsign. Hear each character inside a real sequence.'}</p>
        <div className="rounded-lg bg-slate-950 p-3 text-center"><div className="font-mono text-xl font-bold text-amber-300">{identity||'—'}</div><div className="mt-2 break-words font-mono text-base tracking-wider text-emerald-300">{identity?encode(identity):'—'}</div></div>
        <button type="button" disabled={!identity} onClick={()=>void playMessage(identity)} className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white disabled:opacity-40">{es?'▶ Escuchar mi indicativo / SD':'▶ Listen to my callsign'}</button>
        <div className="border-t border-slate-200 pt-3">
          <p className="text-sm font-semibold text-slate-800">{es?'Aplicación en radio: CQ CQ CQ DE '+personalPractice:'On the air: CQ CQ CQ DE '+personalPractice}</p>
          <p className="mt-1 text-xs text-slate-600">{es?'Ahora sí: CQ es una llamada general dirigida a cualquier estación. Practica la llamada completa y tu propia señal distintiva.':'Now CQ is introduced: a general call addressed to any station. Practise the full call and your own callsign.'}</p>
          <div className="mt-2 break-words rounded-lg bg-slate-950 p-3 text-center font-mono text-sm text-emerald-300">{encode(callMessage)}</div>
          <button type="button" onClick={()=>void playMessage(callMessage)} className="mt-2 w-full rounded-lg bg-cyan-700 px-4 py-3 font-bold text-white">{es?'▶ Escuchar llamada completa':'▶ Listen to full call'}</button>
        </div>
      </div>}
      {result&&<p role="status" className="rounded-lg bg-white p-2 text-sm font-bold text-slate-800">{result}</p>}
      <div className="flex items-center justify-between border-t border-cyan-200 pt-2"><span className="text-[10px] text-slate-500">{identity?((es?'Identidad: ':'Identity: ')+identity):(es?'Sin identidad seleccionada':'No identity selected')}</span><button type="button" onClick={resetCourse} className="text-[10px] font-semibold text-slate-500 underline">{es?'Reiniciar curso':'Reset course'}</button></div>
    </div>}
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-cyan-200 pt-3 text-xs font-semibold text-slate-600"><span>{es?'Velocidad de escucha':'Listening speed'}: {wpm} WPM</span><input aria-label={es?'Velocidad de escucha':'Listening speed'} type="range" min="5" max="25" value={wpm} onChange={e=>setWpm(Number(e.target.value))} className="w-32 accent-cyan-700"/></div>
  </div>;
}
