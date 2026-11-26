import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { countryForCallsign, flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { supabase } from '../services/supabaseClient';
import { capitalPointForCountry } from '../services/dxDistance';
import { HAM_BANDS, HAM_MODES } from '../types';
import { getInitialAppLanguage, languageFromPhone, type AppLanguage } from '../services/appLanguage';
import { ShareLanguageSelector } from './ShareLanguageSelector';
import { Share2 } from 'lucide-react';

type Zone = { name: string; utcOffset: number; latitude: number };
type DXReception = { receiverCallsign: string; senderCallsign: string; frequency: number; flowStartSeconds: number; receiverLocator?: string; mode?: string; };
type ExternalSpot = { dxCall: string; band: string; mode: string; frequency: number; dxLat: number | null; dxLon: number | null; dxGrid?: string | null; dxEntityName?: string; dxContinent?: string; reporterCount: number; sources: string[]; firstSeen: number; lastSeen: number; latestDeCall?: string; latestComment?: string | null; bestSnr?: number | null; signalTrend?: string; };
type SpotSourceState = { state: string; lastAcceptedAt?: number | null };
type RadioStats = { totalSpots?: number; activeEntities?: number; byBand?: Record<string,{spots?:number;entities?:number;rareCount?:number}>; byMode?: Record<string,{spots?:number;entities?:number}>; rareActive?: Array<{dxcc:number;entity:string;rank:number;bands:string[];modes:string[]}> };
type RadioConditions = { sfi?:number|null; kp?:number|null; aIndex?:number|null; updatedAt?:number|null; bandConditions?:Record<string,string> };
type AuroraFrame = { url: string; time_tag: string };
type IonosondeStation = { name:string; lat:number; lon:number; muf:number; updated:number };
type RadioHistory = { period?:string; bucketSizeSeconds?:number; data?:Array<{bucket:number;spots:number;entities:number;band?:string}> };

type PropagationFilterPreferences = { mapBand: string; mapMode: string; historyBand: string; historyMode: string };
function propagationFilterPreferenceKey() {
  const account = (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || 'guest').trim().toUpperCase();
  return 'logbook_propagation_filters_v1:' + (account || 'guest');
}
function readPropagationFilterPreferences(key = propagationFilterPreferenceKey()): PropagationFilterPreferences {
  const defaults: PropagationFilterPreferences = { mapBand: '', mapMode: '', historyBand: '', historyMode: '' };
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return {
      mapBand: typeof saved.mapBand === 'string' ? saved.mapBand : defaults.mapBand,
      mapMode: typeof saved.mapMode === 'string' ? saved.mapMode : defaults.mapMode,
      historyBand: typeof saved.historyBand === 'string' ? saved.historyBand : defaults.historyBand,
      historyMode: typeof saved.historyMode === 'string' ? saved.historyMode : defaults.historyMode,
    };
  } catch { return defaults; }
}

type DXHistoryChartProps = { history: RadioHistory | null; band: string; mode: string; selectedBucket: number | null; onSelectBucket: (bucket: number) => void };
const DXHistoryChart = React.memo(function DXHistoryChart({history, band, mode, selectedBucket, onSelectBucket}: DXHistoryChartProps) {
  const visible = [...(history?.data || [])].sort((a,b)=>a.bucket-b.bucket).slice(-24);
  if (!visible.length) return <p className="mt-3 text-xs text-slate-400">Historial no disponible para esta selección. Se volverá a consultar automáticamente.</p>;
  const selected = visible.find(bucket=>Number(bucket.bucket)===selectedBucket) || visible[visible.length-1];
  const max = Math.max(1,...visible.map(bucket=>Number(bucket.spots||0)));
  const selectedLabel = new Date(Number(selected.bucket)*1000).toLocaleString('es-AR',{dateStyle:'full',timeStyle:'short',timeZone:'UTC'});
  return <>
    <div className="mt-4 overflow-x-auto pb-1"><div className="flex h-32 min-w-[620px] items-end gap-1.5 border-b border-slate-700 px-1">{visible.map((bucket,index)=>{const isSelected=Number(bucket.bucket)===Number(selected.bucket);const height=Math.max(4,Number(bucket.spots||0)/max*100);const label=new Date(Number(bucket.bucket)*1000).toLocaleString('es-AR',{dateStyle:'short',timeStyle:'short',timeZone:'UTC'})+' UTC';return <button key={String(bucket.bucket)+'-'+index} type="button" onClick={()=>onSelectBucket(Number(bucket.bucket))} aria-label={'Consultar '+label+': '+bucket.spots+' reportes DX'} title={label+' · '+bucket.spots+' reportes'} className={'flex min-w-[20px] flex-1 items-end rounded-t px-0.5 outline-none focus-visible:ring-2 focus-visible:ring-white '+(isSelected?'bg-cyan-300 ring-2 ring-cyan-100':'bg-cyan-500/65 hover:bg-cyan-300/90')} style={{height:height+'%',minHeight:'4px'}}><span className="sr-only">{label}: {bucket.spots} reportes</span></button>})}</div><div className="flex min-w-[620px] justify-between px-1 pt-1 text-[10px] text-slate-500"><span>{new Date(Number(visible[0].bucket)*1000).toLocaleString('es-AR',{dateStyle:'short',timeZone:'UTC'})} UTC</span><span>{new Date(Number(visible[visible.length-1].bucket)*1000).toLocaleString('es-AR',{dateStyle:'short',timeZone:'UTC'})} UTC</span></div></div>
    <div className="mt-3 rounded-xl border border-cyan-300/20 bg-cyan-950/30 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-cyan-100">DETALLE DEL INTERVALO SELECCIONADO</strong><span className="text-[10px] text-slate-400">{Math.round(Number(history?.bucketSizeSeconds||0)/60)} min por intervalo</span></div><p className="mt-1 text-xs text-slate-300">{selectedLabel} UTC</p><div className="mt-2 grid grid-cols-2 gap-2"><div><span className="block text-[10px] text-slate-400">Reportes DX</span><strong className="text-2xl text-white">{Number(selected.spots||0).toLocaleString('es-AR')}</strong></div><div><span className="block text-[10px] text-slate-400">Entidades DXCC detectadas</span><strong className="text-2xl text-white">{Number(selected.entities||0).toLocaleString('es-AR')}</strong></div></div><p className="mt-2 text-[10px] text-slate-400">{band?'Banda: '+band+' · ':''}{mode?'Modo: '+mode+' · ':''}Cifras agregadas de reportes recibidos; no son QSOs confirmados.</p></div>
  </>;
});

type GeoPoint = { lat: number; lon: number };
type LiveQsoContact = { spot_key: string; callsign: string; station_callsign: string; band: string; frequency: string; mode: string; qso_date: string; qso_time: string; created_at: string; country?: string | null };
function maidenheadToLatLon(locator?: string): GeoPoint | null {
 const v=String(locator||'').trim().toUpperCase();
 if(!/^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(v)) return null;
 let lon=-180+(v.charCodeAt(0)-65)*20, lat=-90+(v.charCodeAt(1)-65)*10, lonSize=2, latSize=1;
 lon+=Number(v[2])*2; lat+=Number(v[3]);
 if(v.length>=6){lonSize/=24;latSize/=24;lon+=(v.charCodeAt(4)-65)*lonSize;lat+=(v.charCodeAt(5)-65)*latSize;}
 if(v.length>=8){lonSize/=10;latSize/=10;lon+=Number(v[6])*lonSize;lat+=Number(v[7])*latSize;}
 return {lat:lat+latSize/2,lon:lon+lonSize/2};
}
function distanceKm(a:GeoPoint,b:GeoPoint){const r=(n:number)=>n*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lon-a.lon),h=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 6371*2*Math.asin(Math.sqrt(h));}
function greatCirclePath(a:GeoPoint,b:GeoPoint,steps=48):[number,number][]{
 const rad=(n:number)=>n*Math.PI/180,deg=(n:number)=>n*180/Math.PI;
 const p1=rad(a.lat),l1=rad(a.lon),p2=rad(b.lat),l2=rad(b.lon);
 const omega=2*Math.asin(Math.sqrt(Math.sin((p2-p1)/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin((l2-l1)/2)**2));
 if(!Number.isFinite(omega)||omega<1e-8)return [[a.lat,a.lon],[b.lat,b.lon]];
 const out:[number,number][]=[];
 for(let i=0;i<=steps;i++){const t=i/steps,A=Math.sin((1-t)*omega)/Math.sin(omega),B=Math.sin(t*omega)/Math.sin(omega),x=A*Math.cos(p1)*Math.cos(l1)+B*Math.cos(p2)*Math.cos(l2),y=A*Math.cos(p1)*Math.sin(l1)+B*Math.cos(p2)*Math.sin(l2),z=A*Math.sin(p1)+B*Math.sin(p2);out.push([deg(Math.atan2(z,Math.sqrt(x*x+y*y))),((deg(Math.atan2(y,x))+540)%360)-180]);}
 return out;
}
function greyLineCoordinates(date=new Date()):[number,number][]{
 const day=Math.floor((Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate())-Date.UTC(date.getUTCFullYear(),0,0))/86400000);
 const hour=date.getUTCHours()+date.getUTCMinutes()/60;
 const gamma=2*Math.PI/365*(day-1+(hour-12)/24);
 const decl=0.006918-0.399912*Math.cos(gamma)+0.070257*Math.sin(gamma)-0.006758*Math.cos(2*gamma)+0.000907*Math.sin(2*gamma)-0.002697*Math.cos(3*gamma)+0.00148*Math.sin(3*gamma);
 const eq=229.18*(0.000075+0.001868*Math.cos(gamma)-0.032077*Math.sin(gamma)-0.014615*Math.cos(2*gamma)-0.040849*Math.sin(2*gamma));
 const subLon=((720-(hour*60+eq))/4+540)%360-180;
 const pts:[number,number][]=[];
 for(let lon=-180;lon<=180;lon+=2){const H=(lon-subLon)*Math.PI/180;let lat;if(Math.abs(Math.tan(decl))<1e-5)lat=Math.sin(H)>=0?-89.9:89.9;else lat=Math.atan(-Math.cos(H)/Math.tan(decl))*180/Math.PI;pts.push([Math.max(-89.9,Math.min(89.9,lat)),lon]);}
 return pts;
}
const continentForPoint=(p:GeoPoint)=>p.lon < -30?(p.lat>5?'América del Norte':'América del Sur'):p.lon<60?(p.lat>34?'Europa':'África'):p.lat>-10?'Asia':'Oceanía';
function bandForFrequency(value:number):string {
 const mhz=value>1000?value/1_000_000:value;
 const ranges:[number,number,string][]=[[1.8,2,'160m'],[3.5,4,'80m'],[7,7.3,'40m'],[10.1,10.15,'30m'],[14,14.35,'20m'],[18.068,18.168,'17m'],[21,21.45,'15m'],[24.89,24.99,'12m'],[26.965,27.999,'11 metros'],[28,29.7,'10m'],[50,54,'6m'],[144,148,'2m'],[420,450,'70cm']];
 return ranges.find(([low,high])=>mhz>=low&&mhz<=high)?.[2]||'';
}
const mapRegions=[
{name:'América del Norte',lat:40,lon:-100,radius:4200000,bounds:{south:5,north:85,west:-170,east:-30}},
{name:'América del Sur',lat:-20,lon:-60,radius:3600000,bounds:{south:-60,north:15,west:-95,east:-30}},
{name:'Europa',lat:52,lon:15,radius:2300000,bounds:{south:34,north:72,west:-30,east:60}},
{name:'África',lat:0,lon:20,radius:3900000,bounds:{south:-40,north:37,west:-30,east:60}},
{name:'Asia',lat:35,lon:100,radius:5200000,bounds:{south:-10,north:80,west:60,east:180}},
{name:'Oceanía',lat:-25,lon:140,radius:3200000,bounds:{south:-50,north:0,west:110,east:180}}
];
const zones: Zone[] = [
  { name: 'América del Sur', utcOffset: -3, latitude: -25 },
  { name: 'América del Norte', utcOffset: -5, latitude: 40 },
  { name: 'Europa', utcOffset: 1, latitude: 50 },
  { name: 'África', utcOffset: 2, latitude: 0 },
  { name: 'Asia', utcOffset: 8, latitude: 30 },
  { name: 'Oceanía', utcOffset: 10, latitude: -25 },
];



const guestInvitationCopy: Record<AppLanguage, { title: string; body: string; closing: string }> = {
  'es': { title: "¿Todavía no formas parte de LogBook eQSL EXPRESS?", body: "Regístrate gratuitamente y descubre el centro mundial de propagación DX, el Libro de Guardia, eQSL y muchas más herramientas para radioaficionados y operadores de 11 metros.", closing: "¡Te esperamos en nuestra comunidad mundial!" },
  'en': { title: "Are you not part of LogBook eQSL EXPRESS yet?", body: "Register for free and discover the world DX propagation center, logbook, eQSL, and many more tools for amateur radio and 11-meter operators.", closing: "We look forward to welcoming you to our worldwide community!" },
  'pt': { title: "Ainda não faz parte do LogBook eQSL EXPRESS?", body: "Registe-se gratuitamente e descubra o centro mundial de propagação DX, o diário de estação, eQSL e muitas outras ferramentas para radioamadores e operadores dos 11 metros.", closing: "Esperamos por si na nossa comunidade mundial!" },
  'pt-br': { title: "Você ainda não faz parte do LogBook eQSL EXPRESS?", body: "Cadastre-se gratuitamente e descubra o centro mundial de propagação DX, o Livro de Estação, eQSL e muitas outras ferramentas para radioamadores e operadores dos 11 metros.", closing: "Esperamos você em nossa comunidade mundial!" },
  'fr': { title: "Vous ne faites pas encore partie de LogBook eQSL EXPRESS ?", body: "Inscrivez-vous gratuitement et découvrez le centre mondial de propagation DX, le carnet de trafic, eQSL et bien d’autres outils pour les radioamateurs et les opérateurs des 11 mètres.", closing: "Nous vous attendons dans notre communauté mondiale !" },
  'de': { title: "Gehörst du noch nicht zu LogBook eQSL EXPRESS?", body: "Registriere dich kostenlos und entdecke das weltweite DX-Ausbreitungszentrum, das Logbuch, eQSL und viele weitere Werkzeuge für Funkamateure und 11-Meter-Betreiber.", closing: "Wir freuen uns auf dich in unserer weltweiten Gemeinschaft!" },
  'it': { title: "Non fai ancora parte di LogBook eQSL EXPRESS?", body: "Registrati gratuitamente e scopri il centro mondiale di propagazione DX, il registro di stazione, eQSL e tanti altri strumenti per radioamatori e operatori degli 11 metri.", closing: "Ti aspettiamo nella nostra comunità mondiale!" },
  'nl': { title: "Maak je nog geen deel uit van LogBook eQSL EXPRESS?", body: "Registreer gratis en ontdek het wereldwijde DX-propagatiecentrum, het logboek, eQSL en meer hulpmiddelen voor radioamateurs en 11-meteroperators.", closing: "We verwelkomen je graag in onze wereldwijde gemeenschap!" },
  'pl': { title: "Nie należysz jeszcze do LogBook eQSL EXPRESS?", body: "Zarejestruj się bezpłatnie i poznaj światowe centrum propagacji DX, dziennik łączności, eQSL oraz narzędzia dla krótkofalowców i operatorów pasma 11 metrów.", closing: "Czekamy na Ciebie w naszej globalnej społeczności!" },
  'ru': { title: "Вы ещё не с LogBook eQSL EXPRESS?", body: "Зарегистрируйтесь бесплатно и откройте мировой центр DX-распространения, аппаратный журнал, eQSL и другие инструменты для радиолюбителей и операторов диапазона 11 метров.", closing: "Будем рады видеть вас в нашем мировом сообществе!" },
  'uk': { title: "Ви ще не користуєтеся LogBook eQSL EXPRESS?", body: "Зареєструйтеся безкоштовно та відкрийте світовий центр DX-поширення, апаратний журнал, eQSL та інструменти для радіоаматорів і операторів діапазону 11 метрів.", closing: "Чекаємо на вас у нашій світовій спільноті!" },
  'zh': { title: "您还不是 LogBook eQSL EXPRESS 的用户吗？", body: "免费注册，探索全球 DX 传播中心、通联日志、eQSL，以及为业余无线电爱好者和 11 米波段操作员提供的更多工具。", closing: "期待您加入我们的全球社区！" },
  'ja': { title: "LogBook eQSL EXPRESSにまだ参加していませんか？", body: "無料登録して、世界DX伝搬センター、交信ログ、eQSL、アマチュア無線や11メーターバンドのオペレーター向けのツールをご利用ください。", closing: "世界中の仲間とお会いできるのを楽しみにしています！" },
  'ko': { title: "아직 LogBook eQSL EXPRESS 회원이 아니신가요?", body: "무료로 가입하고 세계 DX 전파 센터, 교신 로그북, eQSL 및 아마추어 무선과 11미터 대역 운영자를 위한 다양한 도구를 만나보세요.", closing: "전 세계 커뮤니티에서 여러분을 기다립니다!" },
  'ar': { title: "ألم تنضم إلى LogBook eQSL EXPRESS بعد؟", body: "سجّل مجانًا واكتشف مركز انتشار DX العالمي وسجل الاتصالات وeQSL والعديد من الأدوات لهواة اللاسلكي ومشغلي نطاق 11 مترًا.", closing: "نرحب بك في مجتمعنا العالمي!" },
  'hi': { title: "क्या आप अभी तक LogBook eQSL EXPRESS से नहीं जुड़े हैं?", body: "मुफ़्त पंजीकरण करें और विश्व DX प्रसार केंद्र, लॉगबुक, eQSL तथा शौकिया रेडियो और 11-मीटर ऑपरेटरों के लिए कई अन्य टूल खोजें।", closing: "हमारे वैश्विक समुदाय में आपका स्वागत है!" },
  'tr': { title: "Henüz LogBook eQSL EXPRESS üyesi değil misiniz?", body: "Ücretsiz kaydolun; dünya DX yayılım merkezini, telsiz günlüğünü, eQSL’yi ve amatör telsizciler ile 11 metre operatörleri için daha birçok aracı keşfedin.", closing: "Sizi dünya topluluğumuzda bekliyoruz!" },
  'sv': { title: "Är du ännu inte en del av LogBook eQSL EXPRESS?", body: "Registrera dig gratis och upptäck DX-utbredningscentret, loggboken, eQSL och fler verktyg för radioamatörer och 11-metersoperatörer.", closing: "Vi ser fram emot att välkomna dig till vår globala gemenskap!" },
  'no': { title: "Er du ennå ikke en del av LogBook eQSL EXPRESS?", body: "Registrer deg gratis og oppdag DX-utbredelsessenteret, loggboken, eQSL og flere verktøy for radioamatører og 11-meteroperatører.", closing: "Vi gleder oss til å ønske deg velkommen i vårt globale fellesskap!" },
  'da': { title: "Er du endnu ikke en del af LogBook eQSL EXPRESS?", body: "Registrer dig gratis, og oplev DX-udbredelsescentret, logbogen, eQSL og flere værktøjer til radioamatører og 11-meteroperatører.", closing: "Vi glæder os til at byde dig velkommen i vores globale fællesskab!" },
  'fi': { title: "Etkö ole vielä mukana LogBook eQSL EXPRESS -palvelussa?", body: "Rekisteröidy maksutta ja tutustu DX-etenemiskeskukseen, lokikirjaan, eQSL-palveluun ja työkaluihin radioamatööreille ja 11 metrin operaattoreille.", closing: "Tervetuloa maailmanlaajuiseen yhteisöömme!" },
  'cs': { title: "Ještě nejste součástí LogBook eQSL EXPRESS?", body: "Zaregistrujte se zdarma a objevte centrum šíření DX, deník spojení, eQSL a další nástroje pro radioamatéry a operátory pásma 11 metrů.", closing: "Těšíme se na vás v naší celosvětové komunitě!" },
  'el': { title: "Δεν είστε ακόμη μέλος του LogBook eQSL EXPRESS;", body: "Εγγραφείτε δωρεάν και ανακαλύψτε το κέντρο διάδοσης DX, το ημερολόγιο επαφών, το eQSL και εργαλεία για ραδιοερασιτέχνες και χειριστές των 11 μέτρων.", closing: "Σας περιμένουμε στην παγκόσμια κοινότητά μας!" },
  'ro': { title: "Încă nu faci parte din LogBook eQSL EXPRESS?", body: "Înregistrează-te gratuit și descoperă centrul de propagare DX, jurnalul de trafic, eQSL și instrumente pentru radioamatori și operatorii de 11 metri.", closing: "Te așteptăm în comunitatea noastră mondială!" },
  'hu': { title: "Még nem vagy a LogBook eQSL EXPRESS tagja?", body: "Regisztrálj ingyenesen, és fedezd fel a DX-terjedési központot, a rádiónaplót, az eQSL-t és az eszközöket a rádióamatőrök és a 11 méteres sáv kezelői számára.", closing: "Várunk a világméretű közösségünkben!" },
  'id': { title: "Belum bergabung dengan LogBook eQSL EXPRESS?", body: "Daftar gratis dan temukan pusat propagasi DX, buku log, eQSL, serta alat untuk amatir radio dan operator 11 meter.", closing: "Kami menantikan kehadiran Anda di komunitas global kami!" },
  'th': { title: "คุณยังไม่ได้เป็นสมาชิก LogBook eQSL EXPRESS ใช่ไหม?", body: "สมัครฟรีเพื่อค้นพบศูนย์การแพร่กระจายคลื่น DX สมุดบันทึกการติดต่อ eQSL และเครื่องมือสำหรับนักวิทยุสมัครเล่นและผู้ใช้งานย่าน 11 เมตร", closing: "เรารอต้อนรับคุณเข้าสู่ชุมชนทั่วโลกของเรา!" },
};

export const PropagationReport: React.FC = () => {
  const [uiLanguage, setUiLanguage] = useState<AppLanguage>(() => getInitialAppLanguage());
  const [open, setOpen] = useState(false);
  const [showShareOptions, setShowShareOptions] = useState(false);
  const [shareLanguage, setShareLanguage] = useState<string>('auto');
  const chooseShareLanguage = (value: string) => setShareLanguage(value);
  const guestInvitation = guestInvitationCopy[uiLanguage] || guestInvitationCopy.en;
  const [showGuestInvitation, setShowGuestInvitation] = useState(() => {
    const sharedReport = new URLSearchParams(window.location.search).get('shared') === 'propagation';
    const validated = localStorage.getItem('logbook_sd_validated') === '1' && Boolean((localStorage.getItem('community_chat_identity_token') || '').trim()) && Boolean((localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim());
    return sharedReport && !validated;
  });
  useEffect(() => {
    const syncGuestStatus = () => {
      const sharedReport = new URLSearchParams(window.location.search).get('shared') === 'propagation';
      const validated = localStorage.getItem('logbook_sd_validated') === '1' && Boolean((localStorage.getItem('community_chat_identity_token') || '').trim()) && Boolean((localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim());
      setShowGuestInvitation(sharedReport && !validated);
    };
    window.addEventListener('user-profile-updated', syncGuestStatus);
    window.addEventListener('storage', syncGuestStatus);
    return () => {
      window.removeEventListener('user-profile-updated', syncGuestStatus);
      window.removeEventListener('storage', syncGuestStatus);
    };
  }, []);
  useEffect(() => {
    const syncLanguage = () => setUiLanguage(getInitialAppLanguage());
    window.addEventListener('user-profile-updated', syncLanguage);
    window.addEventListener('storage', syncLanguage);
    return () => {
      window.removeEventListener('user-profile-updated', syncLanguage);
      window.removeEventListener('storage', syncLanguage);
    };
  }, []);
  const [loading, setLoading] = useState(false);
  const [sfi, setSfi] = useState<number | null>(null);
  const [kp, setKp] = useState<number | null>(null);
  const [auroraFrames, setAuroraFrames] = useState<{ north: AuroraFrame[]; south: AuroraFrame[] }>({ north: [], south: [] });
  const [auroraFrameError, setAuroraFrameError] = useState('');
  const [updated, setUpdated] = useState('');
  const [error, setError] = useState('');
  const [dxReports, setDxReports] = useState<DXReception[]>([]);
  const [externalSpots, setExternalSpots] = useState<ExternalSpot[]>([]);
  const [externalSources, setExternalSources] = useState<Record<string, SpotSourceState>>({});
  const [externalSpotsUpdated, setExternalSpotsUpdated] = useState('');
  const [externalSpotsError, setExternalSpotsError] = useState('');
  const [radioStats, setRadioStats] = useState<RadioStats | null>(null);
  const [radioConditions, setRadioConditions] = useState<RadioConditions | null>(null);
  const [ionosondeStations, setIonosondeStations] = useState<IonosondeStation[]>([]);
  const [radioHistory, setRadioHistory] = useState<RadioHistory | null>(null);
  const [radioHistoryPeriod, setRadioHistoryPeriod] = useState<'1h'|'6h'|'24h'|'7d'>('24h');
  const [radioHistoryBand, setRadioHistoryBand] = useState(() => readPropagationFilterPreferences().historyBand);
  const [radioHistoryMode, setRadioHistoryMode] = useState(() => readPropagationFilterPreferences().historyMode);
  const [selectedHistoryBucket, setSelectedHistoryBucket] = useState<number | null>(null);
  const radioHistoryRequestId = useRef(0);
  const [radioDataUpdated, setRadioDataUpdated] = useState('');
  const [radioDataError, setRadioDataError] = useState('');

  const [liveQsoContacts, setLiveQsoContacts] = useState<LiveQsoContact[]>([]);
  const [liveGridLocators, setLiveGridLocators] = useState<Record<string, string>>({});
  const [liveMapClock, setLiveMapClock] = useState(Date.now());
  const [dxLoading, setDxLoading] = useState(false);
  const [dxError, setDxError] = useState('');
  const [dxUpdated, setDxUpdated] = useState('');
  const [lastDxRequest, setLastDxRequest] = useState(0);
  const [mapZone, setMapZone] = useState<'world'|'zone'|'country'|'continent'>('world');
  const [showGreyLine, setShowGreyLine] = useState(true);
  const [showMaidenheadGrid, setShowMaidenheadGrid] = useState(true);
  const [showDxPaths, setShowDxPaths] = useState(true);
  const [selectedMapBand, setSelectedMapBand] = useState(() => readPropagationFilterPreferences().mapBand);
  const [selectedMapMode, setSelectedMapMode] = useState(() => readPropagationFilterPreferences().mapMode);
  const [mapStatus, setMapStatus] = useState('Cargando cartografía…');
  const mapElementRef = useRef<HTMLDivElement|null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapLayersRef = useRef<any>(null);
  const [identityRefresh, setIdentityRefresh] = useState(0);
  const [selectedIdentity, setSelectedIdentity] = useState<'11m' | 'ham'>(() => {
    const saved = localStorage.getItem('logbook_propagation_identity');
    if (saved === '11m' || saved === 'ham') return saved;
    const primary = (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
    const active = (localStorage.getItem('community_chat_active_callsign') || '').trim().toUpperCase();
    const cb = (localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
    return cb && active === cb ? '11m' : (is11MeterStationIdentifier(primary) ? '11m' : 'ham');
  });
  const [filterPreferenceKey, setFilterPreferenceKey] = useState(() => propagationFilterPreferenceKey());
  useEffect(() => {
    const key = propagationFilterPreferenceKey();
    if (key === filterPreferenceKey) return;
    const saved = readPropagationFilterPreferences(key);
    setRadioHistoryBand(saved.historyBand);
    setRadioHistoryMode(saved.historyMode);
    setSelectedMapBand(saved.mapBand);
    setSelectedMapMode(saved.mapMode);
    setFilterPreferenceKey(key);
  }, [identityRefresh, filterPreferenceKey]);
  useEffect(() => {
    try {
      localStorage.setItem(filterPreferenceKey, JSON.stringify({
        mapBand: selectedMapBand, mapMode: selectedMapMode,
        historyBand: radioHistoryBand, historyMode: radioHistoryMode,
      }));
    } catch { /* La aplicación sigue funcionando aunque el almacenamiento local esté lleno o bloqueado. */ }
  }, [filterPreferenceKey, selectedMapBand, selectedMapMode, radioHistoryBand, radioHistoryMode]);

  const stationIdentity = useMemo(() => {
    const primary = (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
    const cb = (localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
    const linkedTo = (localStorage.getItem('cb_station_linked_sd') || '').trim().toUpperCase();
    const primaryIs11m = is11MeterStationIdentifier(primary);
    const linkedCb = Boolean(cb && !primaryIs11m && linkedTo === primary);
    const hasHam = Boolean(primary && !primaryIs11m);
    const has11m = Boolean(linkedCb || primaryIs11m);
    const callsign11m = linkedCb ? cb : (primaryIs11m ? primary : '');
    const callsignHam = hasHam ? primary : '';
    const selectedCallsign = selectedIdentity === '11m' ? callsign11m : callsignHam;
    return {
      hasHam, has11m, selectedCallsign,
      selectedType: selectedCallsign ? selectedIdentity : (callsign11m ? '11m' : 'ham'),
      flag: selectedCallsign ? flagForCallsign(selectedCallsign, undefined, selectedIdentity === '11m') : '🏳️',
      grid: (localStorage.getItem('user_grid_locator') || '').trim().toUpperCase(),
    };
  }, [identityRefresh, selectedIdentity]);
  useEffect(() => {
    const refreshIdentity = () => setIdentityRefresh(value => value + 1);
    window.addEventListener('user-profile-updated', refreshIdentity);
    window.addEventListener('community-active-identity-changed', refreshIdentity);
    window.addEventListener('storage', refreshIdentity);
    return () => {
      window.removeEventListener('user-profile-updated', refreshIdentity);
      window.removeEventListener('community-active-identity-changed', refreshIdentity);
      window.removeEventListener('storage', refreshIdentity);
    };
  }, []);
  useEffect(() => {
    if (stationIdentity.has11m && !stationIdentity.hasHam) setSelectedIdentity('11m');
    else if (stationIdentity.hasHam && !stationIdentity.has11m) setSelectedIdentity('ham');
  }, [stationIdentity.has11m, stationIdentity.hasHam]);
  const chooseIdentity = (identity: '11m' | 'ham') => {
    setSelectedIdentity(identity);
    localStorage.setItem('logbook_propagation_identity', identity);
  };


  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [fluxResponse, kpResponse] = await Promise.all([
        fetch('https://services.swpc.noaa.gov/products/summary/10cm-flux.json', { cache: 'no-store' }),
        fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { cache: 'no-store' }),
      ]);
      if (!fluxResponse.ok || !kpResponse.ok) throw new Error('No se pudieron consultar los datos solares.');
      const fluxData = await fluxResponse.json();
      const kpData = await kpResponse.json();
      const normalizeRows = (data: any, valueKey: string) => {
        if (!Array.isArray(data)) return data && typeof data === 'object' ? [data] : [];
        // NOAA cambió estos productos a objetos JSON con claves en marzo de 2026.
        // Se admite también el formato tabular anterior por compatibilidad.
        if (Array.isArray(data[0])) {
          const headers = data[0].map((key: unknown) => String(key));
          return data.slice(1).map((values: unknown[]) =>
            Object.fromEntries(headers.map((key: string, index: number) => [key, values[index]]))
          );
        }
        return data;
      };
      const fluxRows = normalizeRows(fluxData, 'flux');
      const fluxRow = [...fluxRows].reverse().find((row: any) => {
        const value = Number(row?.Flux ?? row?.flux ?? row?.['10cm_flux']);
        return Number.isFinite(value) && Number.isFinite(Date.parse(String(row?.time_tag || '')));
      });
      const fluxValue = Number(fluxRow?.Flux ?? fluxRow?.flux ?? fluxRow?.['10cm_flux']);
      const kpRows = normalizeRows(kpData, 'Kp');
      const kpRow = [...kpRows].reverse().find((row: any) => {
        const value = Number(row?.kp_index ?? row?.estimated_kp ?? row?.Kp);
        return Number.isFinite(value) && Number.isFinite(Date.parse(String(row?.time_tag || '')));
      });
      const kpValue = Number(kpRow?.kp_index ?? kpRow?.estimated_kp ?? kpRow?.Kp);
      if (!Number.isFinite(fluxValue) || !Number.isFinite(kpValue)) throw new Error('NOAA no devolvió mediciones solares válidas. Se conservan los últimos datos disponibles.');
      const kpTime = Date.parse(String(kpRow.time_tag));
      const fluxTime = Date.parse(String(fluxRow.time_tag));
      const nowTime = Date.now();
      if (nowTime - kpTime > 9 * 60 * 60 * 1000 || nowTime - fluxTime > 72 * 60 * 60 * 1000) {
        throw new Error('Los datos de NOAA recibidos están demasiado antiguos. Se mantienen las últimas mediciones válidas.');
      }
      setSfi(fluxValue);
      setKp(kpValue);
      setUpdated('NOAA · Kp ' + new Date(kpTime).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC · Flujo ' + new Date(fluxTime).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Datos solares no disponibles. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open && sfi === null && !loading) void refresh(); }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadAuroraFrames = async () => {
      try {
        const [northResponse, southResponse] = await Promise.all([
          fetch('https://services.swpc.noaa.gov/products/animations/ovation_north_24h.json', { cache: 'no-store' }),
          fetch('https://services.swpc.noaa.gov/products/animations/ovation_south_24h.json', { cache: 'no-store' }),
        ]);
        if (!northResponse.ok || !southResponse.ok) throw new Error('NOAA no pudo entregar la secuencia auroral.');
        const [northRaw, southRaw] = await Promise.all([northResponse.json(), southResponse.json()]);
        const normalizeFrames = (raw: unknown): AuroraFrame[] => {
          if (!Array.isArray(raw)) return [];
          return raw.filter((frame: any) => frame && typeof frame.url === 'string' && Number.isFinite(Date.parse(String(frame.time_tag || ''))))
            .slice(-24)
            .map((frame: any) => ({
              url: new URL(frame.url, 'https://services.swpc.noaa.gov').toString(),
              time_tag: String(frame.time_tag),
            }));
        };
        const north = normalizeFrames(northRaw);
        const south = normalizeFrames(southRaw);
        if (!north.length || !south.length) throw new Error('La secuencia de imágenes de NOAA está vacía.');
        if (!cancelled) {
          setAuroraFrames(current => {
            const latestNorth = north[north.length - 1];
            const latestSouth = south[south.length - 1];
            const currentNorth = current.north[current.north.length - 1];
            const currentSouth = current.south[current.south.length - 1];
            if (currentNorth?.url === latestNorth?.url && currentNorth?.time_tag === latestNorth?.time_tag &&
                currentSouth?.url === latestSouth?.url && currentSouth?.time_tag === latestSouth?.time_tag) return current;
            return { north, south };
          });
          setAuroraFrameError('');
        }
      } catch (e) {
        if (!cancelled) setAuroraFrameError(e instanceof Error ? e.message : 'Visualización auroral temporalmente no disponible.');
      }
    };
    void loadAuroraFrames();
    const refreshTimer = window.setInterval(() => { void loadAuroraFrames(); }, 5 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
    };
  }, [open]);




  const refreshExternalActivity = async () => {
    try {
      const response = await fetch('https://cqdx.io/api/v1/spots?live=true', { cache: 'no-store' });
      if (!response.ok) throw new Error(response.status === 429 ? 'La fuente mundial alcanzó su límite temporal; se reintentará automáticamente.' : 'La actividad mundial no está disponible en este momento.');
      const payload = await response.json();
      const groups = Array.isArray(payload?.groups) ? payload.groups : [];
      setExternalSpots(groups.filter((g: any) => Number.isFinite(Number(g.dxLat)) && Number.isFinite(Number(g.dxLon))) as ExternalSpot[]);
      const computedAt = payload?.computedAt ? new Date(payload.computedAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }) : new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
      setExternalSpotsUpdated(computedAt);
      setExternalSpotsError('');
    } catch (e) {
      setExternalSpotsError(e instanceof Error ? e.message : 'No se pudo consultar la actividad mundial.');
    }
    try {
      const response = await fetch('https://cqdx.io/api/v1/stats/sources', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        const sources = payload?.sources && typeof payload.sources === 'object' ? payload.sources : payload;
        setExternalSources(sources || {});
      }
    } catch { /* El estado de fuentes es informativo; los spots siguen funcionando sin él. */ }
  };

  useEffect(() => {
    if (!open) return;
    void refreshExternalActivity();
    const timer = window.setInterval(() => void refreshExternalActivity(), 30000);
    return () => window.clearInterval(timer);
  }, [open]);


  const refreshRadioAmateurData = async (period: '1h'|'6h'|'24h'|'7d' = radioHistoryPeriod) => {
    const requestId = ++radioHistoryRequestId.current;
    const fetchJson = async (url: string) => {
      const response = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(response.status === 429 ? 'Límite temporal de la fuente de datos.' : 'HTTP ' + response.status);
      return response.json();
    };
    const historyParams = new URLSearchParams({ period });
    if (radioHistoryBand) historyParams.set('band', radioHistoryBand);
    if (radioHistoryMode) historyParams.set('mode', radioHistoryMode);
    const [statsResult, conditionsResult, propagationResult, historyResult] = await Promise.allSettled([
      fetchJson('https://cqdx.io/api/v1/embed/stats'),
      fetchJson('https://cqdx.io/api/v1/embed/conditions'),
      fetchJson('https://cqdx.io/api/v1/propagation'),
      fetchJson('https://cqdx.io/api/v1/stats/history?' + historyParams.toString()),
    ]);
    // Ignorar respuestas antiguas: un filtro/período más reciente siempre tiene prioridad.
    if (requestId !== radioHistoryRequestId.current) return;
    const failures: string[] = [];
    if (statsResult.status === 'fulfilled') {
      const data = statsResult.value;
      if (data && typeof data === 'object') setRadioStats(data as RadioStats);
      else failures.push('estadísticas');
    } else failures.push('estadísticas');
    if (conditionsResult.status === 'fulfilled') {
      const data = conditionsResult.value;
      if (data && typeof data === 'object') setRadioConditions(data as RadioConditions);
      else failures.push('condiciones solares');
    } else failures.push('condiciones solares');
    if (propagationResult.status === 'fulfilled') {
      const stations = Array.isArray(propagationResult.value?.stations) ? propagationResult.value.stations : [];
      setIonosondeStations(stations.filter((station: any) =>
        Number.isFinite(Number(station.lat)) && Number.isFinite(Number(station.lon)) &&
        Number.isFinite(Number(station.muf)) && Number(station.muf) > 0
      ) as IonosondeStation[]);
    } else failures.push('ionosondas');
    if (historyResult.status === 'fulfilled') {
      const data = historyResult.value;
      if (data && Array.isArray(data.data)) setRadioHistory(data as RadioHistory);
      else failures.push('historial');
    } else failures.push('historial');
    setRadioDataUpdated(new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }));
    setRadioDataError(failures.length ? 'Datos temporalmente no disponibles: ' + failures.join(', ') + '. Se conservan los últimos valores recibidos.' : '');
  };

  useEffect(() => {
    if (!open) return;
    void refreshRadioAmateurData(radioHistoryPeriod);
    const timer = window.setInterval(() => void refreshRadioAmateurData(radioHistoryPeriod), 60000);
    return () => window.clearInterval(timer);
  }, [open, radioHistoryPeriod, radioHistoryBand, radioHistoryMode]);

  const refreshDx = async () => {
    const callsign = stationIdentity.selectedCallsign.trim().toUpperCase();
    if (!callsign || stationIdentity.selectedType !== 'ham') {
      setDxReports([]);
      setDxError(stationIdentity.selectedType === '11m'
        ? 'Los informes de 11 metros requieren una fuente autorizada de 11 m; PSK Reporter no se usa para esta modalidad.'
        : 'Seleccioná una señal distintiva de radioaficionado para consultar informes.');
      return;
    }
    const now = Date.now();
    if (lastDxRequest && now - lastDxRequest < 300000) {
      setDxError('PSK Reporter recomienda consultar como máximo cada 5 minutos. Esperá antes de volver a actualizar.');
      return;
    }
    setLastDxRequest(now);
    setDxLoading(true);
    setDxError('');
    try {
      const url = new URL('https://retrieve.pskreporter.info/query');
      url.searchParams.set('callsign', callsign);
      url.searchParams.set('flowStartSeconds', '-21600');
      url.searchParams.set('rptlimit', '50');
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('PSK Reporter no está disponible en este momento.');
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('La respuesta de PSK Reporter no tiene un formato válido.');
      const reports = Array.from(xml.querySelectorAll('receptionReport')).map(node => ({
        receiverCallsign: node.getAttribute('receiverCallsign') || '',
        senderCallsign: node.getAttribute('senderCallsign') || '',
        frequency: Number(node.getAttribute('frequency') || 0),
        flowStartSeconds: Number(node.getAttribute('flowStartSeconds') || 0),
        receiverLocator: node.getAttribute('receiverLocator') || undefined,
        mode: node.getAttribute('mode') || undefined,
      })).filter(report => report.receiverCallsign || report.senderCallsign);
      setDxReports(reports);
      setDxUpdated(new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }));
      if (!reports.length) setDxError('No hay informes para este indicativo en las últimas 6 horas. Esto no significa que no haya propagación.');
    } catch (e) {
      setDxError(e instanceof Error ? e.message : 'No se pudieron recuperar los informes DX.');
    } finally {
      setDxLoading(false);
    }
  };

  const sharePropagation = (channel: 'whatsapp' | 'telegram' | 'email') => {
    const recipientLanguage: AppLanguage = shareLanguage === 'auto' ? (uiLanguage || getInitialAppLanguage()) : shareLanguage as AppLanguage;
    const copy: Record<AppLanguage, { title: string; station: string; mode: string; grid: string; solar: string; kp: string; reports: string }> = {
      es:{title:'LogBook eQSL EXPRESS · Centro Mundial de Propagación DX',station:'Estación',mode:'Modalidad',grid:'Grid Locator',solar:'Flujo solar (SFI)',kp:'Índice geomagnético (Kp)',reports:'Informes DX'},
      en:{title:'LogBook eQSL EXPRESS · World DX Propagation Center',station:'Station',mode:'Mode',grid:'Grid Locator',solar:'Solar Flux (SFI)',kp:'Geomagnetic Index (Kp)',reports:'DX Reports'},
      pt:{title:'LogBook eQSL EXPRESS · Centro Mundial de Propagação DX',station:'Estação',mode:'Modalidade',grid:'Grid Locator',solar:'Fluxo solar (SFI)',kp:'Índice geomagnético (Kp)',reports:'Relatórios DX'},
      'pt-br':{title:'LogBook eQSL EXPRESS · Centro Mundial de Propagação DX',station:'Estação',mode:'Modalidade',grid:'Grid Locator',solar:'Fluxo solar (SFI)',kp:'Índice geomagnético (Kp)',reports:'Relatórios DX'},
      fr:{title:'LogBook eQSL EXPRESS · Centre mondial de propagation DX',station:'Station',mode:'Mode',grid:'Grid Locator',solar:'Flux solaire (SFI)',kp:'Indice géomagnétique (Kp)',reports:'Rapports DX'},
      de:{title:'LogBook eQSL EXPRESS · Weltweites DX-Ausbreitungszentrum',station:'Station',mode:'Betriebsart',grid:'Grid Locator',solar:'Solarfluss (SFI)',kp:'Geomagnetischer Index (Kp)',reports:'DX-Berichte'},
      it:{title:'LogBook eQSL EXPRESS · Centro mondiale di propagazione DX',station:'Stazione',mode:'Modalità',grid:'Grid Locator',solar:'Flusso solare (SFI)',kp:'Indice geomagnetico (Kp)',reports:'Rapporti DX'},
      nl:{title:'LogBook eQSL EXPRESS · Wereldwijd DX-propagatiecentrum',station:'Station',mode:'Modus',grid:'Grid Locator',solar:'Zonneflux (SFI)',kp:'Geomagnetische index (Kp)',reports:'DX-rapporten'},
      pl:{title:'LogBook eQSL EXPRESS · Światowe Centrum Propagacji DX',station:'Stacja',mode:'Tryb',grid:'Grid Locator',solar:'Strumień słoneczny (SFI)',kp:'Indeks geomagnetyczny (Kp)',reports:'Raporty DX'},
      ru:{title:'LogBook eQSL EXPRESS · Всемирный центр DX-распространения',station:'Станция',mode:'Режим',grid:'Grid Locator',solar:'Солнечный поток (SFI)',kp:'Геомагнитный индекс (Kp)',reports:'DX-отчёты'},
      uk:{title:'LogBook eQSL EXPRESS · Світовий центр DX-поширення',station:'Станція',mode:'Режим',grid:'Grid Locator',solar:'Сонячний потік (SFI)',kp:'Геомагнітний індекс (Kp)',reports:'DX-звіти'},
      zh:{title:'LogBook eQSL EXPRESS · 全球 DX 传播中心',station:'电台',mode:'模式',grid:'网格定位',solar:'太阳通量 (SFI)',kp:'地磁指数 (Kp)',reports:'DX 报告'},
      ja:{title:'LogBook eQSL EXPRESS · 世界DX伝搬センター',station:'局',mode:'モード',grid:'グリッドロケーター',solar:'太陽フラックス (SFI)',kp:'地磁気指数 (Kp)',reports:'DXレポート'},
      ko:{title:'LogBook eQSL EXPRESS · 세계 DX 전파 센터',station:'국',mode:'모드',grid:'그리드 로케이터',solar:'태양 플럭스 (SFI)',kp:'지자기 지수 (Kp)',reports:'DX 보고서'},
      ar:{title:'LogBook eQSL EXPRESS · المركز العالمي لانتشار DX',station:'المحطة',mode:'النمط',grid:'محدد الشبكة',solar:'التدفق الشمسي (SFI)',kp:'المؤشر الجيومغناطيسي (Kp)',reports:'تقارير DX'},
      hi:{title:'LogBook eQSL EXPRESS · विश्व DX प्रसार केंद्र',station:'स्टेशन',mode:'मोड',grid:'ग्रिड लोकेटर',solar:'सौर फ्लक्स (SFI)',kp:'भूचुंबकीय सूचकांक (Kp)',reports:'DX रिपोर्ट'},
      tr:{title:'LogBook eQSL EXPRESS · Dünya DX Yayılım Merkezi',station:'İstasyon',mode:'Mod',grid:'Grid Locator',solar:'Güneş Akısı (SFI)',kp:'Jeomanyetik İndeks (Kp)',reports:'DX Raporları'},
      sv:{title:'LogBook eQSL EXPRESS · Världens DX-utbredningscenter',station:'Station',mode:'Läge',grid:'Grid Locator',solar:'Solflöde (SFI)',kp:'Geomagnetiskt index (Kp)',reports:'DX-rapporter'},
      no:{title:'LogBook eQSL EXPRESS · Verdenssenter for DX-utbredelse',station:'Stasjon',mode:'Modus',grid:'Grid Locator',solar:'Solfluks (SFI)',kp:'Geomagnetisk indeks (Kp)',reports:'DX-rapporter'},
      da:{title:'LogBook eQSL EXPRESS · Verdenscenter for DX-udbredelse',station:'Station',mode:'Tilstand',grid:'Grid Locator',solar:'Solflux (SFI)',kp:'Geomagnetisk indeks (Kp)',reports:'DX-rapporter'},
      fi:{title:'LogBook eQSL EXPRESS · Maailman DX-etenemiskeskus',station:'Asema',mode:'Tila',grid:'Grid Locator',solar:'Aurinkovuo (SFI)',kp:'Geomagneettinen indeksi (Kp)',reports:'DX-raportit'},
      cs:{title:'LogBook eQSL EXPRESS · Světové centrum šíření DX',station:'Stanice',mode:'Režim',grid:'Grid Locator',solar:'Sluneční tok (SFI)',kp:'Geomagnetický index (Kp)',reports:'DX hlášení'},
      el:{title:'LogBook eQSL EXPRESS · Παγκόσμιο Κέντρο Διάδοσης DX',station:'Σταθμός',mode:'Τρόπος',grid:'Grid Locator',solar:'Ηλιακή ροή (SFI)',kp:'Γεωμαγνητικός δείκτης (Kp)',reports:'Αναφορές DX'},
      ro:{title:'LogBook eQSL EXPRESS · Centrul mondial de propagare DX',station:'Stație',mode:'Mod',grid:'Grid Locator',solar:'Flux solar (SFI)',kp:'Indice geomagnetic (Kp)',reports:'Rapoarte DX'},
      hu:{title:'LogBook eQSL EXPRESS · Világméretű DX-terjedési központ',station:'Állomás',mode:'Üzemmód',grid:'Grid Locator',solar:'Napfluxus (SFI)',kp:'Geomágneses index (Kp)',reports:'DX-jelentések'},
      id:{title:'LogBook eQSL EXPRESS · Pusat Propagasi DX Dunia',station:'Stasiun',mode:'Mode',grid:'Grid Locator',solar:'Fluks Matahari (SFI)',kp:'Indeks Geomagnetik (Kp)',reports:'Laporan DX'},
      th:{title:'LogBook eQSL EXPRESS · ศูนย์การแพร่กระจายคลื่น DX ทั่วโลก',station:'สถานี',mode:'โหมด',grid:'Grid Locator',solar:'ฟลักซ์สุริยะ (SFI)',kp:'ดัชนีธรณีแม่เหล็ก (Kp)',reports:'รายงาน DX'},
    };
    const labels = copy[recipientLanguage] || copy.en;
    const shareUrl = window.location.origin + '/?shared=propagation&lang=' + encodeURIComponent(recipientLanguage);
    const shareText = [
      labels.title,
      labels.station + ': ' + (stationIdentity.selectedCallsign || '—'),
      labels.mode + ': ' + (stationIdentity.selectedType === '11m' ? '11 m' : 'Amateur radio'),
      labels.grid + ': ' + (stationIdentity.grid || '—'),
      labels.solar + ': ' + (sfi === null ? '—' : Math.round(sfi)),
      labels.kp + ': ' + (kp === null ? '—' : kp.toFixed(1)),
      labels.reports + ': ' + dxReports.length,
      shareUrl,
    ].join('\n');
    const encodedText = encodeURIComponent(shareText);
    setShowShareOptions(false);
    if (channel === 'whatsapp') {
      window.location.assign('https://wa.me/?text=' + encodedText);
      return;
    }
    if (channel === 'telegram') {
      window.location.assign('https://t.me/share/url?url=' + encodeURIComponent(shareUrl) + '&text=' + encodeURIComponent(shareText.replace('\n' + shareUrl, '')));
      return;
    }
    window.location.assign('mailto:?subject=' + encodeURIComponent(labels.title) + '&body=' + encodedText);
  };;

  useEffect(() => {
    if (open && stationIdentity.selectedType === 'ham' && stationIdentity.selectedCallsign) void refreshDx();
  }, [open, stationIdentity.selectedCallsign, stationIdentity.selectedType]);

  useEffect(() => {
    const client = supabase;
    if (!open || !client) return;
    let active = true;
    const loadLiveContacts = async () => {
      const [spotsResult, gridsResult] = await Promise.all([
        client.from('live_qso_spots').select('spot_key,callsign,station_callsign,band,frequency,mode,qso_date,qso_time,created_at,country').order('created_at', { ascending: false }).limit(200),
        client.from('live_spot_grid_locators').select('callsign,grid_locator'),
      ]);
      if (!active) return;
      if (spotsResult.error) console.warn('No se pudieron cargar los contactos del mapa:', spotsResult.error.message);
      else setLiveQsoContacts((spotsResult.data || []) as LiveQsoContact[]);
      if (gridsResult.error) console.warn('No se pudieron cargar los locator del mapa:', gridsResult.error.message);
      else {
        const next: Record<string, string> = {};
        (gridsResult.data || []).forEach((row: { callsign: string; grid_locator: string | null }) => {
          if (row.grid_locator) next[String(row.callsign).trim().toUpperCase()] = row.grid_locator;
        });
        setLiveGridLocators(next);
      }
      setLiveMapClock(Date.now());
    };
    void loadLiveContacts();
    const channel = client.channel('propagation-live-qso-map')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_qso_spots' }, () => { void loadLiveContacts(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_spot_grid_locators' }, () => { void loadLiveContacts(); })
      .subscribe();
    const poll = window.setInterval(() => { void loadLiveContacts(); setLiveMapClock(Date.now()); }, 60000);
    return () => { active = false; window.clearInterval(poll); void client.removeChannel(channel); };
  }, [open]);
  const ownGeo=maidenheadToLatLon(stationIdentity.grid);
  const ownCountry=countryForCallsign(stationIdentity.selectedCallsign,undefined,stationIdentity.selectedType==='11m');
  const contactPoint = (contact: LiveQsoContact, callsign: string): GeoPoint | null => {
    const exact = maidenheadToLatLon(liveGridLocators[callsign]);
    if (exact) return exact;
    const mhz = Number(String(contact.frequency || '').replace(',', '.'));
    const is11m = Number.isFinite(mhz) && mhz >= 26 && mhz <= 28;
    const country = countryForCallsign(callsign, callsign === contact.callsign ? contact.country || undefined : undefined, is11m);
    return capitalPointForCountry(country);
  };
  const ownContinent=ownGeo?continentForPoint(ownGeo):'';
  const solarFluxValue = radioConditions?.sfi ?? sfi;
  const geomagneticKpValue = radioConditions?.kp != null ? Number(radioConditions.kp) : kp;
  const solarFluxLabel = solarFluxValue == null ? 'Esperando medición' : solarFluxValue < 70 ? 'Actividad solar baja' : solarFluxValue < 100 ? 'Actividad moderada' : solarFluxValue < 150 ? 'Buena disponibilidad potencial en HF' : 'Flujo solar elevado';
  const geomagneticLabel = geomagneticKpValue == null ? 'Esperando índice Kp' : geomagneticKpValue < 4 ? 'Campo geomagnético tranquilo' : geomagneticKpValue < 5 ? 'Inestable' : geomagneticKpValue < 6 ? 'Tormenta menor · G1' : geomagneticKpValue < 7 ? 'Tormenta moderada · G2' : geomagneticKpValue < 8 ? 'Tormenta fuerte · G3' : geomagneticKpValue < 9 ? 'Tormenta severa · G4' : 'Tormenta extrema · G5';
  const visibleLiveContacts = liveQsoContacts.filter(contact => {
    const age = liveMapClock - new Date(contact.created_at).getTime();
    if (!Number.isFinite(age) || age < 0 || age >= 60 * 60 * 1000) return false;
    if (selectedMapBand && contact.band !== selectedMapBand) return false;
    if (selectedMapMode && String(contact.mode || '').toUpperCase() !== selectedMapMode.toUpperCase()) return false;
    const first = contactPoint(contact, contact.callsign);
    const second = contactPoint(contact, contact.station_callsign);
    if (!first || !second) return false;
    if (mapZone === 'zone') return Boolean(ownGeo && (distanceKm(ownGeo, first) <= 1200 || distanceKm(ownGeo, second) <= 1200));
    if (mapZone === 'country') return countryForCallsign(contact.callsign, contact.country || undefined) === ownCountry || countryForCallsign(contact.station_callsign) === ownCountry;
    if (mapZone === 'continent') { const region = mapRegions.find(x => x.name === ownContinent); return Boolean(region && [first, second].some(point => point.lat >= region.bounds.south && point.lat <= region.bounds.north && point.lon >= region.bounds.west && point.lon <= region.bounds.east)); }
    return true;
  });
  const visibleExternalSpots = externalSpots.filter(spot => {
    if (selectedMapBand && spot.band.toLowerCase() !== selectedMapBand.toLowerCase()) return false;
    if (selectedMapMode && spot.mode.toUpperCase() !== selectedMapMode.toUpperCase() && !(selectedMapMode === 'SSB' && ['USB','LSB'].includes(spot.mode.toUpperCase()))) return false;
    const p = { lat: Number(spot.dxLat), lon: Number(spot.dxLon) };
    if (mapZone === 'zone') return Boolean(ownGeo && distanceKm(ownGeo, p) <= 1200);
    if (mapZone === 'country') return countryForCallsign(spot.dxCall, spot.dxEntityName || undefined) === ownCountry;
    if (mapZone === 'continent') { const r = mapRegions.find(x => x.name === ownContinent); return Boolean(r && p.lat >= r.bounds.south && p.lat <= r.bounds.north && p.lon >= r.bounds.west && p.lon <= r.bounds.east); }
    return true;
  });
  const visibleDxReports=dxReports.filter(report=>{
    if(selectedMapBand && bandForFrequency(report.frequency)!==selectedMapBand)return false;
    if(selectedMapMode && String(report.mode||'').toUpperCase()!==selectedMapMode.toUpperCase())return false;
    const p=maidenheadToLatLon(report.receiverLocator); if(!p)return false;
    if(mapZone==='zone')return Boolean(ownGeo&&distanceKm(ownGeo,p)<=1200);
    if(mapZone==='country')return Boolean(ownCountry&&countryForCallsign(report.receiverCallsign)===ownCountry);
    if(mapZone==='continent'){const r=mapRegions.find(x=>x.name===ownContinent);return Boolean(r&&p.lat>=r.bounds.south&&p.lat<=r.bounds.north&&p.lon>=r.bounds.west&&p.lon<=r.bounds.east);}
    return true;
  });
  useEffect(()=>{
    if(!open||!mapElementRef.current)return;
    let cancelled=false;
    const load=async()=>{
      if(!(window as any).L){
        let script=document.querySelector('script[data-logbook-leaflet]') as HTMLScriptElement|null;
        if(!script){script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.async=true;script.dataset.logbookLeaflet='true';document.head.appendChild(script);}
        await new Promise<void>((resolve,reject)=>{if((window as any).L)return resolve();script!.addEventListener('load',()=>resolve(),{once:true});script!.addEventListener('error',()=>reject(new Error('No se pudo cargar el motor del mapa.')),{once:true});});
      }
      if(cancelled||!mapElementRef.current)return;
      const L=(window as any).L;
      if(!document.querySelector('link[data-logbook-leaflet-css]')){const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';css.dataset.logbookLeafletCss='true';document.head.appendChild(css);}
      if(!mapInstanceRef.current){mapInstanceRef.current=L.map(mapElementRef.current,{worldCopyJump:true,scrollWheelZoom:true}).setView([15,0],2);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(mapInstanceRef.current);mapLayersRef.current=L.layerGroup().addTo(mapInstanceRef.current);}
      const map=mapInstanceRef.current,layers=mapLayersRef.current;layers.clearLayers();
      const state=(r:typeof mapRegions[number])=>{const h=(new Date().getUTCHours()+Math.round(r.lon/15)+24)%24,day=h>=7&&h<19;if(kp!==null&&kp>=5)return{label:'Mala',color:'#ef4444'};if(sfi!==null&&sfi>=120&&day&&(kp===null||kp<4))return{label:'Buena',color:'#22c55e'};return{label:'Media',color:'#f59e0b'};};
      mapRegions.forEach(r=>{const st=state(r);L.circle([r.lat,r.lon],{radius:r.radius,color:st.color,weight:1.5,fillColor:st.color,fillOpacity:.19,opacity:.75}).bindTooltip(r.name+' · Propagación orientativa: '+st.label).addTo(layers);});
      if(showGreyLine){
        const terminator=greyLineCoordinates(new Date());
        L.polyline(terminator,{color:'#e2e8f0',weight:2.5,opacity:.95,dashArray:'7 5'}).bindTooltip('Grey Line · terminador día/noche aproximado').addTo(layers);
        [-6,6].forEach(offset=>L.polyline(terminator.map(([lat,lon])=>[Math.max(-89.9,Math.min(89.9,lat+offset)),lon]),{color:'#94a3b8',weight:1,opacity:.45,dashArray:'3 7'}).addTo(layers));
      }
      if(showMaidenheadGrid){
        for(let lon=-180;lon<=180;lon+=20)L.polyline([[-90,lon],[90,lon]],{color:'#cbd5e1',weight:.65,opacity:.32,dashArray:'2 5'}).addTo(layers);
        for(let lat=-90;lat<=90;lat+=10)L.polyline([[lat,-180],[lat,180]],{color:'#cbd5e1',weight:.65,opacity:.32,dashArray:'2 5'}).addTo(layers);
      }
      const esc=(v:string)=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
       visibleLiveContacts.forEach(contact => {
         const first = contactPoint(contact, contact.callsign);
         const second = contactPoint(contact, contact.station_callsign);
         if (!first || !second) return;
         const age = Math.max(0, Date.now() - new Date(contact.created_at).getTime());
         const fadeStart = 30 * 60 * 1000;
         const fadeDuration = 30 * 60 * 1000;
         const opacity = age <= fadeStart ? 0.95 : Math.max(0, 0.95 * (1 - (age - fadeStart) / fadeDuration));
         const firstApprox = !maidenheadToLatLon(liveGridLocators[contact.callsign]);
         const secondApprox = !maidenheadToLatLon(liveGridLocators[contact.station_callsign]);
         L.polyline(greatCirclePath(first, second, 64), { color: '#f472b6', weight: 2.8, opacity, lineCap: 'round', dashArray: firstApprox || secondApprox ? '6 5' : undefined })
           .bindTooltip('Contacto registrado · ' + esc(contact.callsign) + ' ↔ ' + esc(contact.station_callsign) + ' · ' + esc(contact.band) + ' · ' + esc(contact.mode))
           .bindPopup('<b>CONTACTO REGISTRADO</b><br>' + esc(contact.callsign) + ' ↔ ' + esc(contact.station_callsign) + '<br>Banda: ' + esc(contact.band) + '<br>Frecuencia: ' + esc(contact.frequency) + ' MHz<br>Modo: ' + esc(contact.mode) + '<br>Fecha UTC: ' + esc(contact.qso_date) + ' ' + esc(contact.qso_time) + ((firstApprox || secondApprox) ? '<br><i>Ubicación aproximada por capital: falta Grid Locator de una o ambas estaciones.</i>' : '<br>Ubicaciones por Grid Locator'))
           .addTo(layers);
         L.circleMarker([first.lat, first.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#f472b6', fillOpacity: opacity, opacity }).bindTooltip(esc(contact.callsign) + (firstApprox ? ' · ubicación aproximada' : '')).addTo(layers);
         L.circleMarker([second.lat, second.lon], { radius: 5, color: '#fff', weight: 1.5, fillColor: '#f472b6', fillOpacity: opacity, opacity }).bindTooltip(esc(contact.station_callsign) + (secondApprox ? ' · ubicación aproximada' : '')).addTo(layers);
       });
      visibleExternalSpots.forEach(spot => {
        const p = { lat: Number(spot.dxLat), lon: Number(spot.dxLon) };
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return;
        const sourceColors: Record<string, string> = { pskreporter: '#38bdf8', cluster: '#fb923c', rbn: '#a78bfa' };
        const sourceLabels: Record<string, string> = { pskreporter: 'PSK Reporter', cluster: 'DX Cluster', rbn: 'Reverse Beacon Network' };
        const primarySource = spot.sources?.includes('cluster') ? 'cluster' : spot.sources?.includes('rbn') ? 'rbn' : 'pskreporter';
        const color = sourceColors[primarySource] || '#38bdf8';
        const ageSeconds = Math.max(0, Date.now() / 1000 - Number(spot.lastSeen || 0));
        const opacity = Math.max(0.28, 1 - ageSeconds / 3600);
        const sourcesText = (spot.sources || []).map(source => sourceLabels[source] || source).join(' + ');
        const popup = '<b>ACTIVIDAD DX · ' + esc(spot.dxCall) + '</b><br>Banda: ' + esc(spot.band) + '<br>Modo: ' + esc(spot.mode) + '<br>Frecuencia: ' + (spot.frequency ? (spot.frequency / 1e6).toFixed(3) + ' MHz' : '—') + '<br>Reporteros: ' + Number(spot.reporterCount || 0) + '<br>Actividad: ' + esc(sourcesText) + '<br>Último reporte: ' + new Date(Number(spot.lastSeen) * 1000).toISOString().slice(11, 16) + ' UTC' + (spot.latestComment ? '<br>Comentario: ' + esc(spot.latestComment) : '');
        L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: opacity, opacity }).bindTooltip(esc(spot.dxCall) + ' · ' + esc(spot.band) + ' · ' + esc(spot.mode)).bindPopup(popup).addTo(layers);
      });
      visibleDxReports.forEach(report=>{const p=maidenheadToLatLon(report.receiverLocator);if(!p)return;
        if(showDxPaths&&ownGeo)L.polyline(greatCirclePath(ownGeo,p),{color:'#38bdf8',weight:2,opacity:.72,dashArray:'5 5'}).bindTooltip('Ruta de recepción · círculo máximo').addTo(layers);
        L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:2,fillColor:'#06b6d4',fillOpacity:1}).bindPopup('<b>DX reportado · PSK Reporter</b><br>TX: '+esc(report.senderCallsign)+'<br>Receptor: '+esc(report.receiverCallsign)+'<br>Locator: '+esc(report.receiverLocator||'')+'<br>Frecuencia: '+(report.frequency?(report.frequency/1e6).toFixed(3)+' MHz':'—')+'<br>UTC: '+(report.flowStartSeconds?new Date(report.flowStartSeconds*1000).toISOString().slice(11,16):'—')).addTo(layers);});
      const reg=mapRegions.find(x=>x.name===ownContinent);
      if(mapZone==='world')map.setView([15,0],2);else if(ownGeo&&mapZone==='zone')map.setView([ownGeo.lat,ownGeo.lon],5);else if(ownGeo&&mapZone==='continent'&&reg)map.fitBounds([[reg.bounds.south,reg.bounds.west],[reg.bounds.north,reg.bounds.east]]);else if(ownGeo)map.setView([ownGeo.lat,ownGeo.lon],4);
      window.setTimeout(()=>map.invalidateSize(),100);
    };
    load().catch(e=>setMapStatus(e instanceof Error?e.message:'Mapa no disponible.'));
    return()=>{cancelled=true;if(mapInstanceRef.current){mapInstanceRef.current.remove();mapInstanceRef.current=null;mapLayersRef.current=null;}};
  },[open,mapZone,dxReports,visibleDxReports.length,externalSpots,visibleExternalSpots.length,liveQsoContacts,liveGridLocators,visibleLiveContacts.length,liveMapClock,stationIdentity.grid,ownContinent,sfi,kp,showGreyLine,showMaidenheadGrid,showDxPaths,selectedMapBand,selectedMapMode]);

  const summary = kp === null || sfi === null
    ? 'Esperando datos solares actualizados.'
    : kp >= 5
      ? 'Perturbación geomagnética elevada: las bandas altas pueden sufrir desvanecimientos.'
      : sfi >= 120 && kp < 4
        ? 'Buen nivel de flujo solar y campo geomagnético tranquilo: las bandas altas pueden abrirse con mayor facilidad.'
        : sfi >= 90 && kp < 4
          ? 'Condiciones solares moderadas y campo geomagnético tranquilo.'
          : 'Flujo solar bajo o moderado: las bandas bajas suelen ser más útiles, según la hora local.';

  const zoneAssessment = (zone: Zone) => {
    if (sfi === null || kp === null) return 'Sin datos';
    const utcHour = new Date().getUTCHours();
    const localHour = (utcHour + zone.utcOffset + 24) % 24;
    const daylight = localHour >= 7 && localHour < 19;
    if (kp >= 5) return daylight ? 'Bandas altas variables; revisar desvanecimientos' : 'Bandas bajas más estables; posible ruido';
    if (daylight && sfi >= 100) return 'Mejor oportunidad en bandas altas (14–28 MHz)';
    if (daylight) return 'Probar 14 MHz; comparar con 7 MHz';
    if (sfi >= 100) return 'Probar 7–14 MHz según apertura';
    return 'Priorizar 3,5–7 MHz; comprobar ruido local';
  };

  return (
    <section lang={uiLanguage} className="relative mx-auto my-4 w-full max-w-6xl overflow-hidden rounded-[26px] border border-slate-700/70 bg-gradient-to-br from-[#071326] via-[#0b1b34] to-[#171536] text-white shadow-[0_24px_80px_rgba(2,8,23,0.48)]">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="flex min-h-[82px] w-full min-w-0 items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#12365c] via-[#132b4d] to-[#30204e] px-4 py-4 text-left transition hover:brightness-110 sm:px-6">
        <span className="flex min-w-0 flex-col gap-1"><span className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">LogBook eQSL EXPRESS · DX CENTER</span><span className="break-words text-lg font-black tracking-tight sm:text-2xl">CENTRO MUNDIAL DE PROPAGACIÓN</span><span className="text-xs font-medium text-slate-300">Actividad solar · recepción DX · panorama global</span></span>
        <ChevronDown className={'h-5 w-5 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {showGuestInvitation && <aside className="mx-3 mt-3 rounded-2xl border border-cyan-300/30 bg-gradient-to-r from-cyan-950/90 via-blue-950/90 to-indigo-950/90 p-4 shadow-lg sm:mx-5">
        <p className="text-sm font-black text-cyan-100">{guestInvitation.title}</p>
        <p className="mt-2 text-sm leading-relaxed text-slate-100">{guestInvitation.body}</p>
        <p className="mt-2 text-sm font-bold text-cyan-200">{guestInvitation.closing}</p>
      </aside>}
      {open && <div className="relative min-w-0 space-y-5 bg-[radial-gradient(ellipse_at_10%_0%,rgba(14,165,233,0.12),transparent_38%),radial-gradient(ellipse_at_90%_15%,rgba(168,85,247,0.12),transparent_34%)] p-3 sm:p-5 lg:p-6">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-[#12365d] via-[#102747] to-[#28204e] p-4 shadow-xl sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">MI ESTACIÓN · IDENTIDAD ACTIVA</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span role="img" aria-label="Bandera del país de la estación" className="text-4xl leading-none drop-shadow-lg sm:text-5xl">{stationIdentity.flag}</span>
                <strong data-no-translate="true" translate="no" className="break-all font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">{stationIdentity.selectedCallsign || 'Indicativo no disponible'}</strong>
              </div>
              <span className="mt-2 block text-xs font-medium text-blue-100/80">
                {stationIdentity.selectedType === '11m' ? 'Modalidad: 11 metros' : 'Modalidad: radioafición'}
                {stationIdentity.grid ? ' · Grid Locator: ' + stationIdentity.grid : ' · Grid Locator pendiente'}
              </span>
            </div>
            {stationIdentity.hasHam && stationIdentity.has11m && (
              <div className="flex flex-wrap gap-1.5" aria-label="Seleccionar identidad de estación">
                <button type="button" onClick={() => chooseIdentity('11m')} aria-pressed={selectedIdentity === '11m'} className={'rounded-lg border px-3 py-2 text-xs font-bold ' + (selectedIdentity === '11m' ? 'border-emerald-300 bg-emerald-600 text-white' : 'border-slate-600 bg-slate-800 text-slate-200')}>11 metros</button>
                <button type="button" onClick={() => chooseIdentity('ham')} aria-pressed={selectedIdentity === 'ham'} className={'rounded-lg border px-3 py-2 text-xs font-bold ' + (selectedIdentity === 'ham' ? 'border-sky-300 bg-sky-600 text-white' : 'border-slate-600 bg-slate-800 text-slate-200')}>Radioafición</button>
              </div>
            )}
          </div>
          {!stationIdentity.selectedCallsign && <p className="mt-2 text-xs text-amber-200">No se encontró una identidad verificada para esta modalidad. Revisá la identidad de tu cuenta y la SD vinculada de 11 metros en Ajustes.</p>}
        </section>
        <section className="grid gap-4 xl:grid-cols-2">
          <article className="overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-br from-[#3b260f] via-[#251b20] to-[#111827] shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
              <div><span className="text-[10px] font-black tracking-[.2em] text-amber-200">MONITOREO SOLAR · NASA SDO / NOAA SWPC</span><h3 className="mt-1 text-lg font-black text-white">El Sol y la ionización</h3></div>
              <span className="rounded-full border border-amber-200/30 bg-amber-200/10 px-3 py-1 text-xs font-bold text-amber-100">SFI {solarFluxValue == null ? '—' : Math.round(Number(solarFluxValue))}</span>
            </div>
            <div className="grid gap-2 px-3 sm:grid-cols-[1.15fr_.85fr]">
              <a href="https://sdo.gsfc.nasa.gov/data/" target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-amber-100/20 bg-black">
                <img src="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg" alt="Imagen científica reciente del disco solar en ultravioleta extremo, captada por el observatorio NASA SDO en 171 angstroms" loading="lazy" className="h-56 w-full object-contain bg-black transition duration-500 group-hover:scale-[1.02] sm:h-64"/>
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-[10px] font-bold text-amber-100">NASA SDO · ULTRAVIOLETA EXTREMO · 171 Å</span>
              </a>
              <a href="https://sdo.gsfc.nasa.gov/data/" target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-xl border border-amber-100/20 bg-black">
                <img src="https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0304.jpg" alt="Imagen científica reciente del Sol en ultravioleta extremo, canal NASA SDO 304 angstroms" loading="lazy" className="h-56 w-full object-contain bg-black transition duration-500 group-hover:scale-[1.02] sm:h-64"/>
                <span className="absolute bottom-0 left-0 right-0 bg-black/70 px-3 py-2 text-[10px] font-bold text-amber-100">NASA SDO · ULTRAVIOLETA EXTREMO · 304 Å</span>
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/25 p-3"><span className="text-[10px] text-amber-100/70">FLUJO SFI</span><strong className="mt-1 block text-2xl font-black text-white">{solarFluxValue == null ? '—' : Math.round(Number(solarFluxValue))}</strong><span className="text-[10px] text-amber-100/80">sfu</span></div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3"><span className="text-[10px] text-amber-100/70">ESTADO SOLAR</span><strong className="mt-1 block text-sm font-black text-amber-100">{solarFluxLabel}</strong></div>
              <div className="col-span-2 rounded-xl border border-white/10 bg-black/25 p-3 sm:col-span-1"><span className="text-[10px] text-amber-100/70">IMPACTO EN HF</span><p className="mt-1 text-xs leading-relaxed text-slate-100">Un flujo más alto suele favorecer la ionización y las bandas altas. Una llamarada intensa de rayos X puede provocar apagones HF en la zona diurna.</p></div>
            </div>
            <p className="px-4 pb-4 text-[10px] text-amber-100/60">Imágenes científicas del Sol en ultravioleta extremo, actualizadas por NASA/SDO. No son fotografías en luz visible.</p>
          </article>

          <article className="overflow-hidden rounded-2xl border border-violet-300/25 bg-gradient-to-br from-[#211b45] via-[#151d3a] to-[#0b172d] shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4 pb-3">
              <div><span className="text-[10px] font-black tracking-[.2em] text-violet-200">TIERRA · CAMPO MAGNÉTICO</span><h3 className="mt-1 text-lg font-black text-white">Actividad geomagnética</h3></div>
              <span className="rounded-full border border-violet-200/30 bg-violet-200/10 px-3 py-1 text-xs font-bold text-violet-100">Kp {geomagneticKpValue == null ? '—' : Number(geomagneticKpValue).toFixed(1)}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 px-3 sm:grid-cols-2">
              {([
                { key: 'south' as const, label: 'AURORA AUSTRAL · HEMISFERIO SUR', frames: auroraFrames.south },
                { key: 'north' as const, label: 'AURORA BOREAL · HEMISFERIO NORTE', frames: auroraFrames.north },
              ]).map((pole) => {
                const frame = pole.frames.length ? pole.frames[pole.frames.length - 1] : null;
                return <div key={pole.key} className="relative overflow-hidden rounded-xl border border-violet-100/20 bg-black">
                  {frame ? <img key={frame.url} src={frame.url} alt={pole.label + ' · pronóstico dinámico NOAA OVATION'} loading="lazy" className="h-56 w-full object-contain bg-black sm:h-64"/> : <div className="flex h-56 items-center justify-center text-xs text-violet-100/70">Cargando mapa dinámico NOAA…</div>}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/75 px-2 py-2 text-center text-[10px] font-bold text-violet-100">{pole.label}</div>
                  {frame && <span className="absolute right-2 top-2 rounded bg-black/75 px-2 py-1 text-[9px] text-white">{new Date(frame.time_tag).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC</span>}
                </div>;
              })}
            </div>
            <p className="px-4 pt-2 text-[10px] text-violet-100/70">Mapa estable del modelo OVATION de NOAA. Se consulta cada 5 minutos y solo cambia cuando NOAA publica un fotograma nuevo; es un pronóstico auroral de corto plazo, no una observación visual directa.</p>
            {auroraFrameError && <p className="px-4 pb-2 text-[10px] text-amber-200">{auroraFrameError}</p>}
            <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-black/25 p-3"><span className="text-[10px] text-violet-100/70">ÍNDICE Kp</span><strong className="mt-1 block text-2xl font-black text-white">{geomagneticKpValue == null ? '—' : Number(geomagneticKpValue).toFixed(1)}</strong><span className="text-[10px] text-violet-100/80">escala 0–9</span></div>
              <div className="rounded-xl border border-white/10 bg-black/25 p-3"><span className="text-[10px] text-violet-100/70">ÍNDICE A</span><strong className="mt-1 block text-2xl font-black text-white">{radioConditions?.aIndex ?? '—'}</strong><span className="text-[10px] text-violet-100/80">actividad diaria</span></div>
              <div className="col-span-2 rounded-xl border border-white/10 bg-black/25 p-3 sm:col-span-1"><span className="text-[10px] text-violet-100/70">NIVEL GEOMAGNÉTICO</span><strong className="mt-1 block text-sm font-black text-violet-100">{geomagneticLabel}</strong></div>
            </div>
            <div className="mx-3 mb-3 rounded-xl border border-violet-100/10 bg-black/25 p-3">
              <div className="mb-2 flex items-center justify-between text-[10px] font-bold text-violet-100/70"><span>ESCALA DE TORMENTAS NOAA</span><span>Kp 5 = G1 · Kp 9 = G5</span></div>
              <div className="grid grid-cols-5 gap-1 text-center text-[10px] font-black">{['G1','G2','G3','G4','G5'].map((level,index)=><div key={level} className={'rounded-md py-2 '+(geomagneticKpValue != null && geomagneticKpValue >= index+5 ? 'bg-violet-400/40 text-white' : 'bg-white/5 text-violet-100/50')}>{level}</div>)}</div>
              <p className="mt-2 text-xs leading-relaxed text-slate-100">Cuando Kp aumenta, crece la perturbación del campo magnético: puede degradar la propagación HF, especialmente en latitudes altas, aunque también favorece auroras más extensas.</p>
            </div>
            <p className="px-4 pb-4 text-[10px] text-violet-100/60">Modelo OVATION · NOAA / Space Weather Prediction Center. Las áreas coloreadas representan intensidad prevista de aurora, no fotografías ni observaciones desde tierra.</p>
          </article>
        </section>
        <p className="break-words rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-[#153452] to-[#252044] p-4 text-sm font-medium leading-relaxed text-slate-100 shadow-lg">{summary}</p>

        <section className="space-y-4 rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#102b40] to-[#111d35] p-4 shadow-xl">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><h3 className="text-base font-black text-white sm:text-lg">ACTIVIDAD MUNDIAL DE RADIOAFICIÓN</h3><p className="text-xs text-slate-300">Datos agregados de los últimos 30 minutos · actualización automática</p></div>
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1 text-[10px] font-bold text-emerald-200">FUENTES EN VIVO</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Reportes DX</span><strong className="mt-1 block text-3xl text-white">{radioStats?.totalSpots ?? '—'}</strong></div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Entidades DXCC</span><strong className="mt-1 block text-3xl text-white">{radioStats?.activeEntities ?? '—'}</strong></div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Bandas activas</span><strong className="mt-1 block text-3xl text-white">{radioStats?.byBand ? Object.values(radioStats.byBand).filter(v => Number(v.spots || 0) > 0).length : '—'}</strong></div>
            <div className="rounded-xl border border-white/10 bg-slate-950/50 p-3"><span className="text-[10px] font-bold uppercase text-slate-400">Modos activos</span><strong className="mt-1 block text-3xl text-white">{radioStats?.byMode ? Object.values(radioStats.byMode).filter(v => Number(v.spots || 0) > 0).length : '—'}</strong></div>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <h4 className="mb-3 text-sm font-black text-cyan-100">ACTIVIDAD POR BANDA</h4>
              {radioStats?.byBand && Object.keys(radioStats.byBand).length > 0 ? <div className="space-y-2">{Object.entries(radioStats.byBand).sort((a,b)=>Number(b[1].spots||0)-Number(a[1].spots||0)).map(([band,data])=><div key={band} className="grid grid-cols-[52px_1fr_42px] items-center gap-2 text-xs"><strong className="text-slate-200">{band}</strong><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-cyan-400" style={{width:Math.max(2,Number(data.spots||0)/Math.max(1,...Object.values(radioStats.byBand||{}).map(v=>Number(v.spots||0)))*100)+'%'}}/></div><span className="text-right tabular-nums text-slate-300">{data.spots||0}</span></div>)}</div> : <p className="text-xs text-slate-400">Sin estadísticas de bandas disponibles.</p>}
            </div>
            <div className="rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <h4 className="mb-3 text-sm font-black text-violet-100">ACTIVIDAD POR MODO</h4>
              {radioStats?.byMode && Object.keys(radioStats.byMode).length > 0 ? <div className="space-y-2">{Object.entries(radioStats.byMode).sort((a,b)=>Number(b[1].spots||0)-Number(a[1].spots||0)).map(([mode,data])=><div key={mode} className="grid grid-cols-[72px_1fr_42px] items-center gap-2 text-xs"><strong className="text-slate-200">{mode}</strong><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-violet-400" style={{width:Math.max(2,Number(data.spots||0)/Math.max(1,...Object.values(radioStats.byMode||{}).map(v=>Number(v.spots||0)))*100)+'%'}}/></div><span className="text-right tabular-nums text-slate-300">{data.spots||0}</span></div>)}</div> : <p className="text-xs text-slate-400">Sin estadísticas de modos disponibles.</p>}
            </div>
          </div>
          <div className="rounded-xl border border-amber-300/20 bg-slate-950/40 p-3">
            <h4 className="mb-3 text-sm font-black text-amber-100">CONDICIONES SOLARES Y ESTADO DE LAS BANDAS</h4>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div><span className="block text-[10px] text-slate-400">SFI</span><strong className="text-xl text-white">{radioConditions?.sfi ?? sfi ?? '—'}</strong></div>
              <div><span className="block text-[10px] text-slate-400">Kp</span><strong className="text-xl text-white">{radioConditions?.kp != null ? Number(radioConditions.kp).toFixed(1) : kp != null ? kp.toFixed(1) : '—'}</strong></div>
              <div><span className="block text-[10px] text-slate-400">Índice A</span><strong className="text-xl text-white">{radioConditions?.aIndex ?? '—'}</strong></div>
              <div><span className="block text-[10px] text-slate-400">Actualización</span><strong className="text-xs text-white">{radioConditions?.updatedAt ? new Date(Number(radioConditions.updatedAt)*1000).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC' : '—'}</strong></div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{([{key:'hf_high',label:'10–17 m'},{key:'hf_mid',label:'20–30 m'},{key:'hf_low',label:'40–160 m'},{key:'vhf',label:'6 m'}] as const).map(item=>{const value=radioConditions?.bandConditions?.[item.key]||'—';return <div key={item.key} className="rounded-lg border border-white/10 bg-white/5 p-2"><span className="block text-[10px] text-slate-400">{item.label}</span><strong className={'text-sm '+(value==='Good'?'text-emerald-300':value==='Fair'?'text-amber-200':value==='Poor'?'text-rose-300':'text-slate-300')}>{value==='Good'?'Buenas':value==='Fair'?'Regulares':value==='Poor'?'Pobres':'Sin datos'}</strong></div>})}</div>
          </div>
          <div className="rounded-xl border border-sky-300/20 bg-slate-950/40 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-black text-sky-100">IONOSONDAS · FRECUENCIA MÁXIMA UTILIZABLE (MUF)</h4><span className="text-[10px] text-slate-400">{ionosondeStations.length} estaciones con lectura</span></div>
            {ionosondeStations.length ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">{[...ionosondeStations].sort((a,b)=>Number(b.updated||0)-Number(a.updated||0)).slice(0,9).map((station,index)=><div key={station.name+'-'+index} className="rounded-lg border border-white/10 bg-white/5 p-2"><strong className="block truncate text-xs text-white">{station.name}</strong><span className="text-lg font-black text-sky-200">{Number(station.muf).toFixed(1)} MHz</span><span className="block text-[10px] text-slate-400">Lectura {station.updated ? new Date(Number(station.updated)*1000).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'})+' UTC' : 'sin hora'}</span></div>)}</div> : <p className="mt-2 text-xs text-slate-400">No hay lecturas ionosféricas disponibles en este momento.</p>}
            <p className="mt-2 text-[10px] text-slate-500">Fuente: red mundial de ionosondas prop.kc2g.com, integrada por CQDX. La MUF es una medición ionosférica regional, no garantiza un contacto.</p>
          </div>
          <div className="rounded-xl border border-cyan-300/20 bg-slate-950/50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h4 className="text-sm font-black text-cyan-100">HISTORIAL DE ACTIVIDAD DX</h4><p className="mt-1 text-[11px] text-slate-400">Evolución de reportes recibidos, agrupados por intervalo.</p></div>
              <select aria-label="Período del historial DX" value={radioHistoryPeriod} onChange={event=>{setRadioHistory(null);setSelectedHistoryBucket(null);setRadioHistoryPeriod(event.target.value as '1h'|'6h'|'24h'|'7d');}} className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-xs text-white"><option value="1h">Última hora</option><option value="6h">Últimas 6 horas</option><option value="24h">Últimas 24 horas</option><option value="7d">Últimos 7 días</option></select>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-white/10 bg-white/5 p-2"><span className="block text-[10px] uppercase text-slate-400">Reportes del período</span><strong className="text-xl text-white">{(radioHistory?.data || []).reduce((sum,bucket)=>sum+Number(bucket.spots||0),0).toLocaleString('es-AR')}</strong></div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-2"><span className="block text-[10px] uppercase text-slate-400">Pico por intervalo</span><strong className="text-xl text-white">{Math.max(0,...(radioHistory?.data || []).map(bucket=>Number(bucket.spots||0))).toLocaleString('es-AR')}</strong></div>
              <div className="col-span-2 rounded-lg border border-white/10 bg-white/5 p-2 sm:col-span-1"><span className="block text-[10px] uppercase text-slate-400">Último intervalo vs. anterior</span><strong className="text-sm text-cyan-200">{(radioHistory?.data?.length || 0) >= 2 ? (()=>{const ordered=[...(radioHistory?.data||[])].sort((a,b)=>a.bucket-b.bucket);const delta=Number(ordered[ordered.length-1].spots||0)-Number(ordered[ordered.length-2].spots||0);return delta>0?'↑ +'+delta+' reportes':delta<0?'↓ '+delta+' reportes':'→ Sin variación';})() : 'Sin comparación'}</strong></div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">Filtrar por banda
                <select value={radioHistoryBand} onChange={event=>{setRadioHistory(null);setSelectedHistoryBucket(null);setRadioHistoryBand(event.target.value);}} className="min-h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-xs text-white"><option value="">Todas las bandas</option>{Object.keys(radioStats?.byBand||{}).sort().map(band=><option key={band} value={band}>{band}</option>)}</select>
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-300">Filtrar por modo
                <select value={radioHistoryMode} onChange={event=>{setRadioHistory(null);setSelectedHistoryBucket(null);setRadioHistoryMode(event.target.value);}} className="min-h-9 rounded-lg border border-slate-600 bg-slate-900 px-2 text-xs text-white"><option value="">Todos los modos</option>{Object.keys(radioStats?.byMode||{}).sort().map(mode=><option key={mode} value={mode}>{mode}</option>)}</select>
              </label>
            </div>
            <DXHistoryChart history={radioHistory} band={radioHistoryBand} mode={radioHistoryMode} selectedBucket={selectedHistoryBucket} onSelectBucket={setSelectedHistoryBucket}/> 
            <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Tocá cualquier barra para ver la hora, los reportes y las entidades DXCC de ese intervalo. Los filtros de banda y modo consultan los datos históricos de CQDX. Los reportes DX indican recepción/anuncios de actividad, no confirman por sí solos un QSO.</p>
          </div>
          {radioStats?.rareActive?.length ? <div className="rounded-xl border border-fuchsia-300/20 bg-slate-950/40 p-3"><h4 className="mb-2 text-sm font-black text-fuchsia-100">ENTIDADES DX POCO FRECUENTES ACTIVAS</h4><div className="grid gap-2 sm:grid-cols-2">{radioStats.rareActive.slice(0,8).map(entity=><div key={entity.dxcc} className="rounded-lg border border-white/10 bg-white/5 p-2 text-xs"><strong className="text-white">{entity.entity}</strong><span className="ml-2 text-fuchsia-200">#{entity.rank}</span><span className="mt-1 block text-slate-400">{entity.bands?.join(', ')||'—'} · {entity.modes?.join(', ')||'—'}</span></div>)}</div></div> : null}
        </section>
        <section className="space-y-3 rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#0c263d] to-[#101a34] p-3 shadow-xl sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-black text-white sm:text-lg">MAPA MUNDIAL DX Y PROPAGACIÓN</h3><p className="text-xs text-slate-300">Cartografía real · DX reportados · zonas estimadas</p></div><span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black text-cyan-100">OPENSTREETMAP</span></div>
          <div className="flex flex-wrap gap-2">{([{id:'zone',label:'Mi zona'},{id:'country',label:'Mi país'},{id:'continent',label:'Mi continente'},{id:'world',label:'Todo el mundo'}] as const).map(x=><button key={x.id} type="button" onClick={()=>setMapZone(x.id)} aria-pressed={mapZone===x.id} className={'rounded-lg border px-3 py-2 text-xs font-bold '+(mapZone===x.id?'border-cyan-300 bg-cyan-500 text-slate-950':'border-slate-600 bg-slate-900/70 text-slate-200')}>{x.label}</button>)}</div>
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/10 bg-slate-950/50 p-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-200">Banda
              <select value={selectedMapBand} onChange={event=>setSelectedMapBand(event.target.value)} className="min-h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white"><option value="">Todas las bandas</option>{HAM_BANDS.map(band=><option key={band.name} value={band.name}>{band.name}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-200">Modo
              <select value={selectedMapMode} onChange={event=>setSelectedMapMode(event.target.value)} className="min-h-10 rounded-lg border border-slate-600 bg-slate-900 px-3 text-sm text-white"><option value="">Todos los modos</option>{HAM_MODES.map(mode=><option key={mode} value={mode}>{mode}</option>)}</select>
            </label>
          </div>
          <div className="flex flex-wrap gap-4 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-xs text-slate-200">
            <label className="flex items-center gap-2"><input type="checkbox" checked={showGreyLine} onChange={e=>setShowGreyLine(e.target.checked)} /> Grey Line</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showMaidenheadGrid} onChange={e=>setShowMaidenheadGrid(e.target.checked)} /> Cuadrícula Maidenhead</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={showDxPaths} onChange={e=>setShowDxPaths(e.target.checked)} /> Rutas DX</label>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[11px] font-bold"><span className="text-pink-300">● Contacto válido</span><span className="text-sky-300">● PSK Reporter</span><span className="text-orange-300">● DX Cluster</span><span className="text-violet-300">● RBN</span></div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-300"><span>{externalSpots.length} estaciones con actividad agregada · {externalSpotsUpdated ? 'Actualizado: ' + externalSpotsUpdated : 'Esperando datos'}</span><span className="flex flex-wrap gap-x-2">Fuentes: {['pskreporter','cluster','rbn'].map(source => <span key={source} className={(externalSources[source]?.state === 'receiving' ? 'text-emerald-300' : 'text-slate-400')}>{source === 'pskreporter' ? 'PSK' : source === 'cluster' ? 'Clusters' : 'RBN'} · {externalSources[source]?.state === 'receiving' ? 'en vivo' : externalSources[source]?.state === 'waiting' ? 'esperando' : externalSources[source]?.state === 'silent' ? 'sin actividad' : '—'}</span>)}</span></div>
          <p className="text-[10px] text-slate-400">Datos de actividad: <a href="https://cqdx.io" target="_blank" rel="noreferrer" className="underline decoration-slate-500 underline-offset-2">CQDX (cqdx.io)</a> · actualizado según la última consulta.</p>
          <div ref={mapElementRef} className="z-0 h-[420px] w-full overflow-hidden rounded-xl border border-slate-600 bg-slate-900 sm:h-[520px]" role="application" aria-label="Mapa interactivo mundial de propagación y reportes DX"/>
          <p role="status" className="text-xs leading-relaxed text-slate-300">{mapStatus}</p>
          {!ownGeo&&<p className="text-xs text-amber-200">Completá tu Grid Locator en el perfil para centrar Mi zona, Mi país y Mi continente.</p>}
        </section>
        <section className="space-y-4 overflow-hidden rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#0d2538] to-[#0b1b31] p-4 shadow-xl sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-black tracking-tight text-white sm:text-lg">DX MUNDIAL · RECEPCIÓN DE MI ESTACIÓN</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">Informes reales de recepción digital asociados al indicativo, desde estaciones receptoras de cualquier región.</p>
            </div>
            <button type="button" onClick={() => void refreshDx()} disabled={dxLoading || stationIdentity.selectedType !== 'ham'} className="rounded-lg border border-emerald-500/60 px-3 py-2 text-xs font-semibold disabled:opacity-50">{dxLoading ? 'Consultando…' : 'Actualizar DX'}</button>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 font-black tracking-wider text-emerald-200">● REAL · PSK REPORTER</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-slate-300">ÚLTIMAS 6 HORAS</span>
            {dxUpdated && <span className="rounded bg-slate-800 px-2 py-1">Consulta: {dxUpdated}</span>}
          </div>
          {dxReports.length > 0 && <div className="max-h-80 overflow-auto rounded-xl border border-white/10 shadow-lg">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead className="sticky top-0 bg-gradient-to-r from-[#183754] to-[#20274a] text-cyan-100"><tr><th className="p-2">Estación TX</th><th className="p-2">Receptor</th><th className="p-2">Frecuencia</th><th className="p-2">Locator receptor</th><th className="p-2">UTC</th></tr></thead>
              <tbody>{dxReports.map((report, index) => <tr key={report.flowStartSeconds + '-' + report.receiverCallsign + '-' + index} className="border-t border-slate-800">
                <td className="p-2 font-mono">{report.senderCallsign || '—'}</td>
                <td className="p-2 font-mono">{report.receiverCallsign || '—'}</td>
                <td className="p-2">{report.frequency ? (report.frequency / 1000000).toFixed(3) + ' MHz' : '—'}</td>
                <td className="p-2">{report.receiverLocator || '—'}</td>
                <td className="p-2">{report.flowStartSeconds ? new Date(report.flowStartSeconds * 1000).toISOString().slice(11, 16) : '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {stationIdentity.selectedType === '11m' && <a href="https://log11dx.com/" target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-sky-500/50 px-3 py-2 text-xs font-semibold text-sky-200">Abrir cluster mundial de 11 metros (LOG11DX)</a>}
        </section>
        <h3 className="text-base font-black uppercase tracking-wider text-white">PANORAMA POR REGIONES DEL MUNDO</h3>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map(zone => <div key={zone.name} className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-white/10 bg-gradient-to-br from-violet-400/10 to-sky-400/5 p-3 transition hover:border-violet-200/30 hover:from-violet-400/15 sm:items-start">
            <strong className="break-words text-sm font-bold text-white">{zone.name}</strong>
            <span className="min-w-0 break-words text-xs leading-relaxed text-slate-300">{zoneAssessment(zone)}</span>
          </div>)}
        </div>
        {error && <p role="status" className="break-words text-sm text-amber-200">{error}</p>}
        {updated && <p className="break-words text-xs text-slate-400">Actualizado: {updated} · Fuente: NOAA, Centro de Predicción del Clima Espacial.</p>}
        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <div className="relative">
            <button type="button" onClick={() => setShowShareOptions(value => { if (!value) setShareLanguage('auto'); return !value; })} aria-expanded={showShareOptions} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black uppercase tracking-wider text-white shadow-lg transition hover:bg-emerald-500"><Share2 className="h-4 w-4" /> Compartir propagación</button>
            {showShareOptions && <div className="mt-2 flex flex-col gap-3 rounded-xl border border-cyan-200/20 bg-slate-950/95 p-3 shadow-xl" role="group" aria-label="Elegir idioma y aplicación para compartir">
              <ShareLanguageSelector value={shareLanguage as 'auto' | AppLanguage} onChange={chooseShareLanguage} label="Idioma del mensaje" />
              <p className="text-[11px] leading-relaxed text-slate-400">La selección solo se aplica a este envío. Cada vez que abras Compartir volverá a Automático. WhatsApp y Telegram se abrirán para que selecciones el contacto.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => sharePropagation('whatsapp')} className="rounded-lg bg-green-600 px-4 py-3 text-sm font-bold text-white hover:bg-green-500">WhatsApp</button>
                <button type="button" onClick={() => sharePropagation('telegram')} className="rounded-lg bg-sky-600 px-4 py-3 text-sm font-bold text-white hover:bg-sky-500">Telegram</button>
                <button type="button" onClick={() => sharePropagation('email')} className="rounded-lg bg-slate-700 px-4 py-3 text-sm font-bold text-white hover:bg-slate-600">Correo electrónico</button>
              </div>
            </div>}
          </div>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex max-w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:opacity-60">
            <RefreshCw className={'h-4 w-4 shrink-0 ' + (loading ? 'animate-spin' : '')} />{loading ? 'Actualizando…' : 'Actualizar datos'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10">Cerrar</button>
        </div>
      </div>}
    </section>
  );
};
