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

async function loadCanvasImage(url:string):Promise<HTMLImageElement>{
 const image=new Image();
 image.crossOrigin='anonymous';
 image.referrerPolicy='no-referrer';
 image.decoding='async';
 image.src=url;
 await new Promise<void>((resolve,reject)=>{
   image.onload=()=>resolve();
   image.onerror=()=>reject(new Error('No se pudo preparar la imagen oficial de la patente. El recurso gráfico no respondió correctamente; volvé a generar la patente.'));
 });
 if(!image.naturalWidth||!image.naturalHeight) throw new Error('La imagen oficial recibida está vacía o no es válida.');
 return image;
}
const commonsCountryNames:Record<string,string>={
 AR:'Argentina',BR:'Brazil',PT:'Portugal',ES:'Spain',US:'United States',GB:'United Kingdom',FR:'France',DE:'Germany',IT:'Italy',NL:'Netherlands',PL:'Poland',RU:'Russia',UA:'Ukraine',CN:'China',JP:'Japan',KR:'South Korea',IN:'India',TR:'Turkey',SE:'Sweden',NO:'Norway',DK:'Denmark',FI:'Finland',CZ:'Czech Republic',GR:'Greece',RO:'Romania',HU:'Hungary',CA:'Canada',AU:'Australia',NZ:'New Zealand',CL:'Chile',UY:'Uruguay',PE:'Peru',BO:'Bolivia',PY:'Paraguay',CO:'Colombia',VE:'Venezuela',EC:'Ecuador',GT:'Guatemala',CR:'Costa Rica',HN:'Honduras',SV:'El Salvador',NI:'Nicaragua',MX:'Mexico',ZA:'South Africa',IS:'Iceland',IE:'Ireland',CH:'Switzerland',AT:'Austria',BE:'Belgium',BG:'Bulgaria',HR:'Croatia',SI:'Slovenia',SK:'Slovakia',LT:'Lithuania',LV:'Latvia',EE:'Estonia',BY:'Belarus',IL:'Israel',TH:'Thailand',ID:'Indonesia',PH:'Philippines',SG:'Singapore',MY:'Malaysia',HK:'Hong Kong',TW:'Taiwan',PK:'Pakistan',BD:'Bangladesh',LK:'Sri Lanka',EG:'Egypt',MA:'Morocco',TN:'Tunisia',KE:'Kenya',NG:'Nigeria',GH:'Ghana'
};
async function officialNationalEmblem(code:string):Promise<HTMLImageElement|null>{
 const country=commonsCountryNames[code];
 if(!country)return null;
 // Buscar archivos de emblemas nacionales en Wikimedia Commons; no se dibujan escudos ficticios.
 const terms=[`national coat of arms ${country}`,`coat of arms ${country}`,`national emblem ${country}`];
 for(const term of terms){
  try{
   const api='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=12&gsrsearch='+encodeURIComponent(term)+'&prop=imageinfo&iiprop=url&iiurlwidth=700&format=json&origin=*';
   const response=await fetch(api,{headers:{Accept:'application/json'}});
   if(!response.ok)continue;
   const data=await response.json();
   const pages=Object.values(data?.query?.pages||{}) as Array<{title?:string,imageinfo?:Array<{thumburl?:string,url?:string}>}>;
   const normalized=country.toLowerCase().replace(/[^a-z]/g,'');
   const candidates=pages.filter(page=>{
    const title=(page.title||'').toLowerCase();
    const compact=title.replace(/[^a-z]/g,'');
    return (compact.includes(normalized)||title.includes(code.toLowerCase())) &&
      /(coat.?of.?arms|national.?emblem|arms.?of)/i.test(title) &&
      !!(page.imageinfo?.[0]?.thumburl||page.imageinfo?.[0]?.url);
   });
   const candidate=candidates[0];
   const imageUrl=candidate?.imageinfo?.[0]?.thumburl||candidate?.imageinfo?.[0]?.url;
   if(imageUrl)return await loadCanvasImage(imageUrl);
  }catch{/* Probar el siguiente término; no bloquear la generación por una búsqueda fallida. */}
 }
 return null;
}
async function narrowPlate(call:string,code:string,customText:string){
 const W=1800,H=620,c=document.createElement('canvas');c.width=W;c.height=H;
 const x=c.getContext('2d');if(!x)throw new Error('No se pudo crear la imagen.');
 const cc=(code==='IC'||code==='IC-ESCUDO')?'es':code.toLowerCase();
 const flag=await loadCanvasImage('https://flagcdn.com/w1600/'+cc+'.png');
 // Base y bandera completa a sangre, con tratamiento de placa esmaltada.
 x.clearRect(0,0,W,H);
 x.save();x.beginPath();x.roundRect(20,20,W-40,H-40,48);x.clip();x.drawImage(flag,20,20,W-40,H-40);
 const shade=x.createLinearGradient(0,20,0,H-20);shade.addColorStop(0,'rgba(0,0,0,.30)');shade.addColorStop(.32,'rgba(0,0,0,.04)');shade.addColorStop(.68,'rgba(0,0,0,.10)');shade.addColorStop(1,'rgba(0,0,0,.36)');x.fillStyle=shade;x.fillRect(20,20,W-40,H-40);
 const gloss=x.createLinearGradient(0,20,0,210);gloss.addColorStop(0,'rgba(255,255,255,.32)');gloss.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=gloss;x.fillRect(20,20,W-40,190);
 x.restore();
 // Marco metálico doble, bisel y remaches.
 x.save();x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=18;x.strokeStyle='#101820';x.lineWidth=18;x.beginPath();x.roundRect(20,20,W-40,H-40,48);x.stroke();x.restore();
 x.strokeStyle='#f4f4ee';x.lineWidth=9;x.beginPath();x.roundRect(34,34,W-68,H-68,39);x.stroke();
 x.strokeStyle='rgba(10,25,42,.85)';x.lineWidth=3;x.beginPath();x.roundRect(48,48,W-96,H-96,31);x.stroke();
 // Banda inferior satinada para el texto personalizado.
 const footer=x.createLinearGradient(0,500,0,600);footer.addColorStop(0,'rgba(255,255,255,.94)');footer.addColorStop(1,'rgba(224,235,245,.98)');x.fillStyle=footer;x.fillRect(48,510,W-96,58);
 // País centrado arriba, con sombra para contraste.
 const country=(code==='IC'||code==='IC-ESCUDO')?'CANARIAS':(countries.find(v=>v[0]===code)?.[1].replace(/^\\S+ /,'').toUpperCase()||code);
 x.textAlign='center';x.textBaseline='alphabetic';x.lineJoin='round';
 x.font='900 54px system-ui, sans-serif';x.lineWidth=9;x.strokeStyle='rgba(0,0,0,.72)';x.fillStyle='#fff';x.strokeText(country,W/2,118);x.fillText(country,W/2,118);
 // Escudo oficial arriba a la derecha, en medallón dorado como el modelo de referencia.
 if(code==='IC'||code==='IC-ESCUDO'){
  if(code==='IC-ESCUDO'){
   const crest=await loadCanvasImage('https://www.gobiernodecanarias.org/cmsgob2/export/sites/administracionespublicas/modernizacion/img/escudo_canarias.jpg');
   const scale=Math.min(178/crest.naturalWidth,205/crest.naturalHeight);const ew=crest.naturalWidth*scale,eh=crest.naturalHeight*scale;
   x.fillStyle='rgba(255,255,255,.94)';x.beginPath();x.arc(1600,190,122,0,Math.PI*2);x.fill();x.strokeStyle='#d8ad43';x.lineWidth=12;x.stroke();x.drawImage(crest,1600-ew/2,190-eh/2,ew,eh);
  }else{
   x.fillStyle='rgba(255,255,255,.9)';x.beginPath();x.arc(1600,190,112,0,Math.PI*2);x.fill();x.strokeStyle='#d8ad43';x.lineWidth=10;x.stroke();x.fillStyle='#087b43';for(let i=0;i<7;i++){const a=-Math.PI/2+i*Math.PI*2/7;x.beginPath();x.arc(1600+Math.cos(a)*66,190+Math.sin(a)*66,12,0,Math.PI*2);x.fill();}
  }
 }else{
  const emblem=await officialNationalEmblem(code);
  if(!emblem)throw new Error('No se encontró un archivo verificable del escudo o emblema nacional de '+(commonsCountryNames[code]||code)+'. No se generó una insignia inventada.');
  x.save();x.shadowColor='rgba(0,0,0,.38)';x.shadowBlur=18;x.fillStyle='rgba(255,255,255,.94)';x.beginPath();x.arc(1600,190,120,0,Math.PI*2);x.fill();x.restore();
  const med=x.createRadialGradient(1565,150,10,1600,190,125);med.addColorStop(0,'#fff8dc');med.addColorStop(.7,'#f0d58a');med.addColorStop(1,'#b8862b');x.fillStyle=med;x.beginPath();x.arc(1600,190,120,0,Math.PI*2);x.fill();x.strokeStyle='#fff1bd';x.lineWidth=7;x.stroke();x.strokeStyle='#8b641e';x.lineWidth=3;x.beginPath();x.arc(1600,190,108,0,Math.PI*2);x.stroke();
  const maxW=168,maxH=190,scale=Math.min(maxW/emblem.naturalWidth,maxH/emblem.naturalHeight);const ew=emblem.naturalWidth*scale,eh=emblem.naturalHeight*scale;
  x.drawImage(emblem,1600-ew/2,190-eh/2,ew,eh);
 }
 // Indicativo grande, centrado en el espacio libre a la izquierda del escudo.
 x.textAlign='center';x.textBaseline='alphabetic';const callArea=W-390;
 let fontSize=205;x.font='900 '+fontSize+'px system-ui, sans-serif';
 while(x.measureText(call).width>callArea-100&&fontSize>90){fontSize-=6;x.font='900 '+fontSize+'px system-ui, sans-serif';}
 const cx=760,cy=390;x.lineWidth=20;x.strokeStyle='rgba(0,0,0,.88)';x.lineJoin='round';x.shadowColor='rgba(0,0,0,.55)';x.shadowBlur=12;x.strokeText(call,cx,cy);x.shadowBlur=0;
 const lettering=x.createLinearGradient(0,cy-fontSize,0,cy+20);lettering.addColorStop(0,'#ffffff');lettering.addColorStop(.58,'#f4f7fb');lettering.addColorStop(1,'#c8d4df');x.fillStyle=lettering;x.fillText(call,cx,cy);
 const t=(customText.trim().slice(0,42)||'LOGBOOK eQSL EXPRESS').toUpperCase();x.font='800 34px system-ui, sans-serif';x.lineWidth=3;x.strokeStyle='rgba(0,0,0,.18)';x.fillStyle='#092c59';x.strokeText(t,W/2,552);x.fillText(t,W/2,552);
 // Tornillos discretos de placa.
 for(const px of [88,W-88]){x.fillStyle='#dce3e8';x.beginPath();x.arc(px,310,15,0,Math.PI*2);x.fill();x.strokeStyle='#52616d';x.lineWidth=3;x.stroke();x.strokeStyle='rgba(30,40,50,.65)';x.beginPath();x.moveTo(px-7,310);x.lineTo(px+7,310);x.stroke();}
 return c;
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
