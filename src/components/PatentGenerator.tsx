import React, { useMemo, useRef, useState } from 'react';
import { Award, Download, Share2, X } from 'lucide-react';
import { countryForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

const countries = [
 ['AR','🇦🇷 Argentina'],['BR','🇧🇷 Brasil'],['PT','🇵🇹 Portugal'],['ES','🇪🇸 España'],['US','🇺🇸 Estados Unidos'],['GB','🇬🇧 Reino Unido'],['FR','🇫🇷 Francia'],['DE','🇩🇪 Alemania'],['IT','🇮🇹 Italia'],['NL','🇳🇱 Países Bajos'],['PL','🇵🇱 Polonia'],['RU','🇷🇺 Rusia'],['UA','🇺🇦 Ucrania'],['CN','🇨🇳 China'],['JP','🇯🇵 Japón'],['KR','🇰🇷 Corea del Sur'],['IN','🇮🇳 India'],['TR','🇹🇷 Turquía'],['SE','🇸🇪 Suecia'],['NO','🇳🇴 Noruega'],['DK','🇩🇰 Dinamarca'],['FI','🇫🇮 Finlandia'],['CZ','🇨🇿 Chequia'],['GR','🇬🇷 Grecia'],['RO','🇷🇴 Rumania'],['HU','🇭🇺 Hungría'],['CA','🇨🇦 Canadá'],['AU','🇦🇺 Australia'],['NZ','🇳🇿 Nueva Zelanda'],['CL','🇨🇱 Chile'],['UY','🇺🇾 Uruguay'],['PE','🇵🇪 Perú'],['BO','🇧🇴 Bolivia'],['PY','🇵🇾 Paraguay'],['CO','🇨🇴 Colombia'],['VE','🇻🇪 Venezuela'],['EC','🇪🇨 Ecuador'],['GT','🇬🇹 Guatemala'],['CR','🇨🇷 Costa Rica'],['HN','🇭🇳 Honduras'],['SV','🇸🇻 El Salvador'],['NI','🇳🇮 Nicaragua'],['MX','🇲🇽 México'],['ZA','🇿🇦 Sudáfrica'],['IS','🇮🇸 Islandia'],['IE','🇮🇪 Irlanda'],['CH','🇨🇭 Suiza'],['AT','🇦🇹 Austria'],['BE','🇧🇪 Bélgica'],['BG','🇧🇬 Bulgaria'],['HR','🇭🇷 Croacia'],['SI','🇸🇮 Eslovenia'],['SK','🇸🇰 Eslovaquia'],['LT','🇱🇹 Lituania'],['LV','🇱🇻 Letonia'],['EE','🇪🇪 Estonia'],['BY','🇧🇾 Bielorrusia'],['IL','🇮🇱 Israel'],['TH','🇹🇭 Tailandia'],['ID','🇮🇩 Indonesia'],['PH','🇵🇭 Filipinas'],['SG','🇸🇬 Singapur'],['MY','🇲🇾 Malasia'],['HK','🇭🇰 Hong Kong'],['TW','🇹🇼 Taiwán'],['PK','🇵🇰 Pakistán'],['BD','🇧🇩 Bangladés'],['LK','🇱🇰 Sri Lanka'],['EG','🇪🇬 Egipto'],['MA','🇲🇦 Marruecos'],['TN','🇹🇳 Túnez'],['KE','🇰🇪 Kenia'],['NG','🇳🇬 Nigeria'],['GH','🇬🇭 Ghana']
] as const;
// Prefijos internacionales de radioaficionado. Se evalúan primero los más largos
// para evitar que un prefijo general oculte una asignación más específica.
const callsignCountryPrefixes: Record<string, string> = {
  AR:'LU LW AY AZ', BR:'PY PP PR PT PU', PT:'CT CR CS', ES:'EA EB EC ED EE EF EG EH',
  US:'K N W AA AB AC AD AE AF AG AI AJ AK AL', GB:'G M 2E', FR:'F TM',
  DE:'DA DB DC DD DE DF DG DH DJ DK DL DM DN DO DP DQ DR', IT:'I', NL:'PA PB PC PD PE PF PG PH PI',
  PL:'3Z HF SN SO SP SQ SR', RU:'R UA UB UC UD UE UF UG UH UI', UA:'UR US UT UU UV UW UX UY UZ',
  CN:'B', JP:'JA JE JF JG JH ji JJ JK JL JM JN JO JP JQ JR JS', KR:'HL DS 6K 6L 6M 6N',
  IN:'VU', TR:'TA TB TC YM', SE:'SA SB SC SD SE SF SG SH SI SJ SK SL SM', NO:'LA LB LC LD LE LF LG LH LI LJ',
  DK:'5P 5Q OU OV OW OZ', FI:'OF OG OH OI', CZ:'OK', GR:'SV SZ', RO:'YO', HU:'HA',
  CA:'VA VE VO VY', AU:'VK', NZ:'ZL', CL:'CA CB CE XQ XR', UY:'CX', PE:'OA OB OC',
  BO:'CP', PY:'ZP', CO:'HK HJ', VE:'YV', EC:'HC HD', GT:'TG', CR:'TI', PA:'HP',
  HN:'HR', SV:'YS', NI:'YN', MX:'XE XF XG', ZA:'ZS ZR', IS:'TF', IE:'EI EJ',
  CH:'HB', AT:'OE', BE:'ON OO OP OQ OR OS OT', BG:'LZ', HR:'9A', SI:'S5',
  SK:'OM', LT:'LY', LV:'YL', EE:'ES', BY:'EU EV EW', IL:'4X 4Z',
  TH:'HS', ID:'YB YC YD YE YF YG YH', PH:'DU DV DW DX DY DZ', SG:'9V',
  MY:'9M', HK:'VR', TW:'BV', PK:'AP', BD:'S2', LK:'4P 4Q 4R',
  EG:'SU', MA:'CN', TN:'3V', KE:'5Z', NG:'5N', GH:'9G'
};
const detectCountryFromCallsign = (raw: string): string | null => {
  const call = raw.trim().toUpperCase();
  if (!call) return null;
  const detectedCountry = countryForCallsign(call, undefined, is11MeterStationIdentifier(call));
  if (!detectedCountry) return null;
  const match = countries.find((item) => item[1].replace(/^\S+\s+/, '') === detectedCountry);
  return match?.[0] || null;
};
const W=1800, H=1200;
const APP_URL='https://logbook-eqsl-express-lu-1-tsb.vercel.app/';

const localizedCountryName = (countryCode: string, fallback: string): string => {
 const language = (localStorage.getItem('app_language') || navigator.language || 'es').replace('_','-');
 try {
   if (countryCode === 'IC' || countryCode === 'IC-ESCUDO') return new Intl.DisplayNames([language], { type: 'region' }).of('IC') || fallback;
   return new Intl.DisplayNames([language], { type: 'region' }).of(countryCode) || fallback;
 } catch {
   return fallback;
 }
};
const countryLabel = (item: typeof countries[number]) => item[1].split(' ')[0] + ' ' + localizedCountryName(item[0], item[1].replace(/^\S+\s+/, ''));


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

async function narrowPlate(call:string, code:string, customText:string) {
 const W=1800,H=620,c=document.createElement('canvas'); c.width=W;c.height=H;
 const x=c.getContext('2d');if(!x)throw new Error('No se pudo crear la imagen.');
 x.fillStyle='#f8fafc';x.fillRect(0,0,W,H);
 x.fillStyle='#050505';x.beginPath();x.roundRect(35,35,W-70,H-70,42);x.fill();
 x.strokeStyle='#d4d4d4';x.lineWidth=8;x.beginPath();x.roundRect(48,48,W-96,H-96,32);x.stroke();
 x.fillStyle='#0756b8';x.beginPath();x.roundRect(62,62,W-124,150,18);x.fill();
 // Flag marker on the left, national crest in gold for Argentina, flag symbol for other countries.
 const flag=countries.find(v=>v[0]===code)?.[1].split(' ')[0]||'🌐';
 x.textAlign='center';x.textBaseline='middle';
 x.font='110px system-ui, Apple Color Emoji, Segoe UI Emoji';x.fillText(flag,155,137);
 x.fillStyle='#fff';x.font='700 56px system-ui';x.fillText(code.startsWith('IC')?'CANARIAS':(countries.find(v=>v[0]===code)?.[1].replace(/^\\S+ /,'').toUpperCase()||'RADIO'),W/2,137);
 if(code==='AR'){
   // stylized golden Argentine national coat of arms
   x.save();x.translate(W-190,137);x.strokeStyle='#f5c542';x.fillStyle='#f5c542';x.lineWidth=8;
   x.beginPath();x.ellipse(0,12,42,52,0,0,Math.PI*2);x.stroke();
   x.beginPath();x.moveTo(-42,12);x.lineTo(42,12);x.stroke();
   x.beginPath();x.moveTo(0,-42);x.lineTo(0,67);x.stroke();
   x.beginPath();x.arc(0,-58,17,0,Math.PI*2);x.fill();
   for(let i=0;i<12;i++){const a=i*Math.PI/6;x.beginPath();x.moveTo(Math.cos(a)*53,Math.sin(a)*53-6);x.lineTo(Math.cos(a)*66,Math.sin(a)*66-6);x.stroke();}
   x.restore();
 }
 x.fillStyle='#fff';x.font='900 235px system-ui';x.textBaseline='alphabetic';x.fillText(call,W/2,440);
 x.fillStyle='#fff';x.fillRect(90,405,70,12);x.fillRect(W-160,405,70,12);
 x.fillStyle='#0756b8';x.beginPath();x.roundRect(62,455,W-124,100,18);x.fill();
 const text=customText.trim().slice(0,42);
 if(text){x.fillStyle='#fff';x.font='700 54px system-ui';x.fillText(text,W/2,505);}
 else {x.fillStyle='#dcecff';x.font='600 32px system-ui';x.fillText('LOGBOOK eQSL EXPRESS',W/2,505);}
 x.textBaseline='alphabetic';return c;
}

export const PatentGenerator:React.FC=()=>{
 const [open,setOpen]=useState(false),[code,setCode]=useState('AR'),[call,setCall]=useState(''),[preview,setPreview]=useState<string|null>(null),[countryManuallySelected,setCountryManuallySelected]=useState(false),[format,setFormat]=useState('classic'),[customText,setCustomText]=useState('');
 const handleCallChange=(value:string)=>{
   const normalized=value.toUpperCase();
   setCall(normalized);
   if (!countryManuallySelected) {
     const detected=detectCountryFromCallsign(normalized);
     if(detected) setCode(detected);
   }
 };
 const canvas=useRef<HTMLCanvasElement|null>(null);
 const chosen=useMemo(()=>countries.find(v=>v[0]===code),[code]);
 const generate=async()=>{const v=call.trim().toUpperCase().replace(/[^A-Z0-9/.-]/g,'').slice(0,18);if(!v){alert('Introducí tu indicativo o SD.');return;}setCall(v);try{canvas.current=format==='narrow'?await narrowPlate(v,code,customText):await plate(v,code);setPreview(canvas.current.toDataURL('image/png'));}catch(e){alert(e instanceof Error?e.message:'No se pudo generar la patente.');}};
 const returnHome=()=>{setOpen(false);setPreview(null);window.location.assign(APP_URL);};
 const download=()=>{if(!canvas.current)return;const a=document.createElement('a');a.download='patente-radio-'+call.toLowerCase()+'.png';a.href=canvas.current.toDataURL('image/png');a.click();window.setTimeout(returnHome,900);};
 const share=async()=>{if(!canvas.current){alert('Primero generá la patente.');return;}const blob=await new Promise<Blob|null>(r=>canvas.current!.toBlob(r,'image/png'));if(!blob)return;const file=new File([blob],'patente-radio-'+call+'.png',{type:'image/png'});const shareText='Creá tu propia patente de radio en LogBook eQSL EXPRESS: '+APP_URL;if(navigator.share&&(!navigator.canShare||navigator.canShare({files:[file]}))){try{await navigator.share({files:[file],title:'Mi patente de radio',text:shareText});returnHome();return;}catch(e){if(e instanceof Error&&e.name==='AbortError')return;}}const a=document.createElement('a');a.download=file.name;a.href=URL.createObjectURL(blob);a.click();window.open('https://wa.me/?text='+encodeURIComponent(shareText+' La patente PNG se descargó para adjuntarla.'),'_blank','noopener,noreferrer');window.setTimeout(returnHome,900);};
 return <section className="w-full px-3 sm:px-6 lg:px-8 pb-5">
  <button type="button" onClick={()=>setOpen(true)} className="w-full min-h-[56px] rounded-xl border border-sky-300 bg-slate-900 px-4 py-3 text-center font-extrabold tracking-wide text-white shadow-md hover:bg-slate-800"><span className="inline-flex items-center justify-center gap-2"><Award size={20}/> GENERADOR DE PATENTES</span></button>
  {open&&<div className="mt-3 rounded-2xl border border-sky-200 bg-white p-4 shadow-lg">
   <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-900">Generador de patentes de radio</h2><button onClick={()=>{setOpen(false);setPreview(null);}} aria-label="Cerrar"><X/></button></div>
   <label htmlFor="patent-format" className="mb-1 block text-sm font-bold text-slate-700">Formato</label><select id="patent-format" value={format} onChange={e=>setFormat(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900"><option value="classic">Formato actual</option><option value="narrow">Patente angosta horizontal (nueva)</option></select>\n   <label htmlFor="patent-country" className="mb-1 block text-sm font-bold text-slate-700">País o territorio</label>
   <select id="patent-country" value={code} onChange={e=>{setCode(e.target.value);setCountryManuallySelected(true);}} className="mb-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900">{countries.map(v=><option key={v[0]} value={v[0]}>{countryLabel(v)}</option>)}<option value="IC">🏝️ Canarias — tricolor de siete estrellas</option><option value="IC-ESCUDO">🏛️ Canarias — bandera institucional con escudo de los dos perros</option></select>
   {code.startsWith('IC')&&<p className="mb-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{code==='IC'?'Bandera tricolor blanca, celeste y amarilla con siete estrellas verdes.':'Bandera institucional oficial blanca, azul y amarilla con el escudo original del Gobierno de Canarias (dos perros).'}</p>}
   <label htmlFor="patent-callsign" className="mb-1 block text-sm font-bold text-slate-700">Indicativo / SD</label>
   <input id="patent-callsign" value={call} onChange={e=>handleCallChange(e.target.value)} maxLength={18} placeholder="Ej.: LU1TSB o 4RC978" className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-lg font-bold uppercase tracking-wider text-slate-900"/>
   <label htmlFor="patent-custom-text" className="mb-1 block text-sm font-bold text-slate-700">Texto opcional (QAP, frecuencia, localidad, saludos)</label><input id="patent-custom-text" value={customText} onChange={e=>setCustomText(e.target.value)} maxLength={42} placeholder="Ej.: QAP 7.120 · TUCUMAN · 73 SALUDOS" className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-slate-900"/><button onClick={generate} className="w-full rounded-lg bg-sky-700 px-4 py-3 font-bold text-white">GENERAR PATENTE</button>
   {preview&&<div className="mt-4"><img src={preview} alt="Vista previa de la patente de radio" className="w-full rounded-xl border border-slate-200"/><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button onClick={download} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-3 font-bold text-white"><Download size={18}/> DESCARGAR PNG</button><button onClick={share} className="inline-flex items-center justify-center gap-2 rounded-lg bg-green-700 px-4 py-3 font-bold text-white"><Share2 size={18}/> COMPARTIR POR WHATSAPP</button></div><p className="mt-2 text-xs text-slate-500">PNG de 1800 × 1200 píxeles. Al compartir se incluye el enlace directo a LogBook eQSL EXPRESS para crear otra patente. Al terminar, volverás al inicio con el encabezado visible.</p></div>}
   <button onClick={()=>{setOpen(false);setPreview(null);}} className="mt-4 w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 font-bold text-slate-700">CERRAR</button>
  </div>}
 </section>;
};
