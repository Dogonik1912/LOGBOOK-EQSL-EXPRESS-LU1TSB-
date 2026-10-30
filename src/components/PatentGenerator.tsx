import React, { useMemo, useRef, useState } from 'react';
import { Award, Download, Share2, X } from 'lucide-react';

const countries = [
 ['AR','🇦🇷 Argentina'],['BR','🇧🇷 Brasil'],['PT','🇵🇹 Portugal'],['ES','🇪🇸 España'],['US','🇺🇸 Estados Unidos'],['GB','🇬🇧 Reino Unido'],['FR','🇫🇷 Francia'],['DE','🇩🇪 Alemania'],['IT','🇮🇹 Italia'],['NL','🇳🇱 Países Bajos'],['PL','🇵🇱 Polonia'],['RU','🇷🇺 Rusia'],['UA','🇺🇦 Ucrania'],['CN','🇨🇳 China'],['JP','🇯🇵 Japón'],['KR','🇰🇷 Corea del Sur'],['IN','🇮🇳 India'],['TR','🇹🇷 Turquía'],['SE','🇸🇪 Suecia'],['NO','🇳🇴 Noruega'],['DK','🇩🇰 Dinamarca'],['FI','🇫🇮 Finlandia'],['CZ','🇨🇿 Chequia'],['GR','🇬🇷 Grecia'],['RO','🇷🇴 Rumania'],['HU','🇭🇺 Hungría']
] as const;
const W=1800, H=1200;

function drawCanaryCrest(ctx:CanvasRenderingContext2D,cx:number,cy:number,scale:number) {
 ctx.save(); ctx.translate(cx,cy); ctx.scale(scale,scale);
 // Official heraldic composition: closed royal crown, silver scroll "OCEANO",
 // seven silver islands on azure shield, and two dogs as supporters.
 ctx.textAlign='center'; ctx.lineJoin='round';
 ctx.fillStyle='#f3f0df'; ctx.strokeStyle='#4b3820'; ctx.lineWidth=3;
 ctx.beginPath(); ctx.moveTo(-92,-92); ctx.quadraticCurveTo(0,-122,92,-92); ctx.lineTo(76,-68); ctx.quadraticCurveTo(0,-52,-76,-68); ctx.closePath(); ctx.fill(); ctx.stroke();
 ctx.fillStyle='#111'; ctx.font='bold 19px Georgia'; ctx.fillText('OCEANO',0,-83);
 // crown and arches
 ctx.fillStyle='#d7aa35'; ctx.strokeStyle='#6e4c12'; ctx.lineWidth=5;
 ctx.beginPath(); ctx.moveTo(-62,-105); ctx.lineTo(-55,-151); ctx.lineTo(-24,-130); ctx.lineTo(0,-169); ctx.lineTo(24,-130); ctx.lineTo(55,-151); ctx.lineTo(62,-105); ctx.closePath(); ctx.fill(); ctx.stroke();
 ctx.beginPath(); ctx.arc(0,-124,53,Math.PI,0); ctx.stroke();
 ctx.fillStyle='#b72f35'; ctx.beginPath(); ctx.ellipse(0,-169,9,7,0,0,Math.PI*2); ctx.fill();
 // shield
 ctx.fillStyle='#064b9b'; ctx.strokeStyle='#d7aa35'; ctx.lineWidth=7;
 ctx.beginPath(); ctx.moveTo(-66,-63); ctx.lineTo(66,-63); ctx.lineTo(60,45); ctx.quadraticCurveTo(48,95,0,119); ctx.quadraticCurveTo(-48,95,-60,45); ctx.closePath(); ctx.fill(); ctx.stroke();
 // seven silver islands (2,2,2,1)
 ctx.fillStyle='#f3f0df';
 const islands=[[-31,-38],[28,-38],[-31,-4],[28,-4],[-31,30],[28,30],[0,68]];
 islands.forEach(([x,y],i)=>{ctx.beginPath();ctx.ellipse(x,y,i===6?12:14,5,-.12,0,Math.PI*2);ctx.fill();});
 // two stylized golden-brown canes as supporters
 const dog=(side:number)=>{
  ctx.save(); ctx.scale(side,1); ctx.translate(94,10);
  ctx.fillStyle='#bd8a35'; ctx.strokeStyle='#553b1b'; ctx.lineWidth=5;
  ctx.beginPath(); ctx.ellipse(0,5,24,48,-.12,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(5,-48,20,27,.15,0,Math.PI*2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-5,-68); ctx.lineTo(-20,-96); ctx.lineTo(3,-83); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(15,-68); ctx.lineTo(34,-90); ctx.lineTo(27,-58); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-8,42); ctx.lineTo(-18,91); ctx.lineTo(-5,91); ctx.lineTo(8,44); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(12,38); ctx.lineTo(26,87); ctx.lineTo(38,87); ctx.lineTo(27,29); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-17,-5); ctx.quadraticCurveTo(-55,-30,-43,-65); ctx.stroke();
  ctx.restore();
 };
 dog(-1); dog(1);
 ctx.restore();
}

async function plate(call:string, code:string) {
 const c=document.createElement('canvas'); c.width=W; c.height=H;
 const x=c.getContext('2d'); if(!x) throw new Error('No se pudo crear la imagen.');
 const g=x.createLinearGradient(0,0,W,H); g.addColorStop(0,'#071a35'); g.addColorStop(.55,'#16466d'); g.addColorStop(1,'#071326'); x.fillStyle=g; x.fillRect(0,0,W,H);
 x.strokeStyle='#d5b46b'; x.lineWidth=18; x.beginPath(); x.roundRect(38,38,W-76,H-76,48); x.stroke();
 x.strokeStyle='rgba(255,255,255,.3)'; x.lineWidth=4; x.beginPath(); x.roundRect(66,66,W-132,H-132,34); x.stroke();
 x.textAlign='center'; x.fillStyle='#f4d58d'; x.font='700 62px system-ui'; x.fillText('RADIO COMMUNICATIONS',W/2,170);
 x.fillStyle='#fff'; x.font='800 104px system-ui'; x.fillText('RADIO STATION',W/2,285);
 if(code==='IC' || code==='IC-ESCUDO') {
   x.fillStyle='#fff'; x.fillRect(715,350,123,220); x.fillStyle='#55bce8'; x.fillRect(838,350,123,220); x.fillStyle='#f6d331'; x.fillRect(961,350,124,220);
   if(code==='IC') { x.fillStyle='#087b43'; for(let i=0;i<7;i++){const a=-Math.PI/2+i*Math.PI*2/7;x.beginPath();x.arc(900+Math.cos(a)*52,460+Math.sin(a)*52,9,0,Math.PI*2);x.fill();} } else { x.fillStyle='#fff'; x.fillRect(715,350,123,220); x.fillStyle='#0066a1'; x.fillRect(838,350,123,220); x.fillStyle='#f6d331'; x.fillRect(961,350,124,220); const crest=new Image(); crest.crossOrigin='anonymous'; crest.src='https://www.gobiernodecanarias.org/cmsgob2/export/sites/administracionespublicas/modernizacion/img/escudo_canarias.jpg'; await new Promise<void>((resolve,reject)=>{crest.onload=()=>resolve();crest.onerror=()=>reject(new Error('No se pudo cargar el escudo oficial de Canarias.'));}); x.drawImage(crest,820,365,160,190); }
 } else {
   x.font='220px system-ui, Apple Color Emoji, Segoe UI Emoji'; x.textBaseline='middle'; x.fillText(countries.find(v=>v[0]===code)?.[1].split(' ')[0]||'🌐',W/2,460);
 }
 x.textBaseline='alphabetic'; x.fillStyle='#d5b46b'; x.font='700 48px system-ui'; x.fillText(code.startsWith('IC')?'CANARIAS':(countries.find(v=>v[0]===code)?.[1].replace(/^\S+ /,'').toUpperCase()||''),W/2,650);
 x.fillStyle='#fff'; x.font='900 190px system-ui'; x.fillText(call,W/2,875);
 x.fillStyle='#b9d7f2'; x.font='600 42px system-ui'; x.fillText('LOGBOOK eQSL EXPRESS',W/2,1015);
 x.fillStyle='#f4d58d'; x.font='500 28px system-ui'; x.fillText('AMATEUR RADIO • DX • FRIENDSHIP',W/2,1080);
 return c;
}
export const PatentGenerator:React.FC=()=>{
 const [open,setOpen]=useState(false),[code,setCode]=useState('AR'),[call,setCall]=useState(''),[preview,setPreview]=useState<string|null>(null);
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const chosen=useMemo(()=>countries.find(v=>v[0]===code),[code]);
 const generate=async()=>{const v=call.trim().toUpperCase().replace(/[^A-Z0-9/.-]/g,'').slice(0,18);if(!v){alert('Introducí tu indicativo o SD.');return;}setCall(v);try{canvas.current=await plate(v,code);setPreview(canvas.current.toDataURL('image/png'));}catch(e){alert(e instanceof Error?e.message:'No se pudo generar la patente.');}};
 const download=()=>{if(!canvas.current)return;const a=document.createElement('a');a.download='patente-radio-'+call.toLowerCase()+'.png';a.href=canvas.current.toDataURL('image/png');a.click();};
 const share=async()=>{if(!canvas.current){alert('Primero generá la patente.');return;}const blob=await new Promise<Blob|null>(r=>canvas.current!.toBlob(r,'image/png'));if(!blob)return;const file=new File([blob],'patente-radio-'+call+'.png',{type:'image/png'});if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({files:[file],title:'Mi patente de radio',text:'Creada con LogBook eQSL EXPRESS'});return;}catch(e){if(e instanceof Error&&e.name==='AbortError')return;}}download();window.open('https://wa.me/?text='+encodeURIComponent('Te comparto mi patente de radio. La imagen se descargó para adjuntarla en WhatsApp.'),'_blank','noopener,noreferrer');};
 return <section className="w-full px-3 sm:px-6 lg:px-8 pb-5">
  <button type="button" onClick={()=>setOpen(true)} className="w-full min-h-[56px] rounded-xl border border-sky-300 bg-slate-900 px-4 py-3 text-center font-extrabold tracking-wide text-white shadow-md hover:bg-slate-800"><span className="inline-flex items-center justify-center gap-2"><Award size={20}/> GENERADOR DE PATENTES</span></button>
  {open&&<div className="mt-3 rounded-2xl border border-sky-200 bg-white p-4 shadow-lg">
   <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-900">Generador de patentes de radio</h2><button onClick={()=>{setOpen(false);setPreview(null);}} aria-label="Cerrar"><X/></button></div>
   <label htmlFor="patent-country" className="mb-1 block text-sm font-bold text-slate-700">País o territorio</label>
   <select id="patent-country" value={code} onChange={e=>setCode(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900">{countries.map(v=><option key={v[0]} value={v[0]}>{v[1]}</option>)}<option value="IC">🏝️ Canarias — tricolor de siete estrellas</option><option value="IC-ESCUDO">🏛️ Canarias — bandera institucional con escudo de los dos perros</option></select>
   {code.startsWith('IC')&&<p className="mb-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{code==='IC'?'Bandera tricolor blanca, celeste y amarilla con siete estrellas verdes.':'Bandera institucional oficial blanca, azul y amarilla con el escudo original del Gobierno de Canarias (dos perros).'}</p>}
   <label htmlFor="patent-callsign" className="mb-1 block text-sm font-bold text-slate-700">Indicativo / SD</label>
   <input id="patent-callsign" value={call} onChange={e=>setCall(e.target.value.toUpperCase())} maxLength={18} placeholder="Ej.: LU1TSB o 4RC978" className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-lg font-bold uppercase tracking-wider text-slate-900"/>
   <button onClick={generate} className="w-full rounded-lg bg-sky-700 px-4 py-3 font-bold text-white">GENERAR PATENTE</button>
   {preview&&<div className="mt-4"><img src={preview} alt="Vista previa de la patente de radio" className="w-full rounded-xl border border-slate-200"/><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button onClick={download} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-3 font-bold text-white"><Download size={18}/> DESCARGAR PNG</button><button onClick={share} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-3 font-bold text-white"><Share2 size={18}/> COMPARTIR POR WHATSAPP</button></div><p className="mt-2 text-xs text-slate-500">PNG de 1800 × 1200 píxeles. Si el navegador no admite compartir archivos, se descarga la imagen y se abre WhatsApp para adjuntarla.</p></div>}
   <button onClick={()=>{setOpen(false);setPreview(null);}} className="mt-4 w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 font-bold text-slate-700">CERRAR</button>
  </div>}
 </section>;
};
