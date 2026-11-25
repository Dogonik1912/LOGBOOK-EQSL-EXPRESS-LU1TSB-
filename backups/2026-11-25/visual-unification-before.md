# Respaldo previo a unificación visual — 2026-11-25

Commit base: 584550d60fcb341d0465b10e7295ff739e56868b

## src/index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Centrar los títulos de todos los encabezamientos en PC y móvil. */
h1, h2, h3, h4, h5, h6 { text-align: center; }


/* Estilo limitado a los encabezados largos que despliegan secciones principales.
   No alcanza summaries internos, botones de acción, idioma ni compartir app. */
button[aria-expanded][class*="min-h-"] {
  background: #050505 !important;
  background-image: none !important;
  color: #d4af37 !important;
  border-color: #b8860b !important;
  text-transform: uppercase !important;
  font-weight: 800 !important;
}
button[aria-expanded][class*="min-h-"] * { color: #d4af37 !important; }
button[aria-expanded][class*="min-h-"]:hover {
  background: #111111 !important;
  background-image: none !important;
}
button[aria-expanded][class*="min-h-"]:focus-visible {
  outline: 2px solid #d4af37;
  outline-offset: 2px;
}

/* Cierre de paneles: conserva el aspecto negro y dorado de la interfaz interior. */
.lb-disclosure-close {
  min-height: 2.5rem;
  padding: 0.55rem 1.1rem;
  border: 1px solid #b8860b;
  border-radius: 0.65rem;
  background: #050505;
  color: #d4af37;
  font-size: 0.75rem;
  font-weight: 800;
  text-transform: uppercase;
  transition: background-color 160ms ease;
}
.lb-disclosure-close:hover { background: #171717; }


```

## src/components/PatentGenerator.tsx

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Download, Share2, X } from 'lucide-react';
import { countryForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { getInitialAppLanguage, type AppLanguage } from '../services/appLanguage';
import { ShareLanguageSelector } from './ShareLanguageSelector';

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

const patentShareMessages: Record<AppLanguage, string> = {
 es:'Te comparto esta patente de radio. Pulsa el enlace para verla y descargarla:\n',
 en:'I am sharing this radio station plate with you. Open the link to view and download it:\n',
 pt:'Partilho consigo esta patente de rádio. Abra o link para ver e descarregar:\n',
 'pt-br':'Estou compartilhando esta patente de rádio com você. Abra o link para visualizar e baixar:\n',
 fr:'Je vous partage cette plaque de radio. Ouvrez le lien pour la voir et la télécharger :\n',
 de:'Ich teile dieses Funkstationskennzeichen mit Ihnen. Öffnen Sie den Link, um es anzusehen und herunterzuladen:\n',
 it:'Ti condivido questa targa radio. Apri il link per visualizzarla e scaricarla:\n',
 nl:'Ik deel deze radioplaat met je. Open de link om deze te bekijken en te downloaden:\n',
 pl:'Udostępniam Ci tę tablicę radiową. Otwórz link, aby ją wyświetlić i pobrać:\n',
 ru:'Делюсь с вами этой радиостанционной табличкой. Откройте ссылку, чтобы посмотреть и скачать её:\n',
 uk:'Ділюся з вами цією радіотабличкою. Відкрийте посилання, щоб переглянути та завантажити її:\n',
 zh:'与您分享这张无线电台标牌。打开链接即可查看和下载：\n',
 ja:'この無線局プレートを共有します。リンクを開いて表示・ダウンロードしてください：\n',
 ko:'이 무선국 명판을 공유합니다. 링크를 열어 확인하고 다운로드하세요:\n',
 ar:'أشاركك لوحة محطة الراديو هذه. افتح الرابط لعرضها وتنزيلها:\n',
 hi:'मैं आपके साथ यह रेडियो स्टेशन प्लेट साझा कर रहा हूँ। इसे देखने और डाउनलोड करने के लिए लिंक खोलें:\n',
 tr:'Bu telsiz istasyonu plakasını sizinle paylaşıyorum. Görüntülemek ve indirmek için bağlantıyı açın:\n',
 sv:'Jag delar denna radioskylt med dig. Öppna länken för att visa och ladda ner den:\n',
 no:'Jeg deler dette radioskiltet med deg. Åpne lenken for å se og laste det ned:\n',
 da:'Jeg deler denne radioplade med dig. Åbn linket for at se og downloade den:\n',
 fi:'Jaan tämän radioaseman kilven kanssasi. Avaa linkki nähdäksesi ja ladataksesi sen:\n',
 cs:'Sdílím s vámi tuto tabulku radiostanice. Otevřete odkaz pro zobrazení a stažení:\n',
 el:'Μοιράζομαι μαζί σας αυτή την πινακίδα ραδιοσταθμού. Ανοίξτε τον σύνδεσμο για προβολή και λήψη:\n',
 ro:'Îți trimit această plăcuță de radio. Deschide linkul pentru a o vedea și descărca:\n',
 hu:'Megosztom Önnel ezt a rádiós táblát. Nyissa meg a linket a megtekintéshez és letöltéshez:\n',
 id:'Saya membagikan pelat stasiun radio ini kepada Anda. Buka tautan untuk melihat dan mengunduhnya:\n',
 th:'ฉันแชร์ป้ายสถานีวิทยุนี้ให้คุณ เปิดลิงก์เพื่อดูและดาวน์โหลด:\n',
};
const patentLanguageNames: Record<AppLanguage,string> = {
 es:'Español',en:'English',pt:'Português', 'pt-br':'Português (Brasil)',fr:'Français',de:'Deutsch',it:'Italiano',nl:'Nederlands',pl:'Polski',ru:'Русский',uk:'Українська',zh:'中文',ja:'日本語',ko:'한국어',ar:'العربية',hi:'हिन्दी',tr:'Türkçe',sv:'Svenska',no:'Norsk',da:'Dansk',fi:'Suomi',cs:'Čeština',el:'Ελληνικά',ro:'Română',hu:'Magyar',id:'Bahasa Indonesia',th:'ไทย'
};
const buildPatentShareText=(language:AppLanguage,patentUrl:string)=>{
 const after={
  es:'\n\nDespués de descargarla, podés instalar LogBook eQSL EXPRESS y validar tu SD para acceder a todas las funciones.',
  en:'\n\nAfter downloading it, you can install LogBook eQSL EXPRESS and verify your callsign to access all features.',
  pt:'\n\nDepois de a descarregar, pode instalar o LogBook eQSL EXPRESS e validar o seu indicativo para aceder a todas as funcionalidades.',
  'pt-br':'\n\nDepois de baixar, você pode instalar o LogBook eQSL EXPRESS e validar sua SD para acessar todos os recursos.',
  fr:'\n\nAprès le téléchargement, vous pouvez installer LogBook eQSL EXPRESS et valider votre indicatif pour accéder à toutes les fonctionnalités.',
  de:'\n\nNach dem Download können Sie LogBook eQSL EXPRESS installieren und Ihr Rufzeichen verifizieren, um alle Funktionen zu nutzen.',
  it:'\n\nDopo averla scaricata, puoi installare LogBook eQSL EXPRESS e verificare il tuo nominativo per accedere a tutte le funzioni.',
  nl:'\n\nNa het downloaden kun je LogBook eQSL EXPRESS installeren en je roepnaam verifiëren om alle functies te gebruiken.',
  pl:'\n\nPo pobraniu możesz zainstalować LogBook eQSL EXPRESS i zweryfikować swój znak wywoławczy, aby uzyskać dostęp do wszystkich funkcji.',
  ru:'\n\nПосле загрузки вы можете установить LogBook eQSL EXPRESS и подтвердить свой позывной, чтобы получить доступ ко всем функциям.',
  uk:'\n\nПісля завантаження ви можете встановити LogBook eQSL EXPRESS і підтвердити свій позивний, щоб отримати доступ до всіх функцій.',
  zh:'\n\n下载后，您可以安装 LogBook eQSL EXPRESS 并验证您的呼号，以使用所有功能。',
  ja:'\n\nダウンロード後、LogBook eQSL EXPRESSをインストールし、コールサインを認証するとすべての機能を利用できます。',
  ko:'\n\n다운로드 후 LogBook eQSL EXPRESS를 설치하고 호출부호를 인증하면 모든 기능을 사용할 수 있습니다.',
  ar:'\n\nبعد التنزيل، يمكنك تثبيت LogBook eQSL EXPRESS والتحقق من نداء المحطة للوصول إلى جميع الميزات.',
  hi:'\n\nडाउनलोड करने के बाद, सभी सुविधाओं का उपयोग करने के लिए LogBook eQSL EXPRESS इंस्टॉल करें और अपना कॉलसाइन सत्यापित करें।',
  tr:'\n\nİndirdikten sonra LogBook eQSL EXPRESS uygulamasını yükleyebilir ve tüm özelliklere erişmek için çağrı işaretinizi doğrulayabilirsiniz.',
  sv:'\n\nEfter nedladdningen kan du installera LogBook eQSL EXPRESS och verifiera din anropssignal för att få tillgång till alla funktioner.',
  no:'\n\nEtter nedlasting kan du installere LogBook eQSL EXPRESS og bekrefte kallesignalet ditt for å få tilgang til alle funksjoner.',
  da:'\n\nEfter download kan du installere LogBook eQSL EXPRESS og bekræfte dit kaldesignal for at få adgang til alle funktioner.',
  fi:'\n\nLataamisen jälkeen voit asentaa LogBook eQSL EXPRESSin ja vahvistaa kutsumerkkisi käyttääksesi kaikkia toimintoja.',
  cs:'\n\nPo stažení můžete nainstalovat LogBook eQSL EXPRESS a ověřit svou volací značku, abyste získali přístup ke všem funkcím.',
  el:'\n\nΜετά τη λήψη, μπορείτε να εγκαταστήσετε το LogBook eQSL EXPRESS και να επαληθεύσετε το διακριτικό κλήσης σας για πρόσβαση σε όλες τις λειτουργίες.',
  ro:'\n\nDupă descărcare, poți instala LogBook eQSL EXPRESS și îți poți valida indicativul pentru a accesa toate funcțiile.',
  hu:'\n\nA letöltés után telepítheti a LogBook eQSL EXPRESS alkalmazást, és ellenőrizheti hívójelét az összes funkció eléréséhez.',
  id:'\n\nSetelah mengunduh, Anda dapat memasang LogBook eQSL EXPRESS dan memverifikasi tanda panggil untuk mengakses semua fitur.',
  th:'\n\nหลังจากดาวน์โหลดแล้ว คุณสามารถติดตั้ง LogBook eQSL EXPRESS และยืนยันเครื่องหมายเรียกขานเพื่อใช้งานฟีเจอร์ทั้งหมดได้',
 };
 return patentShareMessages[language]+patentUrl+(after[language]||after.en);
};

const W=1800, H=1200;
const APP_URL='https://logbook-eqsl-express-lu-1-tsb.vercel.app/';
const GENERATOR_URL=APP_URL+'?generador=patentes';

// Marca de agua fija, discreta y no editable; se aplica a todos los formatos.
const drawPatentWatermark=(ctx:CanvasRenderingContext2D,width:number,height:number,lightBackground=false)=>{
 ctx.save();
 ctx.textAlign='right';
 ctx.textBaseline='bottom';
 ctx.font='600 27px system-ui,sans-serif';
 ctx.fillStyle=lightBackground?'rgba(20,45,75,.48)':'rgba(255,255,255,.62)';
 ctx.shadowColor=lightBackground?'rgba(255,255,255,.45)':'rgba(0,0,0,.35)';
 ctx.shadowBlur=3;
 ctx.fillText('LogBook eQSL EXPRESS',width-72,height-58);
 ctx.restore();
};

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
   if(code==='IC') { x.fillStyle='#087b43'; for(let i=0;i<7;i++){const a=-Math.PI/2+i*Math.PI*2/7;x.beginPath();x.arc(900+Math.cos(a)*52,460+Math.sin(a)*52,9,0,Math.PI*2);x.fill();} } else { x.fillStyle='#fff'; x.fillRect(715,350,123,220); x.fillStyle='#0066a1'; x.fillRect(838,350,123,220); x.fillStyle='#f6d331'; x.fillRect(961,350,124,220); try{const crest=await loadCanvasImage('https://www.gobiernodecanarias.org/cmsgob2/export/sites/administracionespublicas/modernizacion/img/escudo_canarias.jpg');x.drawImage(crest,820,365,160,190);}catch{ /* La patente sigue siendo exportable aunque el servidor del escudo no permita cargarlo. */ } }
 } else {
   x.font='220px system-ui, Apple Color Emoji, Segoe UI Emoji'; x.textBaseline='middle'; x.fillText(countries.find(v=>v[0]===code)?.[1].split(' ')[0]||'🌐',W/2,460);
 }
 x.textBaseline='alphabetic'; x.fillStyle='#d5b46b'; x.font='700 48px system-ui'; x.fillText(code.startsWith('IC')?'CANARIAS':(countries.find(v=>v[0]===code)?.[1].replace(/^\S+ /,'').toUpperCase()||''),W/2,650);
 x.fillStyle='#fff'; x.font='900 190px system-ui'; x.fillText(call,W/2,875);
 x.fillStyle='#b9d7f2'; x.font='600 42px system-ui'; x.fillText('LOGBOOK eQSL EXPRESS',W/2,1015);
 x.fillStyle='#f4d58d'; x.font='500 28px system-ui'; x.fillText('AMATEUR RADIO • DX • FRIENDSHIP',W/2,1080);
 drawPatentWatermark(x,W,H,false);
 return c;
}

async function loadCanvasImage(url:string):Promise<ImageBitmap>{
 // Convertir toda imagen remota a ImageBitmap desde un Blob obtenido con CORS.
 // Nunca se dibuja un elemento IMG remoto en el canvas: así evitamos canvas tainted.
 const response=await fetch(url,{mode:'cors',credentials:'omit',cache:'force-cache'});
 if(!response.ok) throw new Error('No se pudo descargar un recurso gráfico de la patente (HTTP '+response.status+').');
 const blob=await response.blob();
 if(!blob.type.startsWith('image/')) throw new Error('El recurso gráfico recibido no es una imagen válida.');
 const bitmap=await createImageBitmap(blob);
 if(!bitmap.width||!bitmap.height){bitmap.close();throw new Error('La imagen oficial recibida está vacía o no es válida.');}
 return bitmap;
}
const commonsCountryNames:Record<string,string>={
 AR:'Argentina',BR:'Brazil',PT:'Portugal',ES:'Spain',US:'United States',GB:'United Kingdom',FR:'France',DE:'Germany',IT:'Italy',NL:'Netherlands',PL:'Poland',RU:'Russia',UA:'Ukraine',CN:'China',JP:'Japan',KR:'South Korea',IN:'India',TR:'Turkey',SE:'Sweden',NO:'Norway',DK:'Denmark',FI:'Finland',CZ:'Czech Republic',GR:'Greece',RO:'Romania',HU:'Hungary',CA:'Canada',AU:'Australia',NZ:'New Zealand',CL:'Chile',UY:'Uruguay',PE:'Peru',BO:'Bolivia',PY:'Paraguay',CO:'Colombia',VE:'Venezuela',EC:'Ecuador',GT:'Guatemala',CR:'Costa Rica',HN:'Honduras',SV:'El Salvador',NI:'Nicaragua',MX:'Mexico',ZA:'South Africa',IS:'Iceland',IE:'Ireland',CH:'Switzerland',AT:'Austria',BE:'Belgium',BG:'Bulgaria',HR:'Croatia',SI:'Slovenia',SK:'Slovakia',LT:'Lithuania',LV:'Latvia',EE:'Estonia',BY:'Belarus',IL:'Israel',TH:'Thailand',ID:'Indonesia',PH:'Philippines',SG:'Singapore',MY:'Malaysia',HK:'Hong Kong',TW:'Taiwan',PK:'Pakistan',BD:'Bangladesh',LK:'Sri Lanka',EG:'Egypt',MA:'Morocco',TN:'Tunisia',KE:'Kenya',NG:'Nigeria',GH:'Ghana'
};
async function officialNationalEmblem(code:string):Promise<ImageBitmap|null>{
 const country=commonsCountryNames[code];
 if(!country)return null;
 // Priorizar originales vectoriales de Commons y títulos que identifiquen inequívocamente
 // el escudo/emblema del país. Nunca usar banderas, mapas ni insignias genéricas.
 const terms=['"coat of arms" "'+country+'"','"national emblem" "'+country+'"','"arms of" "'+country+'"'];
 const normalized=country.toLowerCase().replace(/[^a-z]/g,'');
 const scoreTitle=(title:string,mime:string)=>{
  const t=title.toLowerCase(),compact=t.replace(/[^a-z]/g,'');
  if(!compact.includes(normalized))return -1;
  if(!/(coat.?of.?arms|national.?emblem|arms.?of)/i.test(t))return -1;
  if(/(flag|map|logo|roundel|seal of the army|president)/i.test(t))return -1;
  return (mime==='image/svg+xml'?100:0)+(/coat.?of.?arms/i.test(t)?40:0)+(/national.?emblem/i.test(t)?35:0)+(/arms.?of/i.test(t)?20:0);
 };
 for(const term of terms){
  try{
   const api='https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrlimit=30&gsrsearch='+encodeURIComponent(term)+'&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=1600&format=json&origin=*';
   const response=await fetch(api,{headers:{Accept:'application/json'}});
   if(!response.ok)continue;
   const data=await response.json();
   const pages=Object.values(data?.query?.pages||{}) as Array<{title?:string,imageinfo?:Array<{url?:string,thumburl?:string,mime?:string,width?:number,height?:number}>}>;
   const candidates=pages.map(page=>({page,info:page.imageinfo?.[0],score:scoreTitle(page.title||'',page.imageinfo?.[0]?.mime||'')}))
    .filter(v=>v.score>=20&&!!(v.info?.url||v.info?.thumburl))
    .sort((a,b)=>b.score-a.score);
   const selected=candidates[0];
   const imageUrl=selected?.info?.mime==='image/svg+xml'?(selected.info.url||selected.info.thumburl):(selected?.info?.thumburl||selected?.info?.url);
   if(imageUrl)return await loadCanvasImage(imageUrl);
  }catch{/* Continuar con la siguiente búsqueda; no crear un escudo sustituto. */}
 }
 return null;
}
async function narrowPlate(call:string,code:string,customText:string){
 const W=2400,H=900,c=document.createElement('canvas');c.width=W;c.height=H;
 const x=c.getContext('2d');if(!x)throw new Error('No se pudo crear la imagen.');
 const country=(code==='IC'||code==='IC-ESCUDO')?'CANARIAS':(countries.find(v=>v[0]===code)?.[1].replace(/^\\S+\\s+/,'').toUpperCase()||code);
 const flagCode=code.toLowerCase();
 let flag:ImageBitmap|null=null;
 if(!code.startsWith('IC')){
  try{flag=await loadCanvasImage('https://flagcdn.com/w1600/'+flagCode+'.png');}
  catch{flag=null;}
 }
 let emblem:ImageBitmap|null=null;
 try{
  emblem=(code==='IC'||code==='IC-ESCUDO')
   ? await loadCanvasImage('https://www.gobiernodecanarias.org/cmsgob2/export/sites/administracionespublicas/modernizacion/img/escudo_canarias.jpg')
   : await officialNationalEmblem(code);
 }catch{
  // Un escudo externo inaccesible no debe impedir generar ni exportar la patente.
  emblem=null;
 }
 const t=(customText.trim().slice(0,42)||'LOGBOOK eQSL EXPRESS').toUpperCase();
 const text=(value:string,px:number,py:number,size:number,color:string,weight=900,align:CanvasTextAlign='center')=>{
  x.textAlign=align;x.textBaseline='middle';x.font=weight+' '+size+'px system-ui,sans-serif';x.fillStyle=color;x.fillText(value,px,py);
 };
 const fit=(img:ImageBitmap,maxW:number,maxH:number)=>{const s=Math.min(maxW/img.width,maxH/img.height);return {w:img.width*s,h:img.height*s};};
 x.clearRect(0,0,W,H);
 x.save();x.beginPath();x.roundRect(24,24,W-48,H-48,48);x.clip();
 // La bandera auténtica del país ocupa TODO el fondo horizontal: no se usan
 // colores ni diseños de matrículas automovilísticas.
 if(flag){
  const scale=Math.max((W-48)/flag.width,(H-48)/flag.height);
  const fw=flag.width*scale,fh=flag.height*scale;
  x.drawImage(flag,(W-fw)/2,(H-fh)/2,fw,fh);
 }else if(code.startsWith('IC')){
  // Bandera de Canarias para la opción territorial: blanco, azul y amarillo.
  x.fillStyle='#ffffff';x.fillRect(24,24,(W-48)/3,H-48);
  x.fillStyle='#0071bc';x.fillRect(24+(W-48)/3,24,(W-48)/3,H-48);
  x.fillStyle='#f6d331';x.fillRect(24+2*(W-48)/3,24,(W-48)/3,H-48);
  if(code==='IC'){
   x.fillStyle='#087b43';
   for(let i=0;i<7;i++){const a=-Math.PI/2+i*Math.PI*2/7;x.beginPath();x.arc(W/2+Math.cos(a)*155,H/2+Math.sin(a)*155,18,0,Math.PI*2);x.fill();}
  }
 }else{
  // Respaldo local si el CDN de banderas no responde: no interrumpe la generación.
  x.fillStyle='#18334f';x.fillRect(24,24,W-48,H-48);
  const emoji=countries.find(v=>v[0]===code)?.[1].split(' ')[0]||'🌐';
  text(emoji,W/2,H/2,360,'#ffffff',900);
 }
 // Velo discreto superior para identificar el país sin tapar la bandera.
 const top=x.createLinearGradient(0,24,0,230);top.addColorStop(0,'rgba(0,0,0,.58)');top.addColorStop(1,'rgba(0,0,0,0)');
 x.fillStyle=top;x.fillRect(24,24,W-48,230);
 text(country,105,125,76,'#ffffff',900,'left');
 // Escudo nacional original, si existe y se pudo cargar, arriba a la derecha.
 if(emblem){
  const mx=2145,my=170,mr=118;
  x.save();x.shadowColor='rgba(0,0,0,.62)';x.shadowBlur=26;
  const med=x.createRadialGradient(mx-35,my-45,8,mx,my,mr);
  med.addColorStop(0,'#fffdf2');med.addColorStop(.72,'#f5e5b8');med.addColorStop(1,'#c69b43');
  x.fillStyle=med;x.beginPath();x.arc(mx,my,mr,0,Math.PI*2);x.fill();x.restore();
  x.strokeStyle='#fff3ca';x.lineWidth=9;x.beginPath();x.arc(mx,my,mr-5,0,Math.PI*2);x.stroke();
  const es=fit(emblem,155,175);x.drawImage(emblem,mx-es.w/2,my-es.h/2,es.w,es.h);
 }
 // SD grande, centrada y legible sobre la bandera con contorno de alto contraste.
 let fontSize=300;x.font='900 '+fontSize+'px system-ui,sans-serif';
 while(x.measureText(call).width>2050&&fontSize>125){fontSize-=6;x.font='900 '+fontSize+'px system-ui,sans-serif';}
 x.textAlign='center';x.textBaseline='middle';x.lineJoin='round';x.lineWidth=34;
 x.strokeStyle='rgba(0,0,0,.94)';x.shadowColor='rgba(0,0,0,.72)';x.shadowBlur=25;
 x.strokeText(call,W/2,535);x.shadowBlur=0;
 const letters=x.createLinearGradient(0,535-fontSize/2,0,535+fontSize/2);
 letters.addColorStop(0,'#ffffff');letters.addColorStop(.55,'#fffdf5');letters.addColorStop(1,'#dce7f2');
 x.fillStyle=letters;x.fillText(call,W/2,535);
 // Texto opcional en una banda translúcida: la bandera sigue siendo el fondo visible.
 if(customText.trim()){
  x.fillStyle='rgba(0,0,0,.48)';x.fillRect(70,755,W-140,86);
  text(t,W/2,798,48,'#ffffff',800);
 }
 // Marco premium sin alterar los colores de la bandera.
 x.strokeStyle='rgba(12,20,30,.96)';x.lineWidth=25;x.beginPath();x.roundRect(24,24,W-48,H-48,48);x.stroke();
 x.strokeStyle='rgba(255,255,255,.92)';x.lineWidth=8;x.beginPath();x.roundRect(45,45,W-90,H-90,38);x.stroke();
 for(const px of [105,W-105]){x.fillStyle='#f4f6f8';x.beginPath();x.arc(px,450,18,0,Math.PI*2);x.fill();x.strokeStyle='#536170';x.lineWidth=4;x.stroke();}
 drawPatentWatermark(x,W,H,false);
 x.restore();
 return c;
}

export const PatentGenerator:React.FC=()=>{
 const [open,setOpen]=useState(false),[code,setCode]=useState('AR'),[call,setCall]=useState(''),[preview,setPreview]=useState<string|null>(null),[countryManuallySelected,setCountryManuallySelected]=useState(false),[format,setFormat]=useState('classic'),[customText,setCustomText]=useState(''),[shareLanguage,setShareLanguage]=useState<'auto'|AppLanguage>('auto');
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
 useEffect(()=>{const params=new URLSearchParams(window.location.search);if(params.get('generador')==='patentes')setOpen(true);},[]);
 const generate=async()=>{const v=call.trim().toUpperCase().replace(/[^A-Z0-9/.-]/g,'').slice(0,18);if(!v){alert('Introducí tu indicativo o SD.');return;}setCall(v);try{canvas.current=format==='narrow'?await narrowPlate(v,code,customText):await plate(v,code);setPreview(canvas.current.toDataURL('image/png'));}catch(e){alert(e instanceof Error?e.message:'No se pudo generar la patente.');}};
 const returnHome=()=>{setOpen(false);setPreview(null);window.location.assign(APP_URL);};
 const download=()=>{if(!canvas.current)return;const a=document.createElement('a');a.download='patente-radio-'+call.toLowerCase()+'.png';a.href=canvas.current.toDataURL('image/png');a.click();window.setTimeout(returnHome,900);};
 const share=async()=>{if(!canvas.current){alert('Primero generá la patente.');return;}try{const language=shareLanguage==='auto'?getInitialAppLanguage():shareLanguage;const imageDataUrl=canvas.current.toDataURL('image/png');const response=await fetch('/api/patent-share',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageDataUrl})});const raw=await response.text();let result:any;try{result=JSON.parse(raw);}catch{throw new Error(`El servidor de patentes respondió de forma inesperada (HTTP ${response.status}). Probá nuevamente en unos minutos.`);}if(!response.ok||!result.id)throw new Error(result.error||'No se pudo preparar el enlace de la patente.');const patentUrl=APP_URL+'?patent='+encodeURIComponent(result.id);const shareText=buildPatentShareText(language,patentUrl);window.location.assign('https://wa.me/?text='+encodeURIComponent(shareText));}catch(e){if(e instanceof DOMException&&e.name==='AbortError')return;alert(e instanceof Error?e.message:'No se pudo compartir la patente. Volvé a intentarlo.');}};
 return <section className="w-full px-3 sm:px-6 lg:px-8 pb-5">
  <button type="button" onClick={()=>{setShareLanguage('auto');setOpen(true);}} className="w-full min-h-[56px] rounded-xl border border-sky-300 bg-slate-900 px-4 py-3 text-center font-extrabold tracking-wide text-white shadow-md hover:bg-slate-800"><span className="inline-flex items-center justify-center gap-2"><Award size={20}/> GENERADOR DE PATENTES</span></button>
  {open&&<div className="mt-3 rounded-2xl border border-sky-200 bg-white p-4 shadow-lg">
   <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-extrabold text-slate-900">Generador de patentes de radio</h2><button onClick={()=>{setOpen(false);setPreview(null);}} aria-label="Cerrar"><X/></button></div>
   <label htmlFor="patent-format" className="mb-1 block text-sm font-bold text-slate-700">Formato</label><select id="patent-format" value={format} onChange={e=>setFormat(e.target.value)} className="mb-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900"><option value="classic">Formato actual</option><option value="narrow">Patente angosta horizontal (nueva)</option></select>\n   <label htmlFor="patent-country" className="mb-1 block text-sm font-bold text-slate-700">País o territorio</label>
   <select id="patent-country" value={code} onChange={e=>{setCode(e.target.value);setCountryManuallySelected(true);setShareLanguage('auto');}} className="mb-3 w-full rounded-lg border border-slate-300 bg-white p-3 text-slate-900">{countries.map(v=><option key={v[0]} value={v[0]}>{countryLabel(v)}</option>)}<option value="IC">🏝️ Canarias — tricolor de siete estrellas</option><option value="IC-ESCUDO">🏛️ Canarias — bandera institucional con escudo de los dos perros</option></select>
   {code.startsWith('IC')&&<p className="mb-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-900">{code==='IC'?'Bandera tricolor blanca, celeste y amarilla con siete estrellas verdes.':'Bandera institucional oficial blanca, azul y amarilla con el escudo original del Gobierno de Canarias (dos perros).'}</p>}
   <label htmlFor="patent-callsign" className="mb-1 block text-sm font-bold text-slate-700">Indicativo / SD</label>
   <input id="patent-callsign" value={call} onChange={e=>handleCallChange(e.target.value)} maxLength={18} placeholder="Ej.: LU1TSB o 4RC978" className="mb-3 w-full rounded-lg border border-slate-300 p-3 text-lg font-bold uppercase tracking-wider text-slate-900"/>
   <label htmlFor="patent-custom-text" className="mb-1 block text-sm font-bold text-slate-700">Texto opcional (QAP, frecuencia, localidad, saludos)</label><input id="patent-custom-text" value={customText} onChange={e=>setCustomText(e.target.value)} maxLength={42} placeholder="Ej.: QAP 7.120 · TUCUMAN · 73 SALUDOS" className="mb-3 w-full rounded-lg border border-slate-300 p-4 text-lg font-semibold text-slate-900 placeholder:text-base"/><button onClick={generate} className="w-full rounded-lg bg-sky-700 px-4 py-3 font-bold text-white">GENERAR PATENTE</button>
   {preview&&<div className="mt-4"><img src={preview} alt="Vista previa de la patente de radio" className="w-full rounded-xl border border-slate-200"/><ShareLanguageSelector value={shareLanguage} onChange={setShareLanguage} label="Idioma del mensaje para WhatsApp" dark={false} /><div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2"><button onClick={download} className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-800 px-4 py-3 font-bold text-white"><Download size={18}/> DESCARGAR PNG</button><button onClick={share} className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-bold text-white hover:bg-emerald-500"><Share2 size={18}/> COMPARTIR POR WHATSAPP</button></div><p className="mt-2 text-xs text-slate-500">PNG de 1800 × 1200 píxeles. Al compartir por WhatsApp se crea un enlace directo a esta patente, con opción de verla y descargarla.</p></div>}
   <button onClick={()=>{setOpen(false);setPreview(null);}} className="mt-4 w-full rounded-lg border border-slate-300 bg-slate-100 px-4 py-3 font-bold text-slate-700">CERRAR</button>
  </div>}
 </section>;
};

```

## src/components/PrivateMessages.tsx

```tsx
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, RefreshCw, Send, Inbox, Trash2, ShieldAlert, X } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { parseDistanceShareImage } from '../services/distanceShare';
import { DistanceShareMessage } from './DistanceShareMessage';

type PrivateMessage = {
  id: string;
  sender_callsign: string;
  recipient_callsign: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type AccountIdentity = { callsign: string; identity_type: 'ham' | '11m'; is_primary: boolean };

type PrivateConversation = {
  other_callsign: string;
  last_body: string;
  last_at: string;
  unread_count: number;
};

const getIdentityToken = () => {
  const existing = localStorage.getItem('community_chat_identity_token');
  if (existing) return existing;
  const created = crypto.randomUUID();
  localStorage.setItem('community_chat_identity_token', created);
  return created;
};

const syncWeeklyPrivateConversationReset = () => {
  const now = new Date();
  const daysSinceMonday = (now.getUTCDay() + 6) % 7;
  const scheduled = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - daysSinceMonday,
    0,
    5,
  ));
  if (now.getTime() < scheduled.getTime()) scheduled.setUTCDate(scheduled.getUTCDate() - 7);
  const cycle = scheduled.toISOString().slice(0, 10);
  if (localStorage.getItem('community_chat_cleanup_cycle') === cycle) return;

  // These keys only remember locally hidden conversation entries; message bodies
  // are never persisted in localStorage. Reset the hidden entries each cleanup cycle.
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key?.startsWith('community_private_hidden_')) localStorage.removeItem(key);
  }
  localStorage.setItem('community_chat_cleanup_cycle', cycle);
  localStorage.setItem('community_private_unread_count', '0');
  window.dispatchEvent(new CustomEvent('community-private-unread-count-updated', { detail: { count: 0 } }));
};

export const PrivateMessages: React.FC = () => {
  const [callsign, setCallsign] = useState(() => (localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
  const [accountIdentities, setAccountIdentities] = useState<AccountIdentity[]>([]);
  const [identityToken] = useState(getIdentityToken);
  const [isOpen, setIsOpen] = useState(false);
  const [recipientDraft, setRecipientDraft] = useState('');
  const [activeRecipient, setActiveRecipient] = useState('');
  const [conversations, setConversations] = useState<PrivateConversation[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const previousUnreadRef = useRef<number | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>({});
  const [moderationRole, setModerationRole] = useState<string | null>(null);
  const [profileTarget, setProfileTarget] = useState('');
  const [blockingProfile, setBlockingProfile] = useState(false);
  const [profileNotice, setProfileNotice] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [deletingConversation, setDeletingConversation] = useState('');
  const [deletingMessage, setDeletingMessage] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const privateSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    const loadIdentities = async () => {
      const root = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (!supabase || !root || !identityToken) return;
      const { data, error } = await supabase.rpc('community_account_identities', { p_token: identityToken });
      if (!active || error || !Array.isArray(data)) return;
      const options = data.filter((item: any) => item && typeof item.callsign === 'string').map((item: any) => ({
        callsign: String(item.callsign).trim().toUpperCase(),
        identity_type: item.identity_type === '11m' ? '11m' as const : 'ham' as const,
        is_primary: item.is_primary === true,
      }));
      if (!options.length) return;
      setAccountIdentities(options);
      const saved = (localStorage.getItem('community_chat_active_callsign') || '').trim().toUpperCase();
      const selected = options.find((item) => item.callsign === saved) || options.find((item) => item.is_primary) || options[0];
      localStorage.setItem('community_chat_active_callsign', selected.callsign);
      setCallsign(selected.callsign);
    };
    void loadIdentities();
    const syncActive = () => setCallsign((localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
    window.addEventListener('user-profile-updated', loadIdentities);
    window.addEventListener('community-active-identity-changed', syncActive);
    return () => { active = false; window.removeEventListener('user-profile-updated', loadIdentities); window.removeEventListener('community-active-identity-changed', syncActive); };
  }, [identityToken]);

  const refreshConversations = useCallback(async () => {
    syncWeeklyPrivateConversationReset();
    if (!supabase || !callsign || !identityToken) return;
    const { data, error: rpcError } = await supabase.rpc('community_private_conversations', {
      p_callsign: callsign,
      p_token: identityToken,
    });
    if (rpcError) {
      // Un fallo puntual de red no significa que el sistema esté sin configurar.
      // No mostrar el aviso de configuración: conservar la bandeja y permitir reintentar.
      setError('');
      return;
    }
    // Normalize the JSON returned by the Supabase RPC before rendering the inbox.
    const rawConversations = Array.isArray(data)
      ? data
      : Array.isArray((data as { conversations?: unknown[] } | null)?.conversations)
        ? (data as { conversations: unknown[] }).conversations
        : [];
    const nextConversations = rawConversations
      .filter((item): item is PrivateConversation => Boolean(item && typeof item === 'object' && (item as PrivateConversation).other_callsign))
      .map((item) => ({
        ...item,
        other_callsign: String(item.other_callsign).trim().toUpperCase(),
        last_body: String(item.last_body || ''),
        last_at: String(item.last_at || ''),
        unread_count: Number(item.unread_count) || 0,
      }))
      .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
      .filter((item) => {
        try {
          const hidden = JSON.parse(localStorage.getItem(`community_private_hidden_${callsign.trim().toUpperCase()}`) || '[]');
          return !Array.isArray(hidden) || !hidden.includes(item.other_callsign);
        } catch { return true; }
      });
    const nextUnread = nextConversations.reduce((total, item) => total + (Number(item.unread_count) || 0), 0);
    setConversations(nextConversations);
    setUnreadTotal(nextUnread);
    localStorage.setItem('community_private_unread_count', String(nextUnread));
    window.dispatchEvent(new CustomEvent('community-private-unread-count-updated', { detail: { count: nextUnread } }));
    if (previousUnreadRef.current !== null && nextUnread > previousUnreadRef.current && localStorage.getItem('eqsl_sound_alerts') !== 'false') {
      try {
        const AudioContextClass = window.AudioContext;
        if (AudioContextClass) {
          const audio = new AudioContextClass();
          const oscillator = audio.createOscillator();
          const gain = audio.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(880, audio.currentTime);
          oscillator.frequency.setValueAtTime(1175, audio.currentTime + 0.12);
          gain.gain.setValueAtTime(0.0001, audio.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + 0.025);
          gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + 0.32);
          oscillator.connect(gain);
          gain.connect(audio.destination);
          oscillator.start();
          oscillator.stop(audio.currentTime + 0.34);
          oscillator.onended = () => { void audio.close().catch(() => {}); };
        }
      } catch { /* El navegador puede bloquear audio hasta que el usuario interactúe. */ }
    }
    previousUnreadRef.current = nextUnread;
    const badgeNavigator = navigator as Navigator & { setAppBadge?: (contents?: number) => Promise<void>; clearAppBadge?: () => Promise<void> };
    const combined = (Number(localStorage.getItem('eqsl_unread_count')) || 0) + nextUnread;
    try {
      if (combined > 0) void badgeNavigator.setAppBadge?.(combined).catch(() => {});
      else void badgeNavigator.clearAppBadge?.().catch(() => {});
    } catch { /* Insignia no admitida por todos los navegadores. */ }
  }, [callsign, identityToken]);

  const refreshMessages = useCallback(async (otherCallsign: string) => {
    syncWeeklyPrivateConversationReset();
    if (!supabase || !callsign || !identityToken || !otherCallsign) return;
    const { data, error: rpcError } = await supabase.rpc('community_private_messages', {
      p_callsign: callsign,
      p_token: identityToken,
      p_other_callsign: otherCallsign,
    });
    if (rpcError) {
      // Evitar atribuir fallos transitorios a una migración/configuración ya comprobada.
      setError('No se pudo cargar esta conversación ahora. Volvé a intentarlo.');
      return;
    }
    setMessages(Array.isArray(data) ? data as PrivateMessage[] : []);
    setError('');
  }, [callsign, identityToken]);

  const photoCallsigns = Array.from(new Set([
    callsign,
    activeRecipient,
    ...conversations.map((conversation) => conversation.other_callsign),
    ...messages.flatMap((message) => [message.sender_callsign, message.recipient_callsign]),
  ].map((value) => (value || '').trim().toUpperCase()).filter(Boolean))).sort().join('|');

  useEffect(() => {
    if (!supabase || !photoCallsigns) {
      setProfilePhotos({});
      return;
    }
    let active = true;
    const loadPhotos = async () => {
      const { data, error: photoError } = await supabase.rpc('community_profile_photos', {
        p_callsigns: photoCallsigns.split('|'),
      });
      if (!active || photoError) return;
      const next: Record<string, string> = {};
      (data || []).forEach((row: { callsign: string; photo_data_url: string }) => {
        if (row?.callsign && row?.photo_data_url) next[String(row.callsign).trim().toUpperCase()] = row.photo_data_url;
      });
      setProfilePhotos(next);
    };
    void loadPhotos();
    const poll = window.setInterval(() => { void loadPhotos(); }, 30000);
    const refresh = () => { void loadPhotos(); };
    window.addEventListener('user-profile-updated', refresh);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener('user-profile-updated', refresh);
    };
  }, [photoCallsigns]);

  useEffect(() => {
    let active = true;
    const loadRole = async () => {
      if (!supabase || !callsign || !identityToken) {
        if (active) setModerationRole(null);
        return;
      }
      const { data, error: roleError } = await supabase.rpc('community_actor_role', {
        p_callsign: callsign.trim().toUpperCase(),
        p_token: identityToken,
      });
      if (!active) return;
      setModerationRole(roleError ? null : (data === 'admin' || data === 'moderator' ? data : null));
    };
    void loadRole();
    return () => { active = false; };
  }, [callsign, identityToken]);

  const blockProfileAccount = async () => {
    const target = profileTarget.trim().toUpperCase();
    if (!supabase || moderationRole !== 'admin' || !target || target === callsign || blockingProfile) return;
    if (!window.confirm(`¿Bloquear a ${target} de LogBook eQSL EXPRESS? No podrá volver a acceder con ese indicativo. También se eliminarán sus mensajes del chat público y no podrá enviar ni recibir nuevos mensajes privados.`)) return;
    setBlockingProfile(true);
    setProfileNotice('');
    setError('');
    try {
      const { data, error: actionError } = await supabase.rpc('community_moderation_action', {
        p_callsign: callsign,
        p_token: identityToken,
        p_action: 'block',
        p_target_callsign: target,
        p_sanction_type: 'block',
        p_duration_minutes: null,
        p_reason: 'Bloqueo integral desde el perfil en mensajes privados',
      });
      if (actionError || !data?.ok) {
        console.error('[Mensajes privados] No se pudo bloquear la cuenta', actionError || data);
        setProfileNotice(data?.reason === 'forbidden'
          ? 'No se verificaron los permisos de administración de este dispositivo.'
          : 'No se pudo aplicar el bloqueo. Volvé a intentarlo.');
        return;
      }
      setProfileNotice(`${target} quedó bloqueado de LogBook eQSL EXPRESS.`);
      setConversations((current) => current.filter((item) => item.other_callsign !== target));
      if (activeRecipient === target) {
        setActiveRecipient('');
        setMessages([]);
      }
      setProfileTarget('');
      await refreshConversations();
    } finally {
      setBlockingProfile(false);
    }
  };

  useEffect(() => {
    const syncCallsign = () => setCallsign((localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
    window.addEventListener('user-profile-updated', syncCallsign);
    window.addEventListener('storage', syncCallsign);
    return () => {
      window.removeEventListener('user-profile-updated', syncCallsign);
      window.removeEventListener('storage', syncCallsign);
    };
  }, []);

  useEffect(() => {
    const openPrivateInbox = () => setIsOpen(true);
    const onServiceWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OPEN_PRIVATE_MESSAGES') openPrivateInbox();
    };
    if (new URLSearchParams(window.location.search).has('open_private_messages')) setIsOpen(true);
    navigator.serviceWorker?.addEventListener('message', onServiceWorkerMessage);
    window.addEventListener('open-private-messages', openPrivateInbox);
    return () => {
      navigator.serviceWorker?.removeEventListener('message', onServiceWorkerMessage);
      window.removeEventListener('open-private-messages', openPrivateInbox);
    };
  }, []);

  useEffect(() => {
    if (!callsign || !supabase) {
      setUnreadTotal(0);
      localStorage.setItem('community_private_unread_count', '0');
      return;
    }
    void refreshConversations();
    const poll = window.setInterval(() => {
      void refreshConversations();
      if (isOpen && activeRecipient) void refreshMessages(activeRecipient);
    }, 15000);
    return () => window.clearInterval(poll);
  }, [isOpen, callsign, activeRecipient, refreshConversations, refreshMessages]);

  useEffect(() => {
    if (isOpen && activeRecipient) {
      // El panel está antes del chat comunitario: al abrirlo desde la lista
      // inferior, llevarlo a la vista para que el toque sea visible.
      privateSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (activeRecipient && isOpen) {
      void refreshMessages(activeRecipient).then(() => refreshConversations());
      setNotice('');
    }
  }, [activeRecipient, isOpen, refreshMessages, refreshConversations]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isOpen, activeRecipient]);

  const openConversation = (rawRecipient: string) => {
    const recipient = rawRecipient.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (recipient.length < 3) {
      setError('Ingresá un indicativo válido de al menos 3 caracteres.');
      return;
    }
    if (recipient === callsign) {
      setError('No podés iniciar una conversación privada con tu propio indicativo.');
      return;
    }
    setError('');
    setRecipientDraft(recipient);
    setActiveRecipient(recipient);
  };

  // Permite abrir la bandeja privada desde cualquier foto o indicativo de la aplicación.
  useEffect(() => {
    const handleOpenPrivateMessage = (event: Event) => {
      const detail = (event as CustomEvent<{ callsign?: string }>).detail;
      const recipient = String(detail?.callsign || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
      if (recipient.length < 3) return;
      if (recipient === callsign) {
        setIsOpen(true);
        setError('No podés iniciar una conversación privada con tu propio indicativo.');
        return;
      }
      setIsOpen(true);
      setRecipientDraft(recipient);
      setActiveRecipient(recipient);
      setError('');
      setNotice('');
    };
    window.addEventListener('open-private-message', handleOpenPrivateMessage);
    return () => window.removeEventListener('open-private-message', handleOpenPrivateMessage);
  }, [callsign]);

  const deleteConversation = async (otherCallsign: string) => {
    if (!supabase || !callsign || !identityToken || deletingConversation) return;
    const confirmed = window.confirm(`¿Ocultar la conversación con ${otherCallsign} de tu bandeja? Los mensajes no se borrarán y la otra persona conservará su conversación.`);
    if (!confirmed) return;
    setDeletingConversation(otherCallsign);
    setError('');
    try {
      // La eliminación es solo para este usuario/dispositivo: no borrar mensajes compartidos del servidor.
      const hiddenKey = `community_private_hidden_${callsign.trim().toUpperCase()}`;
      const hidden = new Set<string>(JSON.parse(localStorage.getItem(hiddenKey) || '[]'));
      hidden.add(otherCallsign.trim().toUpperCase());
      localStorage.setItem(hiddenKey, JSON.stringify(Array.from(hidden)));
      setConversations((current) => current.filter((item) => item.other_callsign !== otherCallsign));
      if (activeRecipient === otherCallsign) {
        setActiveRecipient('');
        setMessages([]);
      }
      await refreshConversations();
    } finally {
      setDeletingConversation('');
    }
  };

  const deleteOwnMessage = async (messageId: string) => {
    if (!supabase || !callsign || !identityToken || deletingMessage) return;
    if (!window.confirm('¿Eliminar este mensaje enviado por vos? No se borrará ningún otro mensaje.')) return;
    setDeletingMessage(messageId);
    setError('');
    try {
      const { data, error: rpcError } = await supabase.rpc('delete_community_private_message', {
        p_callsign: callsign,
        p_token: identityToken,
        p_message_id: messageId,
      });
      if (rpcError) throw rpcError;
      if (!data?.ok) {
        setError(data?.reason === 'forbidden'
          ? 'No se pudo validar tu identidad para eliminar el mensaje.'
          : 'El mensaje ya no existe o no fue enviado por tu indicativo.');
        return;
      }
      setMessages((current) => current.filter((message) => message.id !== messageId));
      await refreshConversations();
    } catch (err) {
      console.error('[Mensajes privados] No se pudo eliminar el mensaje', err);
      setError('No se pudo eliminar el mensaje. Volvé a intentarlo.');
    } finally {
      setDeletingMessage('');
    }
  };

  const sendMessage = async () => {
    const body = draft.trim();
    if (!supabase || !callsign || !activeRecipient || !body || sending) return;
    setSending(true);
    setError('');
    setNotice('');
    try {
      const { data, error: rpcError } = await supabase.rpc('send_community_private_message', {
        p_callsign: callsign,
        p_token: identityToken,
        p_recipient_callsign: activeRecipient,
        p_body: body,
      });
      if (rpcError) {
        console.error('[Mensajes privados] Falló send_community_private_message', {
          code: rpcError.code,
          message: rpcError.message,
          details: rpcError.details,
          hint: rpcError.hint,
          callsign,
          recipient: activeRecipient,
        });
        setError(`Error del servidor al enviar el mensaje (${rpcError.code || 'sin código'}): ${rpcError.message || 'respuesta sin detalle'}`);
        return;
      }
      if (!data?.ok) {
        const reason = String(data?.reason || 'unknown');
        const reasons: Record<string, string> = {
          forbidden: 'El servidor no pudo validar la identidad de tu indicativo en los mensajes privados.',
          recipient_not_found: 'El servidor no encuentra registrado el indicativo destinatario para mensajes privados.',
          invalid_recipient: 'El indicativo destinatario no es válido para una conversación privada.',
          invalid_body: 'El mensaje está vacío o supera el límite permitido.',
          unknown: 'El servidor rechazó el envío sin indicar el motivo.',
        };
        console.warn('[Mensajes privados] El servidor rechazó el envío', {
          reason,
          callsign,
          recipient: activeRecipient,
        });
        setError(reasons[reason] || `El servidor rechazó el envío. Motivo informado: ${reason}`);
        return;
      }
      setDraft('');
      // Enviar push en segundo plano solo después de que Supabase confirme el mensaje.
      // La entrega del mensaje no falla si el servicio push no está configurado.
      void fetch('/api/push-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'notify-private',
          token: identityToken,
          callsign,
          recipient: activeRecipient,
          messageId: String(data.message?.id || ''),
        }),
      }).catch(() => {});
      await refreshMessages(activeRecipient);
      await refreshConversations();
    } finally {
      setSending(false);
    }
  };

  return (
    <section ref={privateSectionRef} className={`min-w-0 overflow-hidden rounded-xl border border-violet-300 bg-violet-950 p-2.5 text-white sm:p-3 shadow-sm ${isOpen ? 'sm:col-span-3' : ''}`} aria-label="Mensajes privados">
      <button type="button" onClick={() => setIsOpen((value) => !value)} className="flex min-h-[56px] w-full items-center gap-2 text-left" aria-expanded={isOpen}>
        <span className="relative shrink-0 rounded-lg bg-violet-200 p-2 text-violet-950"><MessageCircle className="h-5 w-5" />
          {unreadTotal > 0 && <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-violet-950 bg-red-600 px-1 text-[10px] font-black text-white">{unreadTotal > 99 ? '99+' : unreadTotal}</span>}
        </span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-extrabold text-violet-100">Mensajes privados</span></span>
        <Inbox className="h-4 w-4 shrink-0 text-violet-200" />
      </button>
      {!isOpen ? null : (
        <>
        <div className="mt-3 border-t border-violet-800 pt-3 grid grid-cols-1 md:grid-cols-[minmax(180px,0.75fr)_minmax(0,1.5fr)]">
          <aside className="border-b border-violet-800 bg-slate-900 p-3 text-slate-100 md:border-b-0 md:border-r">
            {!callsign ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">Tu señal distintiva se valida al instalar LogBook eQSL EXPRESS. Si todavía no aparece, recargá la aplicación para sincronizar tu identidad.</p>
            ) : (
              <>
                {accountIdentities.length > 1 && <label className="mb-2 block text-xs font-semibold text-violet-200">Identidad activa
                  <select value={callsign} onChange={(event) => {
                    const next = accountIdentities.find((item) => item.callsign === event.target.value);
                    if (!next) return;
                    localStorage.setItem('community_chat_active_callsign', next.callsign);
                    setCallsign(next.callsign); setActiveRecipient(''); setMessages([]); setConversations([]); setUnreadTotal(0);
                    window.dispatchEvent(new CustomEvent('community-active-identity-changed', { detail: { callsign: next.callsign } }));
                  }} className="mt-1 block w-full rounded-lg border border-violet-500 bg-slate-950 px-3 py-2 font-mono text-sm font-bold text-amber-300">
                    {accountIdentities.map((identity) => <option key={identity.callsign} value={identity.callsign}>{identity.identity_type === '11m' ? '11 metros · ' : 'Radioaficionado · '}{identity.callsign}</option>)}
                  </select>
                </label>}
                <p className="mb-2 rounded-lg border border-amber-400/60 bg-slate-950 px-3 py-2 text-xs text-slate-200">TU INDICATIVO <strong className="ml-2 inline-block font-mono text-base font-black tracking-wider text-amber-300">{callsign}</strong></p>
                <form onSubmit={(event) => { event.preventDefault(); openConversation(recipientDraft); }} className="mb-3 flex gap-1.5">
                  <input value={recipientDraft} onChange={(event) => setRecipientDraft(event.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))} maxLength={24} placeholder="Indicativo destino" aria-label="Indicativo destinatario" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2.5 py-2 font-mono text-xs text-slate-950 placeholder:text-slate-500 outline-none focus:border-violet-500" />
                  <button type="submit" className="rounded-lg bg-violet-800 px-3 py-2 text-xs font-bold text-white">Abrir</button>
                </form>
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-100">Conversaciones</h3>
                  <button type="button" onClick={() => void refreshConversations()} className="rounded p-1 text-slate-500 hover:bg-slate-200" aria-label="Actualizar conversaciones"><RefreshCw className="h-3.5 w-3.5" /></button>
                </div>
                {conversations.length === 0 ? <div className="py-3 text-xs text-slate-300"><p>Todavía no aparecen conversaciones privadas.</p><button type="button" onClick={() => void refreshConversations()} className="mt-2 font-bold text-violet-800 underline">Volver a cargar</button></div> : (
                  <ul className="space-y-1.5">
                    {conversations.map((conversation) => (
                      <li key={conversation.other_callsign} className="flex items-stretch gap-1.5">
                        <button type="button" onClick={() => openConversation(conversation.other_callsign)} className={'min-w-0 flex-1 rounded-lg border px-3 py-2 text-left ' + (activeRecipient === conversation.other_callsign ? 'border-violet-400 bg-violet-900' : 'border-slate-700 bg-slate-800 hover:bg-slate-700')}>
                          <span className="flex items-center gap-2">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-300 bg-violet-100">
                              {profilePhotos[conversation.other_callsign]
                                ? <img src={profilePhotos[conversation.other_callsign]} alt={`Foto de ${conversation.other_callsign}`} className="h-full w-full object-cover" />
                                : <span className="font-mono text-[10px] font-bold text-violet-900">{conversation.other_callsign.slice(0, 3)}</span>}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={'flex items-center justify-between gap-2 rounded-md px-1.5 py-1 font-mono text-sm font-black tracking-wide ' + (activeRecipient === conversation.other_callsign ? 'bg-violet-700 text-white' : 'bg-slate-950 text-amber-300')}><button type="button" onClick={(event) => { event.stopPropagation(); window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign: conversation.other_callsign } })); }} className="min-w-0 truncate text-left underline decoration-dotted underline-offset-2 hover:text-cyan-300" aria-label={`Ver perfil de ${conversation.other_callsign}`}>{conversation.other_callsign}</button>{conversation.unread_count > 0 && <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-black text-white">{conversation.unread_count}</span>}</span>
                              <span className="mt-1 block truncate text-[11px] font-normal text-slate-500">{conversation.last_body}</span>
                            </span>
                          </span>
                        </button>
                        <button type="button" onClick={() => void deleteConversation(conversation.other_callsign)} disabled={Boolean(deletingConversation)} aria-label={`Eliminar conversación con ${conversation.other_callsign}`} title="Eliminar conversación" className="flex w-10 shrink-0 items-center justify-center rounded-lg border border-red-500/60 bg-red-950 text-red-200 hover:bg-red-900 disabled:opacity-50"><Trash2 className="h-4 w-4" />{deletingConversation === conversation.other_callsign && <span className="sr-only">Eliminando…</span>}</button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </aside>
          <div className="flex min-h-[min(72vh,680px)] min-w-0 flex-col bg-slate-950">
            <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-2.5">
              <div className="flex items-center gap-2">
                {activeRecipient && <button type="button" onClick={() => setActiveRecipient('')} className="rounded-md p-1 text-slate-500 hover:bg-slate-100 md:hidden" aria-label="Volver a conversaciones"><ArrowLeft className="h-4 w-4" /></button>}
                <h3 className="text-sm font-bold">{activeRecipient ? <>Conversación con <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign: activeRecipient } }))} className="ml-1 inline-block rounded-md border border-amber-400/70 bg-slate-950 px-2 py-1 font-mono text-base font-black tracking-wide text-amber-300 underline decoration-dotted underline-offset-2 hover:text-cyan-300" aria-label={`Ver perfil de ${activeRecipient}`}>{activeRecipient}</button></> : 'Elegí una conversación'}</h3>
              </div>
              {activeRecipient && <button type="button" onClick={() => void refreshMessages(activeRecipient)} className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Actualizar mensajes"><RefreshCw className="h-4 w-4" /></button>}
            </div>
            <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto bg-slate-950 p-3" style={{ maxHeight: 'calc(72vh - 150px)', minHeight: 300 }} aria-live="polite">
              
              {activeRecipient && messages.length === 0 && <p className="py-10 text-center text-sm text-slate-500">Todavía no hay mensajes. Escribí el primero.</p>}
              {messages.map((message) => {
                const mine = message.sender_callsign === callsign;
                const sender = message.sender_callsign.trim().toUpperCase();
                const photo = profilePhotos[sender];
                return <article key={message.id} className={'flex max-w-[100%] items-start gap-2 ' + (mine ? 'ml-auto flex-row-reverse' : 'mr-auto flex-row')}>
                  <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign: sender } }))} aria-label={`Ver perfil de ${sender}`} title={`Ver perfil de ${sender}`} className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-violet-300 bg-slate-100 hover:ring-2 hover:ring-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-400">
                    {photo ? <img src={photo} alt={`Foto de ${sender}`} className="h-full w-full object-cover" /> : <span className="font-mono text-[10px] font-bold text-slate-500">{sender.slice(0, 3)}</span>}
                  </button>
                  {moderationRole === 'admin' && sender !== callsign && <button type="button" onClick={() => { setProfileTarget(sender); setProfileNotice(''); }} className="mt-1 rounded-md p-1 text-rose-300 hover:bg-rose-950" aria-label={`Opciones de bloqueo para ${sender}`} title="Opciones de administración"><ShieldAlert className="h-4 w-4" /></button>}
                  <div className={'min-w-0 max-w-[85%] rounded-xl px-3 py-2 ' + (mine ? 'bg-violet-800 text-white' : 'bg-slate-800 text-slate-100')}>
                    <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign: sender } }))} className={'mb-2 inline-block rounded-md border px-2.5 py-1 font-mono text-sm font-black uppercase tracking-wider underline decoration-dotted underline-offset-2 hover:text-cyan-300 ' + (mine ? 'border-amber-300 bg-slate-950 text-amber-300' : 'border-sky-300 bg-slate-950 text-sky-300')} aria-label={`Ver perfil de ${sender}`}>{sender}</button>
                    {parseDistanceShareImage(message.body) ? <DistanceShareMessage body={message.body} /> : <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>}
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <p className={'text-[10px] ' + (mine ? 'text-violet-100' : 'text-slate-300')}>{new Date(message.created_at).toLocaleString()}</p>
                      {mine && <button type="button" onClick={() => void deleteOwnMessage(message.id)} disabled={Boolean(deletingMessage)} aria-label="Eliminar mi mensaje" title="Eliminar mi mensaje" className="rounded p-1 text-red-200 hover:bg-red-950 disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /></button>}
                    </div>
                  </div>
                </article>;
              })}
            </div>
            {activeRecipient && (
              <form onSubmit={(event) => { event.preventDefault(); void sendMessage(); }} className="flex gap-2 border-t border-slate-800 bg-slate-900 p-3">
                <textarea value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={2000} rows={3} placeholder="Escribí un mensaje privado…" aria-label="Escribí un mensaje privado" className="min-h-20 min-w-0 flex-1 resize-y rounded-xl border border-slate-600 bg-slate-800 px-3 py-2.5 text-sm text-white placeholder:text-slate-400 outline-none focus:border-violet-500" />
                <button type="submit" disabled={sending || !draft.trim()} className="inline-flex items-center gap-1.5 rounded-xl bg-violet-800 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">{sending ? 'Enviando…' : 'Enviar'}</span></button>
              </form>
            )}
          </div>
        </div>
        <div className="mt-3 flex justify-end border-t border-violet-800 pt-3">
          <button type="button" onClick={() => setIsOpen(false)} className="inline-flex items-center gap-2 rounded-lg border border-violet-500 bg-violet-900 px-4 py-2 text-sm font-bold text-white hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-300" aria-label="Cerrar mensajes privados">
            Cerrar mensajes privados
          </button>
        </div>
        </>
      )}
      {profileTarget && <div className="fixed inset-0 z-[10030] flex items-center justify-center bg-slate-950/80 p-4" role="dialog" aria-modal="true" aria-labelledby="private-profile-title">
        <section className="w-full max-w-sm rounded-2xl border border-violet-300 bg-slate-900 p-5 text-white shadow-2xl">
          <div className="flex items-center justify-between gap-3">
            <h3 id="private-profile-title" className="text-lg font-black">Perfil de {profileTarget}</h3>
            <button type="button" onClick={() => setProfileTarget('')} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label="Cerrar perfil"><X className="h-5 w-5" /></button>
          </div>
          <div className="mt-4 flex flex-col items-center gap-3">
            <div className="h-24 w-24 overflow-hidden rounded-full border-2 border-violet-300 bg-slate-800">
              {profilePhotos[profileTarget] ? <img src={profilePhotos[profileTarget]} alt={`Foto de perfil de ${profileTarget}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center font-mono text-xl font-black">{profileTarget.slice(0,3)}</div>}
            </div>
            <p className="font-mono text-xl font-black tracking-wider">{profileTarget}</p>
          </div>
          {moderationRole === 'admin' && profileTarget !== callsign && <button type="button" disabled={blockingProfile} onClick={() => void blockProfileAccount()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-rose-700 px-4 py-3 font-bold text-white hover:bg-rose-600 disabled:opacity-50"><ShieldAlert className="h-4 w-4" />{blockingProfile ? 'Bloqueando…' : 'Bloquear de la app'}</button>}
          {profileNotice && <p role="status" className="mt-3 rounded-lg border border-emerald-700 bg-emerald-950 p-3 text-sm text-emerald-200">{profileNotice}</p>}
          <button type="button" onClick={() => setProfileTarget('')} className="mt-3 w-full rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200">Cerrar</button>
        </section>
      </div>}
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={'border-t px-4 py-3 text-sm ' + (error ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900')}>{error || notice}</div>}
    </section>
  );
};

```

## src/components/CommunityChat.tsx

```tsx
import React, { useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { MessageCircle, Send, ShieldCheck, Reply, AlertTriangle, Trash2, Sun, Moon, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { parseDistanceShareImage } from '../services/distanceShare';
import { DistanceShareMessage } from './DistanceShareMessage';

type OnlineUser = { callsign: string; identityToken?: string };
type AccountIdentity = { callsign: string; identity_type: 'ham' | '11m'; is_primary: boolean };

const openPrivateMessage = (rawCallsign: string) => {
  const callsign = String(rawCallsign || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (callsign.length < 3) return;
  window.dispatchEvent(new CustomEvent('open-private-message', { detail: { callsign } }));
};

// La misma función central se usa en generador, usuarios en línea y Live Spot.
const callsignCountryFlag = (rawCallsign: string): string => {
  const call = String(rawCallsign || '').trim().toUpperCase();
  return flagForCallsign(call, undefined, is11MeterStationIdentifier(call));
};

type ChatMessage = {
  id: string;
  user_id: string | null;
  callsign: string;
  body: string;
  reply_to_callsign: string | null;
  created_at: string;
};

export const CommunityChat: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [moderationRole, setModerationRole] = useState<string | null>(null);
  const [moderationStatus, setModerationStatus] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [moderationTarget, setModerationTarget] = useState<string | null>(null);
  const [adminPanelOpen, setAdminPanelOpen] = useState(false);
  const [moderatorCandidate, setModeratorCandidate] = useState('');
  const [moderatorTargetSelected, setModeratorTargetSelected] = useState<string | null>(null);
  const [adminSanctions, setAdminSanctions] = useState<any[]>([]);
  const [adminAudit, setAdminAudit] = useState<any[]>([]);
  const isAdmin = moderationRole === 'admin';
  const isModerator = isAdmin || moderationRole === 'moderator';
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);
  const chatSectionRef = useRef<HTMLElement | null>(null);
  const [profilePhotos, setProfilePhotos] = useState<Record<string, string>>({});
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [appLanguage, setAppLanguage] = useState(() => (localStorage.getItem('app_language') || 'es').toLowerCase());
  const [translatedBodies, setTranslatedBodies] = useState<Record<string, string>>({});
  const translationPending = useRef<Set<string>>(new Set());
  const [draft, setDraft] = useState('');
  const [callsign, setCallsign] = useState(() => localStorage.getItem('community_chat_sd')?.trim().toUpperCase() || '');
  const [accountIdentities, setAccountIdentities] = useState<AccountIdentity[]>([]);
  const [activeCallsign, setActiveCallsign] = useState(() => (localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase());
  const [sdLocked, setSdLocked] = useState(() => Boolean(localStorage.getItem('community_chat_sd')));
  const [identityToken] = useState(() => {
    const existing = localStorage.getItem('community_chat_identity_token');
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem('community_chat_identity_token', created);
    return created;
  });
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  // Por privacidad y para no ocupar espacio al entrar, el chat siempre inicia cerrado.
  // Al desplegarlo, los usuarios nuevos verán aquí mismo la validación de su señal distintiva.
  const [chatCollapsed, setChatCollapsed] = useState(true);
  const toggleCommunityChat = () => setChatCollapsed((current) => !current);

  // Al abrir el chat, llevar su encabezado al borde superior de la pantalla.
  // El listado conserva su propio scroll y queda posicionado en el mensaje más reciente.
  useEffect(() => {
    if (chatCollapsed) return;
    const frame = window.requestAnimationFrame(() => {
      chatSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      window.requestAnimationFrame(() => {
        const container = messagesContainerRef.current;
        if (container) container.scrollTop = container.scrollHeight;
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [chatCollapsed]);
  const [darkChat, setDarkChat] = useState(() => localStorage.getItem('community_chat_theme') !== 'light');
  const toggleChatTheme = () => setDarkChat((current) => { const next = !current; localStorage.setItem('community_chat_theme', next ? 'dark' : 'light'); return next; });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [adminNotice, setAdminNotice] = useState('');
  const [error, setError] = useState('');
  const [moderationBusy, setModerationBusy] = useState(false);
  const [moderationDialog, setModerationDialog] = useState<{ title: string; body: string; callsign: string } | null>(null);
  const [accountBlockedNotice, setAccountBlockedNotice] = useState(false);
  const [blockedCallsign, setBlockedCallsign] = useState('');

  // Comprobar el bloqueo al recuperar la identidad o al entrar con una SD guardada.
  useEffect(() => {
    let active = true;
    const checkBlockedIdentity = async () => {
      const candidate = String(callsign || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (!supabase || !candidate) return;
      const { data, error: checkError } = await supabase.rpc('community_is_blocked', { p_callsign: candidate });
      if (!active) return;
      if (checkError) {
        console.warn('[LogBook chat] No se pudo comprobar el bloqueo de la identidad:', checkError);
        return;
      }
      if (data === true) {
        setBlockedCallsign(candidate);
        setAccountBlockedNotice(true);
      }
    };
    void checkBlockedIdentity();
    return () => { active = false; };
  }, [callsign]);

  // Recover a previously registered callsign from this device token if local storage
  // lost the callsign value. Never ask the user to invent a replacement in that case.
  useEffect(() => {
    let active = true;
    const recoverCallsign = async () => {
      const saved = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (saved || !supabase || !identityToken) return;
      const { data, error: recoveryError } = await supabase.rpc('resolve_community_callsign', { p_token: identityToken });
      if (!active || recoveryError || typeof data !== 'string' || !data.trim()) return;
      const recovered = data.trim().toUpperCase();
      localStorage.setItem('community_chat_sd', recovered);
      setCallsign(recovered);
      setSdLocked(true);
      window.dispatchEvent(new Event('user-profile-updated'));
      setNotice('Recuperamos tu señal distintiva registrada: ' + recovered + '.');
    };
    void recoverCallsign();
    return () => { active = false; };
  }, [identityToken]);

  useEffect(() => {
    let active = true;
    const loadAccountIdentities = async () => {
      if (!supabase || !identityToken || !callsign) return;
      const { data, error } = await supabase.rpc('community_account_identities', { p_token: identityToken });
      if (!active || error || !Array.isArray(data)) return;
      const options = data.filter((item: any) => item && typeof item.callsign === 'string').map((item: any) => ({
        callsign: String(item.callsign).trim().toUpperCase(),
        identity_type: item.identity_type === '11m' ? '11m' as const : 'ham' as const,
        is_primary: item.is_primary === true,
      }));
      if (!options.length) return;
      setAccountIdentities(options);
      const saved = (localStorage.getItem('community_chat_active_callsign') || '').trim().toUpperCase();
      const selected = options.find((item) => item.callsign === saved) || options.find((item) => item.is_primary) || options[0];
      setActiveCallsign(selected.callsign);
      localStorage.setItem('community_chat_active_callsign', selected.callsign);
    };
    void loadAccountIdentities();
    const onIdentityUpdate = () => { void loadAccountIdentities(); };
    const onActiveChange = (event: Event) => {
      const next = String((event as CustomEvent<{ callsign?: string }>).detail?.callsign || '').trim().toUpperCase();
      if (next) setActiveCallsign(next);
    };
    window.addEventListener('user-profile-updated', onIdentityUpdate);
    window.addEventListener('community-active-identity-changed', onActiveChange);
    return () => {
      active = false;
      window.removeEventListener('user-profile-updated', onIdentityUpdate);
      window.removeEventListener('community-active-identity-changed', onActiveChange);
    };
  }, [callsign, identityToken]);

  const chooseActiveIdentity = (next: string) => {
    const selected = accountIdentities.find((item) => item.callsign === next);
    if (!selected) return;
    setActiveCallsign(selected.callsign);
    localStorage.setItem('community_chat_active_callsign', selected.callsign);
    window.dispatchEvent(new CustomEvent('community-active-identity-changed', { detail: { callsign: selected.callsign } }));
  };

  const activeIdentityType = accountIdentities.find((item) => item.callsign === activeCallsign)?.identity_type
    || (is11MeterStationIdentifier(activeCallsign || callsign) ? '11m' : 'ham');
  const visibleMessages = messages.filter((message) => message.callsign.trim().toUpperCase() !== 'LU1TSB/4RC978' && is11MeterStationIdentifier(message.callsign) === (activeIdentityType === '11m'));
  const visibleOnlineUsers = onlineUsers.filter((user) => is11MeterStationIdentifier(user.callsign) === (activeIdentityType === '11m'));

  // Public chat identities use a device token, not Supabase Auth. Resolve moderation
  // privileges against the server-side role table so public users cannot impersonate staff.
  useEffect(() => {
    let active = true;
    const loadModerationRole = async () => {
      if (!supabase || !callsign || !identityToken) {
        if (active) { setModerationRole(null); setModerationStatus(''); }
        return;
      }
      const { data, error: roleError } = await supabase.rpc('community_actor_role', {
        p_callsign: callsign.trim().toUpperCase(),
        p_token: identityToken,
      });
      if (!active) return;
      if (roleError) {
        console.warn('[LogBook chat] moderation role lookup:', roleError);
        setModerationRole(null);
        setModerationStatus('No se pudieron verificar los privilegios en Supabase.');
      } else {
        const verifiedRole = data === 'admin' || data === 'moderator' ? data : null;
        setModerationRole(verifiedRole);
        setModerationStatus(callsign.trim().toUpperCase() === 'LU1TSB' && !verifiedRole
          ? 'LU1TSB no está verificado como administrador en este dispositivo: el token de identidad no coincide con el registro de Supabase.'
          : '');
      }
    };
    void loadModerationRole();
    return () => { active = false; };
  }, [callsign, identityToken]);

  useEffect(() => {
    if (!supabase) return;
    let mounted = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted) return;
      if (sessionError) console.warn('[LogBook chat] session lookup:', sessionError);
      setSession(data.session);
      if (data.session) {
        localStorage.setItem('logbook_chat_authenticated', '1');
        localStorage.removeItem('logbook_chat_invitation_pending');
      }
      const saved = localStorage.getItem('community_chat_sd') || '';
      if (saved) setCallsign(String(saved).trim().toUpperCase());
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (nextSession) {
        localStorage.setItem('logbook_chat_authenticated', '1');
        localStorage.removeItem('logbook_chat_invitation_pending');
        const saved = localStorage.getItem('community_chat_sd') || '';
        if (saved) setCallsign(String(saved).trim().toUpperCase());
        setNotice('Sesión iniciada. Ya podés participar del chat.');
      }
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setMessages([]);
      return;
    }
    let active = true;
    const loadMessages = async () => {
      setError('');
      const { data, error: loadError } = await supabase
        .from('community_messages')
        .select('id,user_id,callsign,body,reply_to_callsign,created_at')
        .order('created_at', { ascending: true })
        .limit(100);
      if (!active) return;
      if (loadError) setError('No se pudieron cargar los mensajes. Revisá la configuración de la tabla y sus permisos.');
      else setMessages(((data || []) as ChatMessage[]).sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
    };
    void loadMessages();
    // Poll as a fallback so messages still appear on other devices if Realtime
    // publication/subscription is unavailable in the Supabase project.
    const pollId = window.setInterval(() => { void loadMessages(); }, 5000);
    const channel = supabase
      .channel('logbook-community-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'community_messages' }, (payload) => {
        const incoming = payload.new as ChatMessage;
        setMessages((current) => current.some((item) => item.id === incoming.id) ? current : [...current, incoming].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-100));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'community_messages' }, (payload) => {
        const removed = payload.old as Partial<ChatMessage>;
        if (removed.id) setMessages((current) => current.filter((item) => item.id !== removed.id));
      })
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setError('La conexión en tiempo real no está disponible. Revisá que Realtime esté habilitado en Supabase.');
        }
      });
    return () => {
      active = false;
      window.clearInterval(pollId);
      void supabase?.removeChannel(channel);
    };
  }, []);


  // Keep the newest community message visible; older messages move upward in the scroll area.
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  // Publish presence only while the visitor has a saved callsign. Supabase Realtime
  // Presence provides a shared online roster without adding a registration flow.
  useEffect(() => {
    if (!supabase || !(activeCallsign || callsign).trim() || !identityToken) {
      setOnlineUsers([]);
      return;
    }
    let active = true;
    const presenceChannel = supabase.channel('logbook-community-presence', {
      config: { presence: { key: identityToken } },
    });
    const refreshOnlineUsers = () => {
      if (!active) return;
      const state = presenceChannel.presenceState() as Record<string, Array<{ callsign?: string; identityToken?: string }>>;
      const unique = new Map<string, OnlineUser>();
      Object.values(state).flat().forEach((entry) => {
        const clean = String(entry?.callsign || '').trim().toUpperCase();
        if (clean) unique.set(clean, { callsign: clean, identityToken: entry.identityToken });
      });
      setOnlineUsers(Array.from(unique.values()).sort((a, b) => a.callsign.localeCompare(b.callsign)));
    };
    presenceChannel.on('presence', { event: 'sync' }, refreshOnlineUsers);
    presenceChannel.on('presence', { event: 'join' }, refreshOnlineUsers);
    presenceChannel.on('presence', { event: 'leave' }, refreshOnlineUsers);
    presenceChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED' && active) {
        await presenceChannel.track({ callsign: (activeCallsign || callsign).trim().toUpperCase(), identityToken });
        refreshOnlineUsers();
      }
    });
    return () => {
      active = false;
      void presenceChannel.untrack();
      void supabase?.removeChannel(presenceChannel);
    };
  }, [activeCallsign, callsign, identityToken]);

  // Load shared profile photos for the callsigns visible in the community chat.
  const profileCallsignKey = Array.from(new Set(messages.map((message) => message.callsign.trim().toUpperCase()).filter(Boolean))).join('|');
  useEffect(() => {
    if (!supabase || !profileCallsignKey) {
      setProfilePhotos({});
      return;
    }
    let active = true;
    const loadProfilePhotos = async () => {
      const requested = profileCallsignKey.split('|');
      const { data, error: photoError } = await supabase.rpc('community_profile_photos', { p_callsigns: requested });
      if (!active || photoError) return;
      const next: Record<string, string> = {};
      (data || []).forEach((row: { callsign: string; photo_data_url: string }) => {
        if (row?.callsign && row?.photo_data_url) next[String(row.callsign).trim().toUpperCase()] = row.photo_data_url;
      });
      setProfilePhotos(next);
    };
    void loadProfilePhotos();
    const refreshId = window.setInterval(() => { void loadProfilePhotos(); }, 30000);
    const refreshOnProfileChange = () => { void loadProfilePhotos(); };
    window.addEventListener('user-profile-updated', refreshOnProfileChange);
    return () => {
      active = false;
      window.clearInterval(refreshId);
      window.removeEventListener('user-profile-updated', refreshOnProfileChange);
    };
  }, [profileCallsignKey]);

  // Translate messages only for display; the original text remains stored in Supabase.
  // The selected app language is per-device, so each visitor sees their own translation.
  useEffect(() => {
    const syncLanguage = () => setAppLanguage((localStorage.getItem('app_language') || 'es').toLowerCase());
    window.addEventListener('user-profile-updated', syncLanguage);
    window.addEventListener('storage', syncLanguage);
    return () => {
      window.removeEventListener('user-profile-updated', syncLanguage);
      window.removeEventListener('storage', syncLanguage);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const targetLanguage = appLanguage || 'es';
    const recentMessages = messages.slice(-30);
    const translateMessages = async () => {
      for (const message of recentMessages) {
        const key = targetLanguage + ':' + message.id;
        if (translatedBodies[key] || translationPending.current.has(key) || !message.body.trim() || parseDistanceShareImage(message.body)) continue;
        translationPending.current.add(key);
        try {
          const url = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' + encodeURIComponent(targetLanguage) + '&dt=t&q=' + encodeURIComponent(message.body);
          const response = await fetch(url);
          if (!response.ok) continue;
          const result = await response.json();
          const translated = Array.isArray(result?.[0]) ? result[0].map((part: any) => typeof part?.[0] === 'string' ? part[0] : '').join('') : '';
          if (active && translated.trim()) setTranslatedBodies((current) => ({ ...current, [key]: translated }));
        } catch {
          // If translation is unavailable, leave the original message visible.
        } finally {
          translationPending.current.delete(key);
        }
      }
    };
    void translateMessages();
    return () => { active = false; };
  }, [messages, appLanguage]);

  const saveCallsign = async () => {
    if (!supabase || busy) return;
    const cleanCallsign = callsign.trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (cleanCallsign.length < 3 || cleanCallsign.length > 24) {
      setError('Ingresá un indicativo válido de entre 3 y 24 caracteres.');
      return;
    }
    const previousCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
    const { data: blockedStatus, error: blockedCheckError } = await supabase.rpc('community_is_blocked', { p_callsign: cleanCallsign });
    if (blockedCheckError) {
      setError('No se pudo verificar el estado de acceso. Volvé a intentarlo.');
      return;
    }
    if (blockedStatus === true) {
      setBlockedCallsign(cleanCallsign);
      setAccountBlockedNotice(true);
      setError('');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (previousCallsign && previousCallsign !== cleanCallsign) {
        const { data, error: changeError } = await supabase.rpc('change_community_callsign', {
          p_current_callsign: previousCallsign,
          p_new_callsign: cleanCallsign,
          p_token: identityToken,
        });
        if (changeError || !data?.ok) {
          setError(data?.reason === 'taken' ? 'Ese indicativo ya está registrado por otra persona.' : 'No se pudo cambiar el indicativo. Primero hay que aplicar la migración 3 en Supabase.');
          return;
        }
      } else {
        const { data, error: registerError } = await supabase.rpc('register_community_callsign', {
          p_callsign: cleanCallsign,
          p_token: identityToken,
        });
        if (registerError || !data?.ok) {
          setError(data?.reason === 'taken' ? 'Ese indicativo ya está registrado por otra persona.' : 'No se pudo guardar el indicativo. Revisá que las migraciones públicas estén aplicadas.');
          return;
        }
      }
      localStorage.setItem('community_chat_sd', cleanCallsign);
      localStorage.setItem('community_chat_active_callsign', cleanCallsign);
      setCallsign(cleanCallsign);
      setActiveCallsign(cleanCallsign);
      setSdLocked(true);
      window.dispatchEvent(new Event('user-profile-updated'));
      setNotice('Señal distintiva guardada en este dispositivo.');
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    if (!supabase || busy) return;
    const body = draft.trim();
    const cleanCallsign = (activeCallsign || localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!body) return;
    if (cleanCallsign.length < 3 || cleanCallsign.length > 24) { setError('Ingresá tu SD/indicativo antes de enviar.'); return; }
    setBusy(true); setError('');
    try {
      const previousCallsign = (localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
      if (cleanCallsign === previousCallsign) {
        const { data: identityData, error: identityError } = await supabase.rpc('register_community_callsign', { p_callsign: cleanCallsign, p_token: identityToken });
        if (identityError || !identityData?.ok) { setError(identityData?.reason === 'taken' ? 'Ese SD ya está registrado por otra persona. No se permiten duplicados.' : identityData?.reason === 'locked' ? 'Este dispositivo ya tiene un SD registrado. Usá «Cambiar indicativo» para corregirlo.' : 'No se pudo registrar tu SD. Revisá que las migraciones del chat estén aplicadas en Supabase.'); return; }
      } else if (!accountIdentities.some((item) => item.callsign === cleanCallsign)) {
        setError('La identidad seleccionada no está vinculada a esta cuenta. Registrala desde el Libro de Guardia.');
        return;
      }
      if (cleanCallsign === previousCallsign) {
        localStorage.setItem('community_chat_sd', cleanCallsign);
        setCallsign(cleanCallsign);
        setSdLocked(true);
      }
      const { data, error: sendError } = await supabase.rpc('post_community_message', { p_callsign: cleanCallsign, p_token: identityToken, p_body: body, p_reply_to_callsign: replyTo?.callsign || null });
      if (sendError || !data?.ok) {
        console.error('[LogBook chat] public message insert error:', sendError || data);
        if (data?.reason === 'sanctioned' || data?.reason === 'blocked' || data?.reason === 'silenced') {
          setAccountBlockedNotice(true);
          setError('');
        } else {
          setError('No se pudo enviar. Verificá que las migraciones públicas del chat estén aplicadas en Supabase.');
        }
        return;
      }
      if (data.message) setMessages((current) => current.some((item) => item.id === data.message.id) ? current : [...current, data.message as ChatMessage].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()).slice(-100));
      setDraft(''); setReplyTo(null);
    } finally { setBusy(false); }
  };
  const deleteMessage = async (message: ChatMessage) => {
    const actorCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!supabase || !isModerator || !actorCallsign || deletingId) return;
    if (!window.confirm(`¿Eliminar definitivamente el mensaje de ${message.callsign}?`)) return;
    setDeletingId(message.id);
    setError('');
    try {
      // Use the protected moderation RPC; direct table DELETE requires a different auth model.
      const { data, error: deleteError } = await supabase.rpc('community_moderation_action', {
        p_callsign: actorCallsign,
        p_token: identityToken,
        p_action: 'delete_message',
        p_target_callsign: message.callsign,
        p_reason: message.id,
      });
      if (deleteError || !data?.ok) {
        console.error('[LogBook chat] moderation delete failed:', deleteError || data);
        setError(data?.reason === 'forbidden'
          ? 'Tu indicativo no tiene permisos de moderación en Supabase.'
          : 'No se pudo eliminar el mensaje. Comprobá que esté aplicada la migración de moderación y que tu indicativo tenga el rol correcto.');
        return;
      }
      setMessages((current) => current.filter((item) => item.id !== message.id));
      setNotice('Mensaje eliminado.');
    } finally {
      setDeletingId(null);
    }
  };

  const callModerationAction = async (action: string, targetCallsign?: string, sanctionType?: string, durationMinutes?: number, reason?: string) => {
    const actorCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!supabase || !isModerator || !actorCallsign) {
      setError('No se verificaron los permisos de moderación de este dispositivo.');
      return null;
    }
    const { data, error: actionError } = await supabase.rpc('community_moderation_action', {
      p_callsign: actorCallsign,
      p_token: identityToken,
      p_action: action,
      p_target_callsign: targetCallsign || null,
      p_sanction_type: sanctionType || null,
      p_duration_minutes: durationMinutes ?? null,
      p_reason: reason || null,
    });
    if (actionError || !data?.ok) {
      console.error('[LogBook chat] moderation action failed:', actionError || data);
      const reasonCode = data?.reason;
      setError(reasonCode === 'forbidden'
        ? 'Supabase rechazó la acción: el indicativo y el token de este dispositivo no tienen ese privilegio.'
        : reasonCode === 'invalid_target'
          ? 'El indicativo de destino no está registrado o no puede moderarse.'
          : reasonCode === 'not_found'
            ? 'El registro que intentaste modificar ya no existe o ya fue revertido.'
            : 'La acción de moderación falló. Revisá la migración de moderación en Supabase.');
      return null;
    }
    return data;
  };

  const applySanction = async (targetCallsign: string, sanctionType: 'silence' | 'block', durationMinutes?: number) => {
    const target = targetCallsign.trim().toUpperCase();
    const actorCallsign = (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase();
    if (!target || target === actorCallsign || moderationBusy) return;
    const durationLabel = durationMinutes === 5 ? '5 minutos' : durationMinutes === 60 ? '1 hora' : durationMinutes === 10080 ? '7 días' : '';
    const actionLabel = sanctionType === 'block' ? 'bloquear permanentemente' : `silenciar durante ${durationLabel}`;
    if (!window.confirm(`¿Querés ${actionLabel} a ${target}?`)) return;
    setModerationBusy(true);
    setModerationTarget(target);
    setError('');
    try {
      const result = await callModerationAction(sanctionType, target, sanctionType, durationMinutes, 'Moderación desde el chat');
      if (!result) return;
      if (sanctionType === 'block') setMessages((current) => current.filter((message) => message.callsign.trim().toUpperCase() !== target));
      setNotice('');
      setModerationDialog({
        callsign: target,
        title: sanctionType === 'block' ? 'Bloqueo aplicado' : 'Silenciamiento aplicado',
        body: sanctionType === 'block'
          ? `La cuenta ${target} quedó bloqueada para participar en el chat. Cuando intente escribir, recibirá un aviso para comunicarse con administración en lu1tsb.4rc978@gmail.com.`
          : `${target} quedó silenciado durante ${durationLabel}.`,
      });
      if (isAdmin && adminPanelOpen) await loadAdminData('list_sanctions');
    } finally {
      setModerationBusy(false);
      setModerationTarget(null);
    }
  };

  const loadAdminData = async (kind: 'list_sanctions' | 'list_audit') => {
    if (!isAdmin) {
      setError('Solo LU1TSB, como administrador, puede consultar estos registros.');
      return;
    }
    setModerationBusy(true);
    setError('');
    try {
      const result = await callModerationAction(kind);
      if (!result) return;
      if (kind === 'list_sanctions') setAdminSanctions(Array.isArray(result.sanctions) ? result.sanctions : []);
      else setAdminAudit(Array.isArray(result.audit) ? result.audit : []);
      setNotice(kind === 'list_sanctions' ? 'Listado de sanciones actualizado.' : 'Auditoría actualizada.');
    } finally {
      setModerationBusy(false);
    }
  };

  const appointModerator = async (selectedCallsign?: string) => {
    const target = (selectedCallsign || moderatorCandidate).trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
    if (!isAdmin || target.length < 3 || target === 'LU1TSB' || moderationBusy) {
      setError('Ingresá un indicativo válido distinto de LU1TSB.');
      return;
    }
    if (!window.confirm(`¿Dar privilegios de moderador a ${target}? Podrá borrar mensajes, silenciar y bloquear.`)) return;
    setModerationBusy(true);
    setError('');
    try {
      const result = await callModerationAction('appoint_moderator', target);
      if (!result) return;
      setModeratorCandidate('');
      setModeratorTargetSelected(null);
      setAdminNotice(`${target} ahora tiene rol de moderador.`);
    } finally {
      setModerationBusy(false);
    }
  };

  const reverseSanction = async (sanction: any) => {
    if (!isAdmin || moderationBusy || !sanction?.id) return;
    if (!window.confirm(`¿Levantar la sanción aplicada a ${sanction.target_callsign}?`)) return;
    setModerationBusy(true);
    setError('');
    try {
      const result = await callModerationAction('reverse_sanction', sanction.target_callsign, undefined, undefined, sanction.id);
      if (!result) return;
      setAdminSanctions((current) => current.map((item) => item.id === sanction.id ? { ...item, active: false, reversed_at: new Date().toISOString(), reversed_by: 'LU1TSB' } : item));
      setNotice(`Sanción de ${sanction.target_callsign} levantada.`);
    } finally {
      setModerationBusy(false);
    }
  };

  const signOut = async () => {
    if (!supabase) return;
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) setError('No se pudo cerrar la sesión.');
    else {
      setSession(null);
      localStorage.removeItem('logbook_chat_authenticated');
      setMessages([]);
      setNotice('Sesión cerrada.');
    }
  };

  return (
    <section ref={chatSectionRef} id="community-chat" className={`mb-6 scroll-mt-2 overflow-hidden rounded-2xl border border-sky-900/70 shadow-xl ${darkChat ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900'}`} aria-label="Chat de la comunidad">
      <div className="flex items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-white sm:px-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="rounded-xl bg-sky-500/15 p-2 text-sky-300"><MessageCircle className="h-5 w-5" /></div>
          <div className="min-w-0">
            <h2 className="font-bold leading-tight">CHAT eQSL EXPRESS</h2>
            <p className="mt-1 text-xs font-semibold leading-snug text-sky-200">ESCRIBE EN TU IDIOMA · TRADUCCIÓN AUTOMÁTICA</p>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300" aria-live="polite"><span className="h-2 w-2 rounded-full bg-emerald-400" />{visibleOnlineUsers.length} {visibleOnlineUsers.length === 1 ? 'usuario en línea' : 'usuarios en línea'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1"><button type="button" onClick={toggleChatTheme} className="rounded-lg p-2 text-slate-300 hover:bg-slate-800" aria-label={darkChat ? "Cambiar a fondo claro" : "Cambiar a fondo oscuro"} title={darkChat ? "Fondo claro" : "Fondo oscuro"}>{darkChat ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}</button><button type="button" onClick={toggleCommunityChat} className="rounded-lg p-2 text-slate-100 hover:bg-slate-800" aria-label={chatCollapsed ? "Desplegar chat comunitario" : "Replegar chat comunitario"} title={chatCollapsed ? "Desplegar chat" : "Replegar chat"} aria-expanded={!chatCollapsed}>{chatCollapsed ? <ChevronDown className="h-5 w-5" /> : <ChevronUp className="h-5 w-5" />}</button></div>
      </div>
      {!chatCollapsed && <>
      {isAdmin && <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950 sm:px-5">
        <button type="button" onClick={() => setAdminPanelOpen((open) => !open)} className="font-bold underline underline-offset-2">Herramientas del administrador LU1TSB {adminPanelOpen ? '−' : '+'}</button>
        {adminPanelOpen && <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={moderationBusy} onClick={() => void loadAdminData('list_sanctions')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Ver sanciones</button>
            <button type="button" disabled={moderationBusy} onClick={() => void loadAdminData('list_audit')} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-50">Ver auditoría</button>
          </div>
          <div className="flex flex-wrap gap-2">
            <input value={moderatorCandidate} onChange={(e) => setModeratorCandidate(e.target.value.toUpperCase().replace(/[^A-Z0-9/]/g, ''))} maxLength={24} placeholder="Indicativo para nombrar moderador" className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs text-slate-900" />
            <button type="button" disabled={moderationBusy || moderatorCandidate.trim().length < 3} onClick={() => void appointModerator()} className="rounded-lg bg-amber-800 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">Nombrar</button>
          </div>
          {adminSanctions.length > 0 && <div className="space-y-2"><p className="font-bold">Sanciones</p>{adminSanctions.map((sanction) => <div key={sanction.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-white p-2 text-xs"><span><strong>{sanction.target_callsign}</strong> · {sanction.sanction_type} · {sanction.active ? 'activa' : 'levantada'}{sanction.expires_at ? ` · hasta ${new Date(sanction.expires_at).toLocaleString()}` : ''}</span>{sanction.active && <button type="button" disabled={moderationBusy} onClick={() => void reverseSanction(sanction)} className="rounded border border-amber-300 px-2 py-1 font-semibold disabled:opacity-50">Levantar</button>}</div>)}</div>}
          {adminAudit.length > 0 && <div className="space-y-1"><p className="font-bold">Auditoría reciente</p>{adminAudit.slice(0, 20).map((entry) => <p key={entry.id} className="rounded bg-white px-2 py-1 text-xs">{new Date(entry.created_at).toLocaleString()} · {entry.actor_callsign} · {entry.action}{entry.target_callsign ? ` · ${entry.target_callsign}` : ''}</p>)}</div>}
        </div>}
      </div>}
      {!supabase ? (
        <div className="space-y-2 bg-amber-50 px-4 py-5 text-sm text-amber-950 sm:px-5">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle className="h-4 w-4 shrink-0" /> Chat pendiente de conexión</p>
          <p>El servicio del chat todavía no está configurado. Revisá las variables públicas de Supabase en Vercel.</p>
        </div>
      ) : (
        <>
          {accountIdentities.length > 1 && <div className="border-b border-slate-700 bg-slate-900 px-4 py-3 text-sm text-white">
            <label className="flex flex-wrap items-center gap-2"><span className="font-semibold text-sky-200">Identidad activa:</span>
              <select value={activeCallsign} onChange={(event) => chooseActiveIdentity(event.target.value)} className="min-w-0 rounded-lg border border-sky-500/50 bg-slate-950 px-3 py-2 font-mono font-bold text-amber-300">
                {accountIdentities.map((identity) => <option key={identity.callsign} value={identity.callsign}>{identity.identity_type === '11m' ? '11 metros · ' : 'Radioaficionado · '}{identity.callsign}</option>)}
              </select>
            </label>
          </div>}
          <article className={`border-b-2 border-sky-500 px-4 py-4 shadow-sm ${darkChat ? "bg-slate-900 text-slate-100" : "bg-sky-50 text-slate-950"}`} aria-label="Mensaje de bienvenida fijado">
            <div className="flex items-start gap-3">
              <strong className="shrink-0 pt-0.5 font-mono text-sm font-extrabold uppercase text-red-600">LU1TSB</strong>
              <p className="text-sm font-semibold leading-relaxed">Bienvenidos al espacio de la comunidad LogBook eQSL EXPRESS.</p>
            </div>
          </article>
          <div ref={messagesContainerRef} className={`max-h-[min(48vh,420px)] min-h-[180px] space-y-1.5 overflow-y-auto scroll-smooth px-3 py-2 sm:px-4 ${darkChat ? "bg-black text-white" : "bg-white text-slate-950"}`} aria-live="polite">
            {visibleMessages.length === 0 && <p className="py-5 text-center text-sm text-slate-500">Todavía no hay mensajes en esta identidad. ¡Podés iniciar la conversación!</p>}
            {visibleMessages.map((message) => (
              <article key={message.id} className={`rounded-lg border px-2.5 py-1 hover:border-sky-200 ${darkChat ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-100 bg-white text-slate-950"}`}>
                <div className="flex items-start gap-2.5">
                  <button type="button" onClick={() => window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign: message.callsign } }))} className="mt-0.5 flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-slate-300 bg-slate-100 hover:ring-2 hover:ring-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400" aria-label={`Ver perfil de ${message.callsign}`} title={`Ver perfil de ${message.callsign}`}>
                    {profilePhotos[message.callsign.trim().toUpperCase()] ? <img src={profilePhotos[message.callsign.trim().toUpperCase()]} alt={`Foto de perfil de ${message.callsign}`} className="h-full w-full object-cover" /> : <span className="font-mono text-xs font-bold text-slate-500">{message.callsign.trim().slice(0, 3).toUpperCase()}</span>}
                  </button>
                  <div className="min-w-0 flex-1">
                {message.reply_to_callsign && <p className="mb-1 text-xs text-slate-500"><Reply className="mr-1 inline h-3 w-3" />Respuesta a {message.reply_to_callsign}</p>}
                <div className="break-words text-sm leading-[1.35]"><strong className={`font-mono font-extrabold uppercase ${["LU1TSB","LU1TSB/4RC978","RC978","4RC978"].includes(message.callsign.trim().toUpperCase()) ? "text-red-600" : darkChat ? "text-white" : "text-slate-950"}`}><button type="button" onClick={() => openPrivateMessage(message.callsign)} className="cursor-pointer underline decoration-dotted underline-offset-2 hover:text-sky-500" title={`Escribir mensaje privado a ${message.callsign}`}>{message.callsign}</button>:</strong><span className="ml-1" aria-label="Bandera del país" title="País estimado por prefijo de indicativo">{callsignCountryFlag(message.callsign)}</span>{isAdmin && message.callsign.trim().toUpperCase() !== 'LU1TSB' && <button type="button" onClick={() => setModeratorTargetSelected((current) => current === message.callsign.trim().toUpperCase() ? null : message.callsign.trim().toUpperCase())} className="ml-1 inline-flex rounded p-0.5 text-amber-600 hover:bg-amber-100" title="Opciones de administrador para este usuario" aria-label={`Opciones de administrador para ${message.callsign}`}><ShieldCheck className="h-3 w-3" /></button>} {parseDistanceShareImage(message.body) ? <DistanceShareMessage body={message.body} /> : <span className={darkChat ? "text-white" : "text-slate-800"}>{translatedBodies[appLanguage + ':' + message.id] || message.body}{translatedBodies[appLanguage + ':' + message.id] && translatedBodies[appLanguage + ':' + message.id] !== message.body && <span className="ml-1 align-super text-[9px] text-sky-500" title="Traducción automática según el idioma de tu aplicación">trad.</span>}</span>}
                {isAdmin && moderatorTargetSelected === message.callsign.trim().toUpperCase() && message.callsign.trim().toUpperCase() !== 'LU1TSB' && <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-950">
                  <span>Usuario: <strong>{message.callsign}</strong></span>
                  <button type="button" onClick={() => { openPrivateMessage(message.callsign); setModeratorTargetSelected(null); }} className="rounded-md bg-sky-700 px-3 py-1.5 font-bold text-white">Enviar mensaje privado</button>
                  <button type="button" disabled={moderationBusy} onClick={() => void applySanction(message.callsign, 'block')} className="rounded-md bg-rose-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">{moderationBusy ? 'Procesando…' : 'Bloquear'}</button>
                  <button type="button" disabled={moderationBusy} onClick={() => void appointModerator(message.callsign)} className="rounded-md bg-amber-800 px-3 py-1.5 font-bold text-white disabled:opacity-50">{moderationBusy ? 'Procesando…' : 'Designar como moderador'}</button>
                  <button type="button" onClick={() => setModeratorTargetSelected(null)} className="rounded-md px-2 py-1.5 font-semibold underline">Cancelar</button>
                </div>}</div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">{new Date(message.created_at).toLocaleString()}</span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setReplyTo(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-900"><Reply className="h-3 w-3" /> Responder</button>
                    {isModerator && <button type="button" disabled={deletingId === message.id} onClick={() => void deleteMessage(message)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50" aria-label={`Eliminar mensaje de ${message.callsign}`}><Trash2 className="h-3 w-3" /> {deletingId === message.id ? 'Eliminando…' : 'Borrar'}</button>}
                    {isModerator && message.callsign.trim().toUpperCase() !== (localStorage.getItem('community_chat_sd') || callsign).trim().toUpperCase() && <div className="flex flex-wrap gap-1">
                      <button type="button" disabled={moderationBusy} onClick={() => void applySanction(message.callsign, 'silence', 5)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50" title="Silenciar 5 minutos">Silenciar 5m</button>
                      <button type="button" disabled={moderationBusy} onClick={() => void applySanction(message.callsign, 'silence', 60)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50" title="Silenciar 1 hora">1h</button>
                      <button type="button" disabled={moderationBusy} onClick={() => void applySanction(message.callsign, 'silence', 10080)} className="rounded-md px-2 py-1 text-[10px] font-semibold text-amber-800 hover:bg-amber-50 disabled:opacity-50" title="Silenciar 7 días">7d</button>
                      <button type="button" disabled={moderationBusy || moderationTarget === message.callsign} onClick={() => void applySanction(message.callsign, 'block')} className="rounded-md px-2 py-1 text-[10px] font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-50" title="Bloquear el envío de mensajes">Bloquear</button>
                    </div>}
                  </div>
                </div>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {replyTo && <div className="flex items-center justify-between border-t border-slate-200 bg-sky-50 px-4 py-2 text-xs text-slate-700"><span>Respondiendo a <strong>{replyTo.callsign}</strong></span><button type="button" onClick={() => setReplyTo(null)} className="font-semibold underline">Cancelar</button></div>}
          <div className={`border-t p-3 sm:p-4 ${darkChat ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
            {!callsign && (
              <p className={`mb-3 rounded-xl border p-3 text-xs ${darkChat ? 'border-slate-700 bg-slate-800 text-slate-200' : 'border-slate-200 bg-white text-slate-700'}`}>
                Tu señal distintiva se valida una sola vez al instalar e ingresar a LogBook eQSL EXPRESS. Si no aparece aquí, recargá la aplicación para sincronizar tu identidad.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }} maxLength={500} placeholder="Escribí un mensaje…" className={`min-w-0 flex-1 rounded-xl border px-3 py-3 text-sm outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-100 ${darkChat ? "border-slate-600 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-900"}`} />
              <button type="button" onClick={() => void sendMessage()} disabled={busy || !draft.trim() || callsign.trim().length < 3} className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-sky-700 px-3 py-2 text-sm font-bold text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Enviar</span></button>
            </div>
          </div>
        </>
      )}
      {error && <div role="alert" className="border-t border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
      {isAdmin && adminNotice && <div role="status" className="border-t border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{adminNotice}</div>}


      {(moderationDialog || accountBlockedNotice) && <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-slate-950/80 p-4" role="alertdialog" aria-modal="true" aria-labelledby="chat-moderation-dialog-title"><section className="w-full max-w-md rounded-2xl border border-red-400 bg-slate-900 p-6 text-white shadow-2xl"><h2 id="chat-moderation-dialog-title" className="text-xl font-black text-red-300">{accountBlockedNotice ? 'Acceso bloqueado' : moderationDialog?.title}</h2><p className="mt-3 text-sm leading-relaxed text-slate-200">{accountBlockedNotice ? <>La SD/indicativo <strong>{blockedCallsign || callsign}</strong> está bloqueada y no puede ingresar a LogBook. Para regularizar la situación y solicitar la modificación de tu SD/indicativo, comunicate con la administración por correo.</> : moderationDialog?.body}</p><p className="mt-4 text-sm font-semibold">Correo de administración:</p><a className="block break-all text-sky-300 underline" href="mailto:lu1tsb.4rc978@gmail.com">lu1tsb.4rc978@gmail.com</a><p className="mt-4 text-sm font-semibold">Atentamente,<br/>La Administración de LogBook eQSL EXPRESS.</p>{accountBlockedNotice ? <a href="mailto:lu1tsb.4rc978@gmail.com?subject=Solicitud%20de%20modificacion%20de%20SD%20-%20LogBook" className="mt-5 block w-full rounded-xl bg-sky-600 px-4 py-3 text-center font-bold text-white">Contactar a la administración</a> : <button type="button" onClick={() => setModerationDialog(null)} className="mt-5 w-full rounded-xl bg-sky-600 px-4 py-3 font-bold text-white">Cerrar</button>}</section></div>}
      <div className={`flex justify-end border-t px-4 py-3 sm:px-5 ${darkChat ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`}>
        <button type="button" onClick={() => setChatCollapsed(true)} className="inline-flex items-center gap-2 rounded-lg border border-sky-500 bg-slate-800 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300" aria-label="Cerrar chat comunitario">
          Cerrar chat
        </button>
      </div>
      {supabase && <div className={`border-t px-4 py-3 sm:px-5 ${darkChat ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-slate-50'}`} aria-label="Indicativos en línea">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className={`text-xs font-bold ${darkChat ? 'text-slate-100' : 'text-slate-700'}`}>Indicativos en línea</h3>
          <span className={`text-[10px] ${darkChat ? 'text-slate-300' : 'text-slate-500'}`}>{visibleOnlineUsers.length}</span>
        </div>
        {visibleOnlineUsers.length > 0 ? <ul className="flex flex-wrap gap-2">
          {visibleOnlineUsers.map((user) => <li key={user.identityToken || user.callsign}><button type="button" onClick={() => openPrivateMessage(user.callsign)} aria-label={`Escribir mensaje privado a ${user.callsign}`} title={`Escribir mensaje privado a ${user.callsign}`} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs font-semibold transition hover:border-sky-400 hover:ring-2 hover:ring-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-400 ${darkChat ? 'border-slate-700 bg-slate-800 text-slate-100' : 'border-slate-200 bg-white text-slate-700'}`}><span aria-label="Bandera del país" title="País estimado por prefijo de indicativo">{callsignCountryFlag(user.callsign)}</span>{user.callsign}</button></li>)}
        </ul> : <p className={`text-xs ${darkChat ? 'text-slate-300' : 'text-slate-500'}`}>No hay indicativos conectados en este momento.</p>}
      </div>}
      </>}
    </section>
  );
};

```

## src/components/DistanceCalculator.tsx

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Calculator, Search, MapPin, X, Loader2, Share2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { getUserCallsign } from '../services/qrzService';
import { countryForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';
import { capitalPointForCountry, isValidMaidenheadLocator, maidenheadToPoint } from '../services/dxDistance';
import { openUserProfile } from './UserPublicProfile';
import { loadLeaflet } from '../services/leaflet';
import { DistanceShareModal } from './DistanceShareModal';

type Point = { lat: number; lon: number };
type Place = { name: string; lat: number; lon: number; type?: string };
async function searchPlaces(query: string): Promise<Place[]> {
  const clean = query.trim();
  if (!clean) return [];
  const requestJson = async (url: string, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json', 'Accept-Language': 'es,es-419;q=0.9,en;q=0.7' },
        signal: controller.signal,
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return await response.json();
    } finally { window.clearTimeout(timer); }
  };

  const nominatimParams = new URLSearchParams({
    q: clean, format: 'jsonv2', limit: '10', addressdetails: '1',
    'accept-language': 'es',
  });
  const photonParams = new URLSearchParams({ q: clean, limit: '10', lang: 'es' });

  // Consultar ambos geocodificadores en paralelo evita que un proveedor lento
  // impida obtener resultados del otro y amplía las coincidencias mundiales.
  const [nomResult, photonResult] = await Promise.allSettled([
    requestJson('https://nominatim.openstreetmap.org/search?' + nominatimParams.toString()),
    requestJson('https://photon.komoot.io/api/?' + photonParams.toString()),
  ]);

  const places: Place[] = [];
  if (nomResult.status === 'fulfilled' && Array.isArray(nomResult.value)) {
    for (const row of nomResult.value) {
      const address = row.address || {};
      const primary = row.name || row.namedetails?.name || String(row.display_name || '').split(',')[0];
      const locality = address.city || address.town || address.village || address.municipality || address.county;
      const region = address.state || address.region || address.province;
      const country = address.country;
      const label = [primary, locality && locality !== primary ? locality : '', region, country]
        .filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(', ');
      const lat = Number(row.lat), lon = Number(row.lon);
      if (label && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        places.push({ name: label, lat, lon, type: String(row.type || row.class || '') });
      }
    }
  }
  if (photonResult.status === 'fulfilled' && Array.isArray(photonResult.value?.features)) {
    for (const feature of photonResult.value.features) {
      const props = feature?.properties || {};
      const coords = feature?.geometry?.coordinates || [];
      const primary = props.name || props.street || props.locality || clean;
      const label = [primary, props.city, props.state, props.country]
        .filter(Boolean).filter((part, index, all) => all.indexOf(part) === index).join(', ');
      const lat = Number(coords[1]), lon = Number(coords[0]);
      if (label && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
        places.push({ name: label, lat, lon, type: String(props.type || '') });
      }
    }
  }

  // Quitar duplicados entre proveedores, conservando nombres con país y región.
  const unique = new Map<string, Place>();
  for (const place of places) {
    const key = place.name.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim() + ':' +
      place.lat.toFixed(3) + ':' + place.lon.toFixed(3);
    if (!unique.has(key)) unique.set(key, place);
  }
  const normalizedQuery = clean.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
  return [...unique.values()]
    .sort((a, b) => {
      const score = (place: Place) => {
        const name = place.name.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
        return name.split(',')[0].trim() === normalizedQuery ? 0 : name.startsWith(normalizedQuery) ? 1 : name.includes(normalizedQuery) ? 2 : 3;
      };
      return score(a) - score(b) || a.name.localeCompare(b.name);
    })
    .slice(0, 15);
}
function distanceKm(a: Point, b: Point) {
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b.lat-a.lat), dLon = rad(b.lon-a.lon);
  const h = Math.sin(dLat/2)**2 + Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLon/2)**2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
function pointToMaidenhead(point: Point): string {
  let lon = point.lon + 180;
  let lat = point.lat + 90;
  const fieldLon = Math.floor(lon / 20);
  const fieldLat = Math.floor(lat / 10);
  let locator = String.fromCharCode(65 + fieldLon, 65 + fieldLat);
  lon -= fieldLon * 20;
  lat -= fieldLat * 10;
  const squareLon = Math.floor(lon / 2);
  const squareLat = Math.floor(lat);
  locator += String(squareLon) + String(squareLat);
  lon -= squareLon * 2;
  lat -= squareLat;
  const subLon = Math.min(23, Math.floor(lon * 12));
  const subLat = Math.min(23, Math.floor(lat * 24));
  locator += String.fromCharCode(97 + subLon, 97 + subLat);
  return locator.toUpperCase();
}
function bearingDegrees(a: Point, b: Point) {
  const rad = (v: number) => v * Math.PI / 180;
  const y = Math.sin(rad(b.lon-a.lon)) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat))*Math.sin(rad(b.lat)) - Math.sin(rad(a.lat))*Math.cos(rad(b.lat))*Math.cos(rad(b.lon-a.lon));
  return (Math.atan2(y,x) * 180 / Math.PI + 360) % 360;
}
const DistanceMap: React.FC<{ origin: Point; destination: Place | null; focusPlace: Place | null; originLabel: string; onDestinationChange: (place: Place | null) => void; onShareHandlerChange: (handler: (() => void) | null) => void }> = ({ origin, destination, focusPlace, originLabel, onDestinationChange, onShareHandlerChange }) => {
  const element = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layersRef = useRef<any>(null);
  const changeRef = useRef(onDestinationChange);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState('');
  const [showShareModal, setShowShareModal] = useState(false);
  const [radioRecipients, setRadioRecipients] = useState<string[]>([]);
  const [elevenMeterRecipients, setElevenMeterRecipients] = useState<string[]>([]);
  const [allowRecipientTypeChoice, setAllowRecipientTypeChoice] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);
  const [recipientError, setRecipientError] = useState('');
  useEffect(() => { changeRef.current = onDestinationChange; }, [onDestinationChange]);

  // Crear Leaflet una sola vez. Cambiar el destino actualiza capas, nunca
  // destruye/recrea el mapa ni su SVG (evita el error parentNode de Leaflet).
  useEffect(() => {
    let cancelled = false;
    let map: any = null;
    let resizeTimer = 0;
    void loadLeaflet().then((L) => {
      if (cancelled || !element.current) return;
      map = L.map(element.current, {
        zoomControl: true, scrollWheelZoom: true, dragging: true,
        touchZoom: true, doubleClickZoom: true, worldCopyJump: true,
        minZoom: 2, maxZoom: 19,
      });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, crossOrigin: true, noWrap: false,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      layersRef.current = L.layerGroup().addTo(map);
      map.on('click', (event: any) => {
        const lat = Math.max(-85.05112878, Math.min(85.05112878, event.latlng.lat));
        const lon = Math.max(-180, Math.min(180, event.latlng.lng));
        changeRef.current({ name: 'Punto seleccionado en el mapa', lat, lon });
      });
      resizeTimer = window.setTimeout(() => {
        if (!cancelled && map && map.getContainer()) map.invalidateSize();
      }, 120);
      setMapReady(true);
      setError('');
    }).catch(reason => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo abrir el mapa.');
    });
    return () => {
      cancelled = true;
      if (resizeTimer) window.clearTimeout(resizeTimer);
      const current = map;
      mapRef.current = null;
      layersRef.current = null;
      if (current) {
        try {
          current.off();
          if (current.getContainer?.()) current.remove();
        } catch (cleanupError) {
          console.warn('Leaflet cleanup (distance map):', cleanupError);
        }
      }
    };
  }, []);

  // Repintar únicamente los elementos geográficos. El objeto mapa permanece vivo.
  useEffect(() => {
    const map = mapRef.current;
    const layers = layersRef.current;
    const L = (window as any).L;
    if (!mapReady || !map || !layers || !L) return;
    layers.clearLayers();
    const a: [number, number] = [origin.lat, origin.lon];
    L.marker(a).addTo(layers)
      .bindPopup('Origen: ' + originLabel)
      .bindTooltip('TU ESTACIÓN · ' + originLabel, { direction: 'top', offset: [0, -10], opacity: 0.95 });
    if (destination) {
      const b: [number, number] = [destination.lat, destination.lon];
      L.marker(b, { draggable: true }).addTo(layers)
        .bindPopup('Destino: ' + destination.name)
        .bindTooltip(destination.name, { direction: 'top', offset: [0, -10], opacity: 0.95 })
        .on('dragend', (event: any) => {
          const point = event.target.getLatLng();
          changeRef.current({ name: 'Punto seleccionado en el mapa', lat: point.lat, lon: point.lng });
        });
      L.polyline([a, b], { color: '#fff000', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(layers).bringToFront();
      map.fitBounds(L.latLngBounds([a, b]), { padding: [55, 55], maxZoom: 12 });
    } else if (focusPlace) {
      L.circleMarker([focusPlace.lat, focusPlace.lon], {
        radius: 8, color: '#facc15', weight: 3, fillColor: '#facc15', fillOpacity: 0.85,
      }).addTo(layers).bindPopup('Zona buscada: ' + focusPlace.name);
      map.setView([focusPlace.lat, focusPlace.lon], 12);
    } else {
      map.setView([20, 0], 2);
    }
  }, [mapReady, origin.lat, origin.lon, originLabel, destination?.lat, destination?.lon, destination?.name, focusPlace?.lat, focusPlace?.lon, focusPlace?.name]);

  const km = destination ? distanceKm(origin, destination) : null;
  const bearing = destination ? bearingDegrees(origin, destination) : null;
  const locator = destination ? pointToMaidenhead(destination) : '';
  const openShareModal = async () => {
    if (!destination || km === null) return;
    setRecipientError('');
    setLoadingRecipients(true);
    try {
      const token = (localStorage.getItem('community_chat_identity_token') || '').trim();
      if (!token) throw new Error('Validá tu SD o indicativo antes de compartir.');
      const response = await fetch('/api/directory?action=lookup', {
        method: 'GET', cache: 'no-store', headers: { 'x-identity-token': token },
      });
      const result = await response.json();
      if (!response.ok || !Array.isArray(result.users)) {
        throw new Error(result.error || 'No se pudo cargar la lista de destinatarios.');
      }
      const normalizeId = (value: unknown) => String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      // Las SD de 11 m tienen división numérica + letras + sufijo numérico
      // (p. ej. 4RC978 o 34RC879); los indicativos de radioaficionado
      // conservan su formato alfanumérico habitual (p. ej. LU1TSB o 3G1ABC).
      const is11mId = (value: string) => /^\\d{1,3}[A-Z]{1,3}\\d{2,4}$/.test(normalizeId(value));
      const ownIds = Array.from(new Set([
        normalizeId(localStorage.getItem('community_chat_active_callsign')),
        normalizeId(localStorage.getItem('community_chat_sd')),
        normalizeId(getUserCallsign()),
      ].filter(Boolean)));
      const ownHas11m = ownIds.some(is11mId);
      const ownHasRadio = ownIds.some(value => !is11mId(value));
      const dualIdentity = ownHas11m && ownHasRadio;
      const users = Array.from(new Set(result.users
        .map((item: any) => String(item?.callsign || '').trim().toUpperCase())
        .filter((callsign: string) => callsign && !ownIds.includes(normalizeId(callsign)) && /^[A-Z0-9][A-Z0-9/]{2,39}$/.test(callsign))));
      const radio = users.filter((callsign: string) => !is11mId(callsign)).sort();
      const eleven = users.filter((callsign: string) => is11mId(callsign)).sort();
      setRadioRecipients(ownHasRadio && !dualIdentity ? radio : dualIdentity ? radio : []);
      setElevenMeterRecipients(ownHas11m && !dualIdentity ? eleven : dualIdentity ? eleven : []);
      setAllowRecipientTypeChoice(dualIdentity || (!ownHasRadio && !ownHas11m));
      setShowShareModal(true);
    } catch (reason) {
      setRecipientError(reason instanceof Error ? reason.message : 'No se pudo preparar el menú para compartir.');
    } finally {
      setLoadingRecipients(false);
    }
  };
  useEffect(() => {
    onShareHandlerChange(() => () => { void openShareModal(); });
    return () => onShareHandlerChange(null);
  }, [onShareHandlerChange, destination?.lat, destination?.lon, loadingRecipients]);
  return <div className="mt-3 overflow-hidden rounded-xl border border-slate-600">
    <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-800 px-3 py-3 text-sm text-white">
      {destination && km !== null ? <div className="flex flex-wrap gap-x-5 gap-y-1"><span><strong>{km.toLocaleString('es-ES',{maximumFractionDigits:1})} km</strong></span><span><strong>{(km/1.609344).toLocaleString('es-ES',{maximumFractionDigits:1})} mi</strong></span><span>Rumbo: <strong>{bearing!.toFixed(0)}°</strong></span></div> : <strong className="text-cyan-200">Mapa mundial: tocá cualquier punto para medir</strong>}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => mapRef.current?.setView([20, 0], 2)} className="rounded-lg border border-slate-500 px-3 py-2 text-xs font-bold hover:bg-slate-700">Ver todo el mundo</button>
      </div>
    </div>
    <div ref={element} className="h-[36dvh] min-h-[260px] w-full bg-slate-800" />

    
    {destination && <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-900 px-3 py-3 text-xs text-slate-200"><span>Destino: {destination.name} · {destination.lat.toFixed(5)}, {destination.lon.toFixed(5)} · Grid: <strong className="font-mono text-cyan-300">{locator}</strong></span><button type="button" onClick={() => onDestinationChange(null)} className="rounded-lg border border-slate-600 px-3 py-1.5 font-semibold hover:bg-slate-800">Limpiar destino</button></div>}
    {recipientError && <p role="alert" className="bg-slate-900 px-3 pb-2 text-xs text-rose-300">{recipientError}</p>}
    {showShareModal && destination && km !== null && <DistanceShareModal onClose={() => setShowShareModal(false)} captureElement={() => element.current} firstCallsign={originLabel} secondCallsign={destination.name} distanceKm={km} radioRecipients={radioRecipients} elevenMeterRecipients={elevenMeterRecipients} allowRecipientTypeChoice={allowRecipientTypeChoice} />}\n    <p className="bg-slate-900 px-3 py-2 text-[11px] text-slate-400">Desplazate por todo el planeta, acercá o alejá y tocá cualquier lugar. También podés arrastrar el marcador. La distancia se mide en línea recta desde tu estación.</p>
    {error && <p className="bg-slate-900 px-3 pb-3 text-xs text-amber-300">{error}</p>}
  </div>;
};

type RegisteredStation = { callsign: string; grid_locator: string; lat: number; lon: number };
const RegisteredGridStations: React.FC<{ origin: Point | null; destination: Place | null; onOpenProfile: (callsign: string) => void }> = ({ origin, destination, onOpenProfile }) => {
  const mapElement = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const routeLayerRef = useRef<any>(null);
  const [stations, setStations] = useState<RegisteredStation[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError('');
      try {
        const token = localStorage.getItem('community_chat_identity_token') || '';
        if (!token) throw new Error('Validá tu SD o indicativo para consultar las estaciones registradas.');
        const response = await fetch('/api/directory?action=grid-map', {
          headers: { 'x-identity-token': token }, cache: 'no-store'
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el directorio de estaciones.');
        const unique = new Map<string, RegisteredStation>();
        for (const row of Array.isArray(payload?.stations) ? payload.stations : []) {
          const callsign = String(row?.callsign || '').trim().toUpperCase();
          const grid = String(row?.grid_locator || '').trim().toUpperCase();
          const point = isValidMaidenheadLocator(grid) ? maidenheadToPoint(grid) : null;
          if (callsign && point) unique.set(callsign, { callsign, grid_locator: grid, lat: point.lat, lon: point.lon });
        }
        if (active) setStations([...unique.values()].sort((a,b) => a.callsign.localeCompare(b.callsign)));
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las estaciones.');
      } finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!mapElement.current || !stations.length) return;
    let map: any, cancelled = false;
    void loadLeaflet().then(L => {
      if (cancelled || !mapElement.current) return;
      map = L.map(mapElement.current, { zoomControl: true, scrollWheelZoom: true, dragging: true, touchZoom: true });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap' }).addTo(map);
      routeLayerRef.current = L.layerGroup().addTo(map);
      setMapReady(true);
      const bounds: [number, number][] = [];
      for (const station of stations) {
        const coords: [number, number] = [station.lat, station.lon];
        bounds.push(coords);
        const marker = L.marker(coords).addTo(map);
        marker.bindPopup('<strong>' + station.callsign + '</strong><br>Grid: ' + station.grid_locator + '<br><button type="button" class="grid-station-profile">Ver perfil</button>');
        marker.on('popupopen', (event: any) => {
          const button = event.popup?.getElement()?.querySelector('.grid-station-profile') as HTMLButtonElement | null;
          if (!button) return;
          button.addEventListener('click', (clickEvent) => {
            clickEvent.preventDefault();
            clickEvent.stopPropagation();
            onOpenProfile(station.callsign);
          }, { once: true });
        });
      }
      if (origin) {
        const originCoords: [number, number] = [origin.lat, origin.lon];
        bounds.push(originCoords);
        L.marker(originCoords).addTo(map).bindPopup('Tu estación (origen)');
      }
      if (bounds.length > 1) {
        map.fitBounds(L.latLngBounds(bounds), { padding: [45,45], maxZoom: 8 });
      } else if (bounds.length === 1) {
        map.setView(bounds[0], 6);
      }
      window.setTimeout(() => { if (!cancelled && map) map.invalidateSize(); }, 120);
    }).catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'No se pudo cargar el mapa.'); });
    return () => {
      cancelled = true;
      mapRef.current = null;
      routeLayerRef.current = null;
      setMapReady(false);
      if (map) {
        try { map.off(); map.remove(); } catch (cleanupError) {
          console.warn('Leaflet cleanup (registered stations map):', cleanupError);
        }
      }
    };
  }, [stations]);


  // La ruta se actualiza en su propia capa; no se desmonta el mapa de estaciones.
  useEffect(() => {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    const L = (window as any).L;
    if (!map || !routeLayer || !L) return;
    routeLayer.clearLayers();
    if (!origin || !destination) return;
    const a: [number, number] = [origin.lat, origin.lon];
    const b: [number, number] = [destination.lat, destination.lon];
    L.marker(b).addTo(routeLayer).bindPopup('Destino seleccionado: ' + destination.name);
    L.polyline([a, b], { color: '#ffea00', weight: 7, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(routeLayer).bringToFront();
    map.fitBounds(L.latLngBounds([a, b]), { padding: [45, 45], maxZoom: 8 });
  }, [mapReady, origin?.lat, origin?.lon, destination?.lat, destination?.lon, destination?.name]);

  return <div className="mt-4 rounded-xl border border-slate-700 bg-slate-950 p-3">
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <div><h3 className="font-bold text-cyan-200">Estaciones registradas con Grid Locator</h3><p className="text-xs text-slate-400">Tocá una SD o indicativo para abrir su perfil público.</p></div>
      {!loading && !error && <strong className="text-sm text-cyan-300">{stations.length} estaciones</strong>}
    </div>
    {loading ? <p className="text-sm text-slate-300">Buscando estaciones registradas…</p> : error ? <p className="text-sm text-amber-300">{error}</p> : stations.length === 0 ? <p className="text-sm text-slate-400">Todavía no hay estaciones con Grid Locator válido.</p> : <>
      <div ref={mapElement} className="mb-3 h-[38dvh] min-h-[230px] w-full overflow-hidden rounded-lg bg-slate-800" />
      <details className="rounded-lg border border-slate-700 bg-slate-900">
        <summary className="cursor-pointer list-none px-3 py-3 text-sm font-bold text-cyan-200">Ver estaciones registradas ({stations.length}) <span className="float-right text-slate-400">＋</span></summary>
        <div className="max-h-64 space-y-1 overflow-y-auto border-t border-slate-700 p-2">
          {stations.map(station => <button key={station.callsign} type="button" onClick={() => onOpenProfile(station.callsign)} className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-800 px-3 py-2 text-left hover:border-cyan-500/60 hover:bg-slate-950">
            <span className="min-w-0"><strong className="block truncate font-mono text-sm">{station.callsign}</strong><span className="text-xs text-slate-400">Grid: {station.grid_locator}</span></span><span className="shrink-0 text-xs font-bold text-cyan-300">Ver perfil</span>
          </button>)}
        </div>
        <div className="flex justify-end border-t border-slate-700 p-2"><button type="button" className="lb-disclosure-close" onClick={(event) => { const panel = event.currentTarget.closest('details'); if (panel) panel.open = false; }}>CERRAR</button></div>
      </details>
    </>}
  </div>;
};

export const DistanceCalculator: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [originLabel, setOriginLabel] = useState('');
  const [originLoading, setOriginLoading] = useState(false);
  const [originError, setOriginError] = useState('');
  const [needsGridLocator, setNeedsGridLocator] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [selected, setSelected] = useState<Place | null>(null);
  const [mapFocus, setMapFocus] = useState<Place | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [shareAction, setShareAction] = useState<(() => void) | null>(null);

  useEffect(() => {
    if (!open || origin || originLoading) return;
    let active = true;
    const loadOrigin = async () => {
      setOriginLoading(true); setOriginError('');
      try {
        const callsign = String(localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || getUserCallsign() || localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
        const is11m = is11MeterStationIdentifier(callsign);
        const savedCountry = localStorage.getItem('user_country') || localStorage.getItem('cb_station_country') || undefined;
        const country = countryForCallsign(callsign, savedCountry, is11m);
        const localGrid = String(localStorage.getItem('user_grid_locator') || '').trim().toUpperCase();
        const localGridPoint = isValidMaidenheadLocator(localGrid) ? maidenheadToPoint(localGrid) : null;
        if (localGridPoint) {
          if (active) { setOrigin(localGridPoint); setOriginLabel('Tu estación · ' + localGrid); setNeedsGridLocator(false); }
          return;
        }
        if (active) setNeedsGridLocator(true);

        // La capital está precargada localmente: no se espera a servicios geográficos externos.
        const capital = capitalPointForCountry(country);
        if (!capital) throw new Error(country ? 'No hay una capital configurada para ' + country + '.' : 'No se pudo identificar el país a partir de tu SD o indicativo.');
        if (active) {
          setOrigin(capital);
          setOriginLabel('Capital de ' + country);
          setOriginLoading(false);
        }

        // En otro dispositivo puede existir un Grid guardado en el servidor.
        // Se consulta en segundo plano; el mapa ya tiene una ubicación inmediata.
        const token = localStorage.getItem('community_chat_identity_token') || '';
        if (callsign && token && supabase) {
          const { data, error } = await supabase.from('live_spot_grid_locators').select('grid_locator').eq('callsign', callsign).maybeSingle();
          const remoteGrid = String(data?.grid_locator || '').trim().toUpperCase();
          const remotePoint = !error && isValidMaidenheadLocator(remoteGrid) ? maidenheadToPoint(remoteGrid) : null;
          if (active && remotePoint) {
            setOrigin(remotePoint);
            setOriginLabel('Tu estación · ' + remoteGrid);
            setNeedsGridLocator(false);
            try { localStorage.setItem('user_grid_locator', remoteGrid); } catch { /* El dato remoto sigue siendo válido. */ }
          } else if (active) setNeedsGridLocator(true);
        }
      } catch (e) {
        if (active) setOriginError(e instanceof Error ? e.message : 'No se pudo determinar tu ubicación inicial.');
      } finally { if (active) setOriginLoading(false); }
    };
    void loadOrigin();
    return () => { active = false; };
  }, [open]);

  const runSearch = async () => {
    const term = query.trim();
    if (term.length < 2) { setSearchError('Escribí al menos dos caracteres para buscar un lugar.'); return; }
    setSearching(true); setSearchError(''); setSelected(null);
    try {
      let found = await searchPlaces(term);
      // Corregir errores tipográficos frecuentes antes de informar que no hay resultados.
      // "quebeq" es una escritura habitual por error de "Quebec".
      const normalizedTerm = term.normalize('NFD').replace(/[\\u0300-\\u036f]/g, '').toLowerCase();
      const typoCorrections: Record<string, string> = { quebeq: 'Quebec' };
      if (found.length === 0 && typoCorrections[normalizedTerm]) {
        found = await searchPlaces(typoCorrections[normalizedTerm]);
      }
      setResults(found);
      if (found.length === 1) {
        // Si hay una sola coincidencia inequívoca, seleccionarla permite medir
        // inmediatamente. Si hay varias, nunca elegir una ubicación por el usuario.
        setMapFocus(found[0]);
        setSelected(found[0]);
      } else if (found.length > 1) {
        setSelected(null);
        setMapFocus(null);
      } else setSearchError('No se encontraron coincidencias para «' + term + '». Probá agregando el país o una región.');
    } catch (e) { setSearchError(e instanceof Error ? e.message : 'No se pudo realizar la búsqueda.'); }
    finally { setSearching(false); }
  };

  return <>
    <section className="mb-5 overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-md">
      <button type="button" onClick={() => setOpen(true)} className="flex min-h-[56px] w-full min-w-0 items-center gap-2 bg-slate-900 px-3 py-2.5 text-left text-white hover:bg-slate-800/80">
        <Calculator className="h-5 w-5 shrink-0 text-cyan-300" />
        <span className="text-sm font-bold sm:text-base">CALCULADOR DE DISTANCIA</span>
      </button>
    </section>
    {open && <div className="fixed inset-0 z-[11020] flex items-center justify-center bg-slate-950/90 p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Calculador de distancia" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
      <section className="flex max-h-[95dvh] w-full max-w-4xl flex-col overflow-y-auto rounded-2xl border border-cyan-500/50 bg-slate-900 p-4 text-white shadow-2xl">
        <header className="mb-3 flex items-center justify-between gap-3"><div><h2 className="font-black">CALCULADOR DE DISTANCIA</h2><p className="text-xs text-slate-400">Medición en línea recta entre dos lugares del mundo.</p></div><button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-slate-800" aria-label="Cerrar"><X className="h-5 w-5" /></button></header>
        <div className="rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm"><p className="mb-1 font-bold text-cyan-200">Tu ubicación de origen</p>{originLoading ? <span className="flex items-center gap-2 text-slate-300"><Loader2 className="h-4 w-4 animate-spin" />Localizando tu Grid Locator o la capital de tu país…</span> : origin ? <><p>{originLabel}</p><p className="mt-1 text-[11px] text-slate-400">Si tenés un Grid Locator guardado se utiliza el centro de esa cuadrícula; de lo contrario se usa la capital de tu país.</p></> : <p className="text-amber-300">{originError || 'No se pudo determinar la ubicación de origen.'}</p>}</div>
        {needsGridLocator && <div className="mt-3 rounded-xl border border-amber-400/50 bg-amber-950/40 p-3">
          <p className="text-sm font-bold text-amber-200">Completá tu Grid Locator para obtener mediciones de distancia más exactas.</p>
          <p className="mt-1 text-xs text-slate-300">Sin este dato, la ubicación de origen se estima usando la capital de tu país.</p>
          <button type="button" onClick={() => { localStorage.setItem('focus_user_grid_locator', '1'); window.dispatchEvent(new Event('open-user-settings-grid')); }} className="mt-2 rounded-lg bg-amber-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-amber-300">Completar mi Grid Locator</button>
        </div>}
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={e => { e.preventDefault(); void runSearch(); }}>
          <label className="sr-only" htmlFor="distance-place-search">Lugar de destino</label><input id="distance-place-search" value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void runSearch(); } }} placeholder="Escribí una ciudad, localidad o lugar del mundo…" className="min-w-0 flex-1 rounded-lg border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white placeholder:text-slate-500" />
          <button type="submit" disabled={searching} className="flex items-center justify-center gap-2 rounded-lg bg-cyan-700 px-4 py-3 text-sm font-bold hover:bg-cyan-600 disabled:opacity-50">{searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}{searching ? 'Buscando…' : 'Buscar lugar'}</button>
        </form>
        {searching && <p role="status" className="mt-2 text-xs text-cyan-200">Buscando el lugar en el mapa mundial…</p>}{searchError && <p role="alert" className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/30 p-2 text-xs text-amber-200">{searchError}</p>}
        {selected && origin && <div role="status" className="mt-3 rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3">
          <p className="text-sm font-black text-emerald-200">MEDICIÓN CALCULADA</p>
          <p className="mt-1 text-sm">{originLabel} → {selected.name}</p>
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-base font-black">
            <span>{distanceKm(origin, selected).toLocaleString('es-ES', { maximumFractionDigits: 1 })} km</span>
            <span>{(distanceKm(origin, selected) / 1.609344).toLocaleString('es-ES', { maximumFractionDigits: 1 })} millas</span>
            <span>Rumbo {bearingDegrees(origin, selected).toFixed(0)}°</span>
          </div>
          <p className="mt-1 text-xs text-slate-300">Grid Locator destino: {pointToMaidenhead(selected).toUpperCase()} · {selected.lat.toFixed(5)}, {selected.lon.toFixed(5)}</p>
        </div>}
        {results.length > 0 && <div className="mt-2 rounded-lg border border-cyan-500/40 bg-slate-950 p-2">
          <p className="px-2 pb-2 text-xs font-bold text-cyan-200">{results.length} coincidencias encontradas. Elegí el lugar correcto:</p>
          <div className="max-h-52 space-y-1 overflow-y-auto">{results.map((place, index) => <button type="button" key={place.name + place.lat + place.lon + index} onClick={() => { setMapFocus(place); setSelected(place); setResults([]); }} className="flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-2 text-left text-sm hover:border-cyan-500/50 hover:bg-slate-800"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" /><span className="min-w-0"><strong className="block">{place.name}</strong><span className="text-[11px] text-slate-400">{place.lat.toFixed(4)}, {place.lon.toFixed(4)}</span></span></button>)}</div>
        </div>}
        {origin && <>
          <DistanceMap origin={origin} destination={selected} focusPlace={mapFocus} originLabel={originLabel} onDestinationChange={setSelected} onShareHandlerChange={setShareAction} />
          <div id="distance-share-action" className="mt-2 rounded-xl border-2 border-cyan-300 bg-slate-950 p-3 shadow-lg shadow-cyan-950/40">
            <button type="button" onClick={() => shareAction?.()} disabled={!selected || !shareAction} className="inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-4 text-base font-black tracking-wide text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"><Share2 className="h-5 w-5" /> COMPARTIR DISTANCIA</button>
            {!selected && <p className="mt-2 text-center text-xs text-slate-300">Seleccioná un destino en el buscador o tocá un punto del mapa para habilitar el envío.</p>}
          </div>
        </>}
        <RegisteredGridStations origin={origin} destination={selected} onOpenProfile={(callsign) => { setOpen(false); window.setTimeout(() => { openUserProfile(callsign); }, 80); }} />
        <div className="sticky bottom-0 z-20 mt-4 -mx-4 border-t border-cyan-500/50 bg-slate-900/95 px-4 py-3 shadow-[0_-8px_20px_rgba(2,6,23,0.65)] backdrop-blur">
          <button type="button" onClick={() => setOpen(false)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-cyan-300 bg-cyan-900 px-4 py-3 text-sm font-black tracking-wide text-white hover:bg-cyan-800">
            <X className="h-5 w-5" /> CERRAR MEDIDOR
          </button>
        </div>
      </section>
    </div>}
  </>;
};

```

## src/App.tsx

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { QSO, DEFAULT_CALLSIGN } from './types';
import { Header } from './components/Header';
import { Footer } from './components/Footer';
import { NewQSOForm } from './components/NewQSOForm';
import { LiveLog } from './components/LiveLog';
import { UserSettingsModal } from './components/UserSettingsModal';
import { EQSLCardModal } from './components/EQSLCardModal';
import { ReplyEQSLModal } from './components/ReplyEQSLModal';
import { ReceivedEQSLPage } from './components/ReceivedEQSLPage';
import { EQSLViewErrorBoundary } from './components/EQSLViewErrorBoundary';
import { EQSLMailbox } from './components/EQSLMailbox';
import { PendingEqslDeliveries } from './components/PendingEqslDeliveries';
import { Send, Waves, ExternalLink, RadioTower } from 'lucide-react';
import { CommunityChat } from './components/CommunityChat';
import { MorseDecoder } from './components/MorseDecoder';
import { SDRSmart } from './components/SDRSmart';
import { PrivateMessages } from './components/PrivateMessages';
import { LiveSpots, publishQsoSpot } from './components/LiveSpots';
import { DistanceCalculator } from './components/DistanceCalculator';
import { EventsAndContests } from './components/EventsAndContests';
import { startAutomaticUiTranslation } from './services/appLanguage';
import { getUserCallsign } from './services/qrzService';
import { InitialSdValidation } from './components/InitialSdValidation';
import { PropagationReport } from './components/PropagationReport';
import { PatentGenerator } from './components/PatentGenerator';
import { UserDirectory } from './components/UserDirectory';
import { UserPublicProfile } from './components/UserPublicProfile';
import { GridLocatorReminder } from './components/GridLocatorReminder';
import { RadioPrefixLookup, openRadioPrefixLookup } from './components/RadioPrefixLookup';
import { PatentDownloadedPage, PatentSharePage } from './components/PatentSharePage';


interface ContestLogRecord { id: string; name: string; type: string; finishedAt: string; qsos?: QSO[]; }
interface LLOTAActivityLog { id: string; name: string; reference: string; activityType: string; startedAt: string; finishedAt: string; qsos: QSO[]; }

const QSO_BACKUP_DB = 'logbook-offline-qso';
const QSO_BACKUP_STORE = 'qsos';

const openQsoBackupDb = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) { reject(new Error('IndexedDB no disponible')); return; }
  const request = indexedDB.open(QSO_BACKUP_DB, 1);
  request.onupgradeneeded = () => {
    if (!request.result.objectStoreNames.contains(QSO_BACKUP_STORE)) {
      request.result.createObjectStore(QSO_BACKUP_STORE);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('No se pudo abrir el respaldo del Libro de Guardia'));
});

const saveQsoBackup = async (qsos: QSO[]) => {
  const db = await openQsoBackupDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(QSO_BACKUP_STORE, 'readwrite');
    tx.objectStore(QSO_BACKUP_STORE).put(qsos, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('No se pudo guardar el respaldo de QSO'));
    tx.onabort = () => reject(tx.error || new Error('Se canceló el respaldo de QSO'));
  });
  db.close();
};

const loadQsoBackup = async (): Promise<QSO[] | null> => {
  const db = await openQsoBackupDb();
  try {
    return await new Promise<QSO[] | null>((resolve, reject) => {
      const request = db.transaction(QSO_BACKUP_STORE, 'readonly').objectStore(QSO_BACKUP_STORE).get('current');
      request.onsuccess = () => resolve(Array.isArray(request.result) ? request.result as QSO[] : null);
      request.onerror = () => reject(request.error || new Error('No se pudo leer el respaldo de QSO'));
    });
  } finally {
    db.close();
  }
};
function MainApp() {
  const [qsos, setQsos] = useState<QSO[]>(() => {
    const saved = localStorage.getItem('logbook_qsos');
    if (saved) {
      try {
        return (JSON.parse(saved) as QSO[]).filter((q) => !['qso-1', 'qso-2', 'qso-3'].includes(q.id));
      } catch (e) {
        console.error('Error reading logbook_qsos', e);
      }
    }
    return [];
  });

  // IndexedDB mantiene una segunda copia persistente del log para poder
  // recuperarlo si localStorage se borra, se corrompe o el navegador lo bloquea.
  useEffect(() => {
    let active = true;
    let localLogIsValid = false;
    try {
      const raw = localStorage.getItem('logbook_qsos');
      if (raw) {
        const parsed = JSON.parse(raw);
        localLogIsValid = Array.isArray(parsed);
      }
    } catch { /* Intentar recuperar la copia durable de IndexedDB. */ }

    if (!localLogIsValid) {
      void loadQsoBackup().then((backup) => {
        if (!active || !backup) return;
        const safeBackup = backup.filter((q) => q && typeof q.id === 'string' && typeof q.callsign === 'string');
        setQsos(safeBackup);
        try { localStorage.setItem('logbook_qsos', JSON.stringify(safeBackup)); } catch { /* IndexedDB conserva la copia. */ }
      }).catch((error) => console.warn('No se pudo recuperar el respaldo local de QSO:', error));
    }
    return () => { active = false; };
  }, []);

  const [contestLogs, setContestLogs] = useState<ContestLogRecord[]>(() => {
    try { return JSON.parse(localStorage.getItem('logbook_contest_logs') || '[]') as ContestLogRecord[]; }
    catch { return []; }
  });
  const [llotaLogs, setLLOTALogs] = useState<LLOTAActivityLog[]>(() => { try { return JSON.parse(localStorage.getItem('logbook_llota_activity_logs') || '[]') as LLOTAActivityLog[]; } catch { return []; } });
  const handleFinishLLOTA = (log: Omit<LLOTAActivityLog, 'qsos'>): boolean => {
    const snapshot = qsos.filter(q => q.llotaActivityId === log.id).map(q => ({ ...q }));
    if (!snapshot.length) { window.alert('No se encontraron QSO de esta actividad. La referencia seguirá activa para proteger los datos.'); return false; }
    const archived: LLOTAActivityLog = { ...log, qsos: snapshot, name: log.name || log.reference };
    const updated = [archived, ...llotaLogs.filter(item => item.id !== log.id)];
    try {
      localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(updated));
      const check = JSON.parse(localStorage.getItem('logbook_llota_activity_logs') || '[]') as LLOTAActivityLog[];
      const saved = check.find(item => item.id === log.id);
      if (!saved || saved.qsos?.length !== snapshot.length) throw new Error('Verificación de archivo fallida');
      setLLOTALogs(updated);
      return true;
    } catch (error) { console.error(error); window.alert('No se pudo verificar el archivo LLOTA. La actividad sigue activa.'); return false; }
  };
  const handleFinishContest = (log: ContestLogRecord): boolean => {
    // No cerrar el concurso si no podemos confirmar que hay QSO asociados y archivados.
    const snapshot = qsos
      .filter((q) => q.contestLogId === log.id || q.contestLogName === log.name)
      .map((q) => ({ ...q }));
    if (snapshot.length === 0) {
      window.alert('No se encontraron QSO vinculados a este concurso. El concurso sigue activo para proteger sus datos.');
      return false;
    }

    const archivedLog: ContestLogRecord = { ...log, qsos: snapshot };
    const updated = [archivedLog, ...contestLogs.filter((item) => item.id !== log.id)];
    try {
      // Persistir primero; solo después confirmar el cierre al formulario.
      localStorage.setItem('logbook_contest_logs', JSON.stringify(updated));
      const verification = JSON.parse(localStorage.getItem('logbook_contest_logs') || '[]') as ContestLogRecord[];
      const saved = verification.find((item) => item.id === log.id);
      if (!saved || !Array.isArray(saved.qsos) || saved.qsos.length !== snapshot.length) {
        throw new Error('La verificación del log archivado no coincide.');
      }
      setContestLogs(updated);
      return true;
    } catch (error) {
      console.error('No se pudo archivar el log del concurso:', error);
      window.alert('No se pudo verificar el archivo del concurso. El concurso sigue activo y sus datos no se han limpiado.');
      return false;
    }
  };

  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const settingsHistoryEntry = useRef(false);

  useEffect(() => {
    // Atrás debe cerrar primero Ajustes si está abierto; si no, dejamos que
    // el navegador o el sistema operativo salga de la app de forma normal.
    const handlePopState = () => {
      if (settingsHistoryEntry.current) {
        settingsHistoryEntry.current = false;
        setIsSettingsModalOpen(false);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleOpenSettings = () => {
    if (!settingsHistoryEntry.current) {
      window.history.pushState({ logbookSettingsModal: true }, '', window.location.href);
      settingsHistoryEntry.current = true;
    }
    setIsSettingsModalOpen(true);
  };

  useEffect(() => {
    const openGridSettings = () => {
      handleOpenSettings();
      // Esperar a que el modal de Ajustes esté montado y llevar el foco
      // directamente al campo Grid Locator.
      window.setTimeout(() => {
        const field = document.getElementById('user-grid-locator') as HTMLInputElement | null;
        field?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        field?.focus({ preventScroll: true });
      }, 350);
    };
    window.addEventListener('open-user-settings-grid', openGridSettings);
    return () => window.removeEventListener('open-user-settings-grid', openGridSettings);
  }, []);

  const handleCloseSettings = () => {
    setIsSettingsModalOpen(false);
    if (settingsHistoryEntry.current) {
      settingsHistoryEntry.current = false;
      if (window.history.state?.logbookSettingsModal) window.history.back();
    }
  };
  const [activeEQSLQSO, setActiveEQSLQSO] = useState<QSO | null>(null);
  const [isReplyModalOpen, setIsReplyModalOpen] = useState(false);
  const [replyData, setReplyData] = useState<{
    replyToCall: string;
    myCall?: string;
    date?: string;
    time?: string;
    band?: string;
    frequency?: string;
    mode?: string;
    rst?: string;
    email?: string;
    whatsapp?: string;
    whatsappUsername?: string;
    telegram?: string;
    originalEqslId?: string;
  } | null>(null);
  const [, setRefreshKey] = useState(0);



  // Verificar si se abrió mediante un enlace de responder eQSL (?reply_to=...).
  useEffect(() => {
    // Revisar si vino desde un enlace de respuesta compartida
    const urlParams = new URLSearchParams(window.location.search);
    const replyToParam = urlParams.get('reply_to');
    const replyEQSLId = urlParams.get('reply_eqsl');
    // Abrir el editor de respuesta desde el enlace corto; los datos llegan desde el servidor,
    // no desde parámetros extensos en la URL.
    if (replyEQSLId) {
      fetch('/api/eqsl-share?id=' + encodeURIComponent(replyEQSLId), { cache: 'no-store' })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok || !result.card) throw new Error(result.error || 'No se encontró la eQSL.');
          const card = result.card;
          setReplyData({
            replyToCall: String(card.from || ''),
            myCall: /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(card.band || '')) ? (localStorage.getItem('cb_station_callsign') || String(card.to || '')) : (String(card.to || '').trim().toUpperCase() || getUserCallsign() || DEFAULT_CALLSIGN),
            date: String(card.date || ''),
            time: String(card.time || ''),
            band: String(card.band || '40m'),
            frequency: String(card.frequency || '7.120'),
            mode: String(card.mode || 'SSB'),
            rst: String(card.rstRcvd || '59'),
            originalEqslId: replyEQSLId,
          });
          setIsReplyModalOpen(true);
          const cleanParams = new URLSearchParams(window.location.search);
          cleanParams.delete('reply_eqsl');
          const nextQuery = cleanParams.toString();
          window.history.replaceState({}, '', window.location.pathname + (nextQuery ? '?' + nextQuery : ''));
        })
        .catch((error) => window.alert(error instanceof Error ? error.message : 'No se pudo abrir la respuesta eQSL.'));
    }

    // Enlaces antiguos compatibles: abrir el editor desde parámetros tradicionales.
    if (replyToParam) {
      setReplyData({
        replyToCall: replyToParam,
        myCall: urlParams.get('to_call') || '',
        date: urlParams.get('date') || '',
        time: urlParams.get('time') || '',
        band: urlParams.get('band') || '40m',
        frequency: urlParams.get('freq') || '7.120',
        mode: urlParams.get('mode') || 'SSB',
        rst: urlParams.get('rst') || '59',
        email: urlParams.get('email') || '',
        whatsapp: urlParams.get('wa') || '',
        whatsappUsername: urlParams.get('wa_user') || '',
        telegram: urlParams.get('telegram') || '',
      });
      setIsReplyModalOpen(true);
    }

  }, []);

  // Guardar QSOs en localStorage cada vez que cambien
  const handleSaveQsos = (newQsos: QSO[]) => {
    setQsos(newQsos);
    const serialized = JSON.stringify(newQsos);
    try {
      localStorage.setItem('logbook_qsos', serialized);
    } catch (error) {
      console.warn('No se pudo actualizar localStorage; se conserva el respaldo IndexedDB:', error);
    }
    // Guardar también en IndexedDB antes de depender de cualquier servicio remoto.
    void saveQsoBackup(newQsos).catch((error) => {
      console.error('No se pudo guardar la segunda copia local de QSO:', error);
    });
  };

  const handleAddQSO = (qso: QSO, openEQSL = true, publishSpot = true, allowDuplicate = false) => {
    // Evitar duplicados al guardar una respuesta eQSL de un QSO que ya estaba cargado.
    const makeQsoKey = (item: QSO) => [
      String(item.callsign || '').trim().toUpperCase(),
      item.date,
      item.time,
      String(item.band || '').trim().toUpperCase(),
      String(item.frequency || '').trim().replace(',', '.'),
      String(item.mode || '').trim().toUpperCase(),
    ].join('|');
    const key = makeQsoKey(qso);
    const existing = qsos.find((item) => makeQsoKey(item) === key);
    const trackedQSO: QSO = existing && !allowDuplicate && !qso.llotaActivityId
      ? {
          ...existing,
          ...qso,
          id: existing.id,
          email: qso.email || existing.email,
          whatsapp: qso.whatsapp || existing.whatsapp,
          whatsappRaw: qso.whatsappRaw || existing.whatsappRaw,
          whatsappUsername: qso.whatsappUsername || existing.whatsappUsername,
          telegram: qso.telegram || existing.telegram,
          notes: qso.notes || existing.notes,
          qslSent: Boolean(existing.qslSent || qso.qslSent),
          qslRcvd: Boolean(existing.qslRcvd || qso.qslRcvd),
        }
      : { ...qso };
    const updated = existing && !allowDuplicate && !qso.llotaActivityId
      ? qsos.map((item) => item.id === existing.id ? trackedQSO : item)
      : [trackedQSO, ...qsos];
    handleSaveQsos(updated);
    // Las respuestas eQSL actualizan el libro local, pero no son un nuevo QSO/spot.
    // Solo el formulario de un contacto real puede publicar un spot compartido.
    if (publishSpot) void publishQsoSpot(trackedQSO);
    // Cargar QSO y abrir la tarjeta son acciones distintas; la respuesta usa openEQSL=false.
    if (openEQSL) setActiveEQSLQSO(trackedQSO);
  };

  const handleUpdateQSO = (updatedQSO: QSO) => {
    const updated = qsos.map((q) => (q.id === updatedQSO.id ? updatedQSO : q));
    handleSaveQsos(updated);
  };

  const syncArchivedSnapshotsAfterQsoDeletion = (ids: string[]) => {
    const idSet = new Set(ids);
    const nextContestLogs = contestLogs.map((log) => ({ ...log, qsos: log.qsos?.filter((q) => !idSet.has(q.id)) }));
    const nextLLOTALogs = llotaLogs.map((log) => ({ ...log, qsos: log.qsos.filter((q) => !idSet.has(q.id)) }));
    try {
      localStorage.setItem('logbook_contest_logs', JSON.stringify(nextContestLogs));
      localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(nextLLOTALogs));
      setContestLogs(nextContestLogs);
      setLLOTALogs(nextLLOTALogs);
    } catch (error) {
      console.error('No se pudieron sincronizar los archivos después de borrar QSO:', error);
      window.alert('Los contactos se quitaron del Libro de Guardia, pero no se pudo actualizar algún archivo guardado. Revisá el almacenamiento local antes de continuar.');
    }
  };

  const handleDeleteQSO = (id: string) => {
    if (window.confirm('¿Seguro que deseás eliminar este contacto del libro de guardia?')) {
      handleSaveQsos(qsos.filter((q) => q.id !== id));
      syncArchivedSnapshotsAfterQsoDeletion([id]);
    }
  };

  const handleDeleteQSOs = (ids: string[]) => {
    if (!ids.length) return;
    if (window.confirm(`¿Eliminar definitivamente ${ids.length} QSO seleccionados? Esta acción no se puede deshacer.`)) {
      const idSet = new Set(ids);
      handleSaveQsos(qsos.filter((q) => !idSet.has(q.id)));
      syncArchivedSnapshotsAfterQsoDeletion(ids);
    }
  };

  const handleDeleteArchivedLog = (kind: 'contest' | 'llota', id: string) => {
    if (kind === 'llota') {
      const log = llotaLogs.find((item) => item.id === id);
      if (!log) return;
      const updatedLogs = llotaLogs.filter((item) => item.id !== id);
      try {
        localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(updatedLogs));
        setLLOTALogs(updatedLogs);
        handleSaveQsos(qsos.filter((q) => q.llotaActivityId !== id));
      } catch (error) {
        console.error('No se pudo eliminar el archivo LLOTA:', error);
        window.alert('No se pudo actualizar el archivo LLOTA. No se confirmó la eliminación.');
      }
      return;
    }

    const log = contestLogs.find((item) => item.id === id);
    if (!log) return;
    const archivedIds = new Set((log.qsos || []).map((q) => q.id));
    const updatedQSOs = qsos.filter((q) => !archivedIds.has(q.id) && !(q.contestLogId === id || (!q.contestLogId && q.contestLogName === log.name)));
    const updatedLogs = contestLogs.filter((item) => item.id !== id);
    try {
      localStorage.setItem('logbook_contest_logs', JSON.stringify(updatedLogs));
      setContestLogs(updatedLogs);
      handleSaveQsos(updatedQSOs);
      const nextLLOTALogs = llotaLogs.map((item) => ({ ...item, qsos: item.qsos.filter((q) => !archivedIds.has(q.id)) }));
      localStorage.setItem('logbook_llota_activity_logs', JSON.stringify(nextLLOTALogs));
      setLLOTALogs(nextLLOTALogs);
    } catch (error) {
      console.error('No se pudo eliminar el archivo del concurso:', error);
      window.alert('No se pudo actualizar el archivo. No se confirmó la eliminación.');
    }
  };

  const handleImportADIF = (importedQsos: QSO[]) => {
    // Evitar duplicados tanto frente al log actual como dentro del propio archivo ADIF.
    const makeQsoKey = (q: QSO) => [
      q.callsign.trim().toUpperCase(),
      q.date,
      q.time,
      String(q.frequency || '').trim().replace(',', '.'),
      q.mode.trim().toUpperCase(),
    ].join('|');
    const existingKeys = new Set(qsos.map(makeQsoKey));
    const uniqueImported = importedQsos.filter((q) => {
      const key = makeQsoKey(q);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    if (uniqueImported.length === 0) {
      window.alert('La importación terminó: no se agregaron contactos porque todos ya estaban en el libro de guardia.');
      return;
    }
    handleSaveQsos([...uniqueImported, ...qsos]);
    window.alert(`Importación completada: ${uniqueImported.length} QSO(s) nuevos; se omitieron ${importedQsos.length - uniqueImported.length} duplicado(s).`);
  };

  const handleSettingsUpdated = () => {
    setRefreshKey((k) => k + 1);
  };

  const handleOpenReplyForQSO = (qso: QSO) => {
    const myCurrentCall = getUserCallsign() || DEFAULT_CALLSIGN;
    setReplyData({
      replyToCall: qso.callsign,
      myCall: /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(qso.band || '')) ? (qso.stationCallsign || localStorage.getItem('cb_station_callsign') || myCurrentCall) : myCurrentCall,
      date: qso.date,
      time: qso.time,
      band: qso.band,
      frequency: qso.frequency,
      mode: qso.mode,
      rst: qso.rstRcvd || '59',
      email: qso.email,
      whatsapp: qso.whatsapp,
      whatsappUsername: qso.whatsappUsername,
      telegram: qso.telegram,
    });
    setIsReplyModalOpen(true);
  };

  const handleOpenManualReply = () => {
    const myCurrentCall = getUserCallsign() || DEFAULT_CALLSIGN;
    setReplyData({
      replyToCall: '',
      myCall: myCurrentCall,
      date: new Date().toISOString().slice(0, 10),
      time: '12:00',
      band: '40m',
      frequency: '7.120',
      mode: 'SSB',
      rst: '59',
    });
    setIsReplyModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-100 via-white to-cyan-100 text-slate-900 flex flex-col font-sans selection:bg-amber-300 selection:text-slate-950">
      {/* Encabezado con reloj UTC, botón de WhatsApp y accesos */}
      <Header
        onOpenSettings={handleOpenSettings}
        onOpenReplyModal={handleOpenManualReply}
      />

      <GridLocatorReminder />

      {/* Contenido Principal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        <div className="mb-3 grid grid-cols-2 gap-2">
          <details className="group relative min-w-0">
            <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center gap-2 rounded-lg border border-cyan-300 bg-gradient-to-r from-cyan-950 via-sky-900 to-blue-900 px-2 py-2 text-center text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300">
              <Waves className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>LLOTA OFICIAL</span>
              <span className="text-xs transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute left-0 top-full z-30 mt-2 flex min-w-56 flex-col gap-1 rounded-xl border border-cyan-300/40 bg-slate-950 p-2 text-white shadow-xl">
              <a href="https://llota.app/" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold transition hover:bg-white/10">
                Abrir sitio oficial <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href="https://chat.whatsapp.com/CsQnKXyA49CD5zeyLsKNEN?s=cl&p=a&mlu=4&ilr=4" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm font-semibold text-green-300 transition hover:bg-white/10">
                Unirse al grupo oficial de WhatsApp <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
              <a href="https://llota.app/referencias.html" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg px-3 py-2 text-sm transition hover:bg-white/10">
                Ver referencias oficiales <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </div>
          </details>
          <details className="group relative min-w-0">
            <summary className="inline-flex min-h-11 w-full cursor-pointer list-none items-center justify-center gap-1.5 rounded-lg border border-cyan-300 bg-gradient-to-r from-cyan-950 via-sky-900 to-blue-900 px-2 py-2 text-center text-xs sm:text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-cyan-300">
              <RadioTower className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span>PREFIJOS Y DIVISIONES DX</span>
              <span className="text-xs transition-transform group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="absolute right-0 top-full z-30 mt-2 flex min-w-56 flex-col gap-1 rounded-xl border border-cyan-300/40 bg-slate-950 p-2 text-white shadow-xl">
              <button type="button" onClick={() => openRadioPrefixLookup('ham')} className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-white/10">
                Prefijos de radioaficionado <span className="text-cyan-300">→</span>
              </button>
              <button type="button" onClick={() => openRadioPrefixLookup('11m')} className="flex items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-semibold transition hover:bg-white/10">
                Divisiones de 11 metros <span className="text-emerald-300">→</span>
              </button>
            </div>
          </details>
        </div>
        <RadioPrefixLookup />
        <PendingEqslDeliveries />
        <NewQSOForm
          onAddQSO={handleAddQSO}
          onFinishContest={handleFinishContest}
          onFinishLLOTA={handleFinishLLOTA}
          hasDuplicateQSO={(candidate) => qsos.some(q => q.llotaActivityId === candidate.llotaActivityId && q.callsign.trim().toUpperCase() === candidate.callsign.trim().toUpperCase() && q.date === candidate.date && q.time === candidate.time && q.frequency === candidate.frequency && q.mode === candidate.mode)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
          <EQSLMailbox />
          <PrivateMessages />
        </div>

        <CommunityChat />

        <LiveSpots />

        <EventsAndContests />

        <DistanceCalculator />

        <MorseDecoder />

        <SDRSmart />

        {/* Formulario de Nuevo QSO (con precarga de banda, fecha, hora y modo) */}

        {/* Tabla Live Log (con columna Email editable, filtros y acciones) */}
        <LiveLog
          qsos={qsos}
          contestLogs={contestLogs}
          llotaLogs={llotaLogs}
          onUpdateQSO={handleUpdateQSO}
          onDeleteQSO={handleDeleteQSO}
          onDeleteQSOs={handleDeleteQSOs}
          onDeleteArchivedLog={handleDeleteArchivedLog}
          onOpenEQSL={(qso) => setActiveEQSLQSO(qso)}
          onImportADIF={handleImportADIF}
          onOpenReply={handleOpenReplyForQSO}
        />
      </main>

      {/* Informe de propagación al final del contenido, antes del pie de página. */}
      <PropagationReport />
      <PatentGenerator />
      <UserDirectory />
      <UserPublicProfile />

      {/* Pie de página al final de la aplicación. */}
      <Footer />

      {/* Modales */}
      {/* Modal de Configuración General */}
      <UserSettingsModal
        isOpen={isSettingsModalOpen}
        onClose={handleCloseSettings}
        onUpdate={handleSettingsUpdated}
      />

      {/* Modal de Tarjeta eQSL Express */}
      <EQSLCardModal
        isOpen={Boolean(activeEQSLQSO)}
        qso={activeEQSLQSO}
        onClose={() => setActiveEQSLQSO(null)}
        onOpenReply={handleOpenReplyForQSO}
      />

      {/* Modal de Responder con eQSL */}
      <ReplyEQSLModal
        isOpen={isReplyModalOpen}
        initialData={replyData}
        onClose={() => {
          setIsReplyModalOpen(false);
          setReplyData(null);
        }}
        onSaveQSO={(qso) => handleAddQSO(qso, false, true)}
      />


    </div>
  );
}

export default function App() {
  useEffect(() => startAutomaticUiTranslation(), []);
  // Las páginas de eQSL compartidas también conservan al usuario dentro de LogBook
  // cuando pulsa Atrás: se vuelve a Inicio en lugar de abandonar el sitio.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('e') && !params.has('view_eqsl')) return;
    window.history.pushState({ logbookSharedEqsl: true }, '', window.location.href);
    const returnHomeOnBack = () => window.location.replace('/');
    window.addEventListener('popstate', returnHomeOnBack);
    return () => window.removeEventListener('popstate', returnHomeOnBack);
  }, []);
  // Si la última operación fue responder una eQSL, la próxima entrada debe empezar
  // en Inicio, incluso si el navegador vuelve a abrir un enlace antiguo.
  const returningAfterReply = localStorage.getItem('logbook_return_home_after_reply') === '1';
  if (returningAfterReply) {
    localStorage.removeItem('logbook_return_home_after_reply');
    if (window.location.pathname !== '/' || window.location.search || window.location.hash) {
      window.history.replaceState({}, '', '/');
    }
  }

  const sharedParams = new URLSearchParams(window.location.search);
  if (sharedParams.has('patent')) return <PatentSharePage />;
  if (sharedParams.has('patentDownloaded')) return <PatentDownloadedPage />;
  if (!returningAfterReply && (sharedParams.has('e') || sharedParams.has('view_eqsl'))) return <EQSLViewErrorBoundary><ReceivedEQSLPage /></EQSLViewErrorBoundary>;
  return <InitialSdValidation><MainApp /></InitialSdValidation>;
}

```

## src/components/NewQSOForm.tsx

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { QSO, HAM_BANDS, HAM_MODES } from '../types';
import { loadLLOTAReferences, LLOTAReference } from '../services/llotaReferences';
import { supabase } from '../services/supabaseClient';
import { 
  PlusCircle, 
  Search, 
  Radio, 
  Clock, 
  Calendar, 
  User, 
  Globe, 
  Sparkles, 
  AlertCircle,
  RefreshCw,
  ChevronDown
} from 'lucide-react';

interface NewQSOFormProps {
  onAddQSO: (qso: QSO, openEQSL?: boolean, publishSpot?: boolean, allowDuplicate?: boolean) => void;
  onFinishContest: (log: { id: string; name: string; type: string; finishedAt: string }) => boolean;
  onFinishLLOTA: (log: { id: string; name: string; reference: string; activityType: string; startedAt: string; finishedAt: string }) => boolean;
  hasDuplicateQSO: (qso: QSO) => boolean;
}

export const NewQSOForm: React.FC<NewQSOFormProps> = ({ onAddQSO, onFinishContest, onFinishLLOTA, hasDuplicateQSO }) => {
  const formatDateTime = (date: Date, utc: boolean) => ({
    date: `${utc ? date.getUTCFullYear() : date.getFullYear()}-${String((utc ? date.getUTCMonth() : date.getMonth()) + 1).padStart(2, '0')}-${String(utc ? date.getUTCDate() : date.getDate()).padStart(2, '0')}`,
    time: `${String(utc ? date.getUTCHours() : date.getHours()).padStart(2, '0')}:${String(utc ? date.getUTCMinutes() : date.getMinutes()).padStart(2, '0')}`,
  });
  const getNowUTC = () => formatDateTime(new Date(), true);
  const getNowLocal = () => formatDateTime(new Date(), false);
  const convertDateTime = (dateValue: string, timeValue: string, from: 'UTC' | 'LOCAL', to: 'UTC' | 'LOCAL') => {
    const [year, month, day] = dateValue.split('-').map(Number);
    const [hour, minute] = timeValue.split(':').map(Number);
    const instant = from === 'UTC'
      ? new Date(Date.UTC(year, month - 1, day, hour, minute))
      : new Date(year, month - 1, day, hour, minute);
    return formatDateTime(instant, to === 'UTC');
  };

  // PRIORIDAD 5: Cargar último QSO desde localStorage ('last_qso')
  const getLastQSOData = () => {
    const stored = localStorage.getItem('last_qso');
    const timeMode = localStorage.getItem('logbook_contest_time_mode') === 'LOCAL' ? 'LOCAL' : 'UTC';
    const now = timeMode === 'LOCAL' ? getNowLocal() : getNowUTC();
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        return {
          date: now.date,
          time: now.time,
          band: parsed.band || '40m',
          frequency: parsed.frequency || '7.120',
          mode: parsed.mode || 'SSB',
        };
      } catch (e) {
        console.error('Error parsing last_qso', e);
      }
    }
    return {
      date: now.date,
      time: now.time,
      band: '40m',
      frequency: '7.120',
      mode: 'SSB',
    };
  };

  const initial = getLastQSOData();

  // Campos que se mantienen precargados del último QSO
  const [isExpanded, setIsExpanded] = useState(false);
  const [timeMode, setTimeMode] = useState<'UTC' | 'LOCAL'>(() => localStorage.getItem('logbook_contest_time_mode') === 'LOCAL' ? 'LOCAL' : 'UTC');
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const handleTimeModeChange = (nextMode: 'UTC' | 'LOCAL') => {
    if (nextMode === timeMode) return;
    const converted = convertDateTime(date, time, timeMode, nextMode);
    setDate(converted.date);
    setTime(converted.time);
    setTimeMode(nextMode);
    localStorage.setItem('logbook_contest_time_mode', nextMode);
  };
  // La banda seleccionada es temporal: cada nueva apertura comienza en 40 m,
  // aunque el último QSO guardado haya sido en 11 metros. Los datos del QSO
  // anterior siguen disponibles para fecha, hora y modo.
  const [band, setBand] = useState('40m');
  const [frequency, setFrequency] = useState(HAM_BANDS.find((b) => b.name === '40m')?.defaultFreq || '7.120');
  const [mode, setMode] = useState(initial.mode);

  // Campos que se limpian al guardar (corresponsal, RST enviada, RST recibida, y detalles)
  const [callsign, setCallsign] = useState('');
  const getRegisteredStationIdentity = () =>
    (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
  const isAmateurRadioCallsign = (value: string) =>
    /^[A-Z0-9]{1,3}[0-9][A-Z]{1,7}(?:\/[A-Z0-9]{1,5})?$/.test(value.trim().toUpperCase());
  const getSavedCbStationCallsign = () => {
    const saved = (localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
    if (saved) return saved;
    const registered = getRegisteredStationIdentity();
    // Si el usuario se registró directamente con una identificación CB (no un indicativo
    // de radioaficionado), esa misma identificación es su estación de 11 metros.
    return registered && !isAmateurRadioCallsign(registered) ? registered : '';
  };
  const [cbStationCallsign, setCbStationCallsign] = useState(() => getSavedCbStationCallsign());
  const [hasSavedCbStationCallsign, setHasSavedCbStationCallsign] = useState(() => Boolean(getSavedCbStationCallsign()));
  const [showCbStationCallsignPrompt, setShowCbStationCallsignPrompt] = useState(false);

  // Preload the already-linked 11m identity so the operator is not asked to type it again.
  useEffect(() => {
    let active = true;
    const syncLinked11mIdentity = async () => {
      const rootCallsign = getRegisteredStationIdentity();
      const identityToken = (localStorage.getItem('community_chat_identity_token') || '').trim();
      if (!supabase || !identityToken || !isAmateurRadioCallsign(rootCallsign)) return;
      const { data, error } = await supabase.rpc('community_account_identities', { p_token: identityToken });
      if (!active || error || !Array.isArray(data)) return;
      const linked = data.find((item: any) => item?.identity_type === '11m' && typeof item.callsign === 'string');
      if (!linked) return;
      const callsign11m = String(linked.callsign).trim().toUpperCase();
      localStorage.setItem('cb_station_callsign', callsign11m);
      setCbStationCallsign(callsign11m);
      setHasSavedCbStationCallsign(true);
      setShowCbStationCallsignPrompt(false);
    };
    void syncLinked11mIdentity();
    window.addEventListener('user-profile-updated', syncLinked11mIdentity);
    return () => {
      active = false;
      window.removeEventListener('user-profile-updated', syncLinked11mIdentity);
    };
  }, []);
  const [rstSent, setRstSent] = useState('59');
  const [rstRcvd, setRstRcvd] = useState('59');
  // El intercambio enviado es un valor preestablecido del operador: persiste entre QSOs y sesiones hasta cambiarlo manualmente.
  const [exchangeSent, setExchangeSent] = useState(() => localStorage.getItem('logbook_exchange_sent_default') || '');
  const [exchangeReceived, setExchangeReceived] = useState('');
  const [contestMode, setContestMode] = useState(() => localStorage.getItem('logbook_contest_active') === 'true');
  const [contestLogId, setContestLogId] = useState(() => localStorage.getItem('logbook_contest_id') || '');
  const [contestLogName, setContestLogName] = useState(() => localStorage.getItem('logbook_contest_name') || '');
  const [contestType, setContestType] = useState(() => localStorage.getItem('logbook_contest_type') || 'GENERIC');
  const [contestSetupOpen, setContestSetupOpen] = useState(false);
  const beginContest = () => {
    // El modo concurso solo puede cerrarse desde "Finalizar concurso y guardar log".
    // Nunca permitir que una segunda activación o un cambio accidental lo desactive.
    if (contestMode) return;
    const name = contestLogName.trim();
    if (!name) { setValidationError('Escribe un nombre para el log antes de activar el modo concurso.'); return; }
    const id = contestLogId || `contest-${Date.now()}`;
    setContestLogId(id);
    setContestLogName(name);
    setContestMode(true);
    setContestSetupOpen(false);
    localStorage.setItem('logbook_contest_active', 'true');
    localStorage.setItem('logbook_contest_id', id);
    localStorage.setItem('logbook_contest_name', name);
    localStorage.setItem('logbook_contest_type', contestType);
    setValidationError('');
  };
  const finishContest = () => {
    if (!contestMode || !contestLogName.trim()) return;
    const log = { id: contestLogId || `contest-${Date.now()}`, name: contestLogName.trim(), type: contestType, finishedAt: new Date().toISOString() };
    // El formulario solo cierra el concurso si App confirma que el log quedó archivado.
    const archived = onFinishContest(log);
    if (!archived) return;
    setContestMode(false);
    setContestSetupOpen(false);
    setContestLogId('');
    setContestLogName('');
    setContestType('GENERIC');
    // Conservar el progresivo/intercambio enviado preestablecido para el próximo concurso.
    setExchangeReceived('');
    localStorage.setItem('logbook_contest_active', 'false');
    localStorage.removeItem('logbook_contest_id');
    localStorage.removeItem('logbook_contest_name');
    localStorage.removeItem('logbook_contest_type');
    window.alert(`Concurso «${log.name}» finalizado. Encontrarás el log en QSO GUARDADOS para exportarlo.`);
  };
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [whatsappUsername, setWhatsappUsername] = useState('');
  const [telegram, setTelegram] = useState('');
  const [country, setCountry] = useState('');
  const [grid, setGrid] = useState('');
  const [notes, setNotes] = useState('');
  const [llotaReferences, setLLOTAReferences] = useState<LLOTAReference[]>([]);
  const [llotaLoading, setLLOTAloading] = useState(true);
  const [llotaLoadError, setLLOTAloadError] = useState('');
  const [llotaSearch, setLLOTAsearch] = useState('');
  const [selectedLLOTAReference, setSelectedLLOTAReference] = useState<(LLOTAReference & { activityId: string; startedAt: string }) | null>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('logbook_llota_selected_reference_v1') || 'null');
      return saved && typeof saved.code === 'string' && /^LL[A-Z]{2}-\d{4,5}$/i.test(saved.code)
        ? { code: saved.code.toUpperCase(), name: String(saved.name || ''), country: String(saved.country || ''), activityId: String(saved.activityId || `llota-${saved.code}-${Date.now()}`), startedAt: String(saved.startedAt || new Date().toISOString()) }
        : null;
    } catch { return null; }
  });
  // La referencia elegida es una preferencia persistente del operador: no se limpia al guardar QSO.
  useEffect(() => {
    try {
      if (selectedLLOTAReference) {
        localStorage.setItem('logbook_llota_selected_reference_v1', JSON.stringify(selectedLLOTAReference));
      } else {
        localStorage.removeItem('logbook_llota_selected_reference_v1');
      }
    } catch (error) {
      console.warn('No se pudo persistir la referencia LLOTA seleccionada:', error);
    }
  }, [selectedLLOTAReference]);
  useEffect(() => {
    let active = true;
    loadLLOTAReferences().then((references) => {
      if (!active) return;
      setLLOTAReferences(references);
      setLLOTAloadError('');
    }).catch((error) => {
      if (!active) return;
      console.warn('No se pudo cargar el catálogo oficial LLOTA:', error);
      setLLOTAloadError('No se pudo cargar el catálogo oficial. Comprobá tu conexión o consultá la página oficial.');
    }).finally(() => { if (active) setLLOTAloading(false); });
    return () => { active = false; };
  }, []);
  const [validationError, setValidationError] = useState('');
  const [recipientRegistration, setRecipientRegistration] = useState<'idle' | 'checking' | 'registered' | 'not_registered'>('idle');
  const recipientCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recipientCheckRequestId = useRef(0);

  const callsignInputRef = useRef<HTMLInputElement>(null);
  const checkRecipientRegistration = async (targetCallsign: string): Promise<boolean | null> => {
    const cleanTarget = targetCallsign.trim().toUpperCase();
    const token = (localStorage.getItem('community_chat_identity_token') || '').trim();
    if (!token || cleanTarget.length < 3) return null;
    try {
      const response = await fetch(`/api/directory?action=check&callsign=${encodeURIComponent(cleanTarget)}`, {
        method: 'GET', cache: 'no-store', headers: { 'x-identity-token': token },
      });
      if (!response.ok) return null;
      const result = await response.json();
      return result.registered === true;
    } catch {
      return null;
    }
  };

  // Acceso directo desde el Directorio: reutiliza este mismo formulario y sus vías de envío.
  useEffect(() => {
    const handleDirectoryEQSL = (event: Event) => {
      const detail = (event as CustomEvent<{ callsign?: string }>).detail;
      const targetCallsign = String(detail?.callsign || '').trim().toUpperCase();
      if (!targetCallsign) return;
      setIsExpanded(true);
      setCallsign(targetCallsign);
      setRecipientRegistration('checking');
      const recipientRequest = ++recipientCheckRequestId.current;
      void checkRecipientRegistration(targetCallsign).then((registered) => {
        if (recipientRequest === recipientCheckRequestId.current) {
          setRecipientRegistration(registered === null ? 'idle' : registered ? 'registered' : 'not_registered');
        }
      });
      setValidationError('');
      setEmail('');
      setWhatsapp('');
      setWhatsappUsername('');
      setTelegram('');
      setCountry('');
      setGrid('');
      const requestId = ++lookupRequestId.current;
      const contactBook = getContactBook();
      const contact = contactBook[targetCallsign];
      if (contact) {
        setEmail(String(contact.email || ''));
        setWhatsapp(String(contact.whatsapp || contact.whatsappRaw || ''));
        setWhatsappUsername(String(contact.whatsappUsername || ''));
        setTelegram(String(contact.telegram || ''));
        setCountry(String(contact.country || ''));
        setGrid(String(contact.grid || '').toUpperCase());
      }
      void applyPrefixDetails(targetCallsign, requestId);
      window.setTimeout(() => {
        const formElement = callsignInputRef.current;
        formElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        formElement?.focus({ preventScroll: true });
      }, 120);
    };
    window.addEventListener('logbook-prefill-correspondent', handleDirectoryEQSL);
    return () => window.removeEventListener('logbook-prefill-correspondent', handleDirectoryEQSL);
  }, []);
  const lookupRequestId = useRef(0);

  // Sincronizar banda y frecuencia sugerida al cambiar banda
  const handleBandChange = (newBand: string) => {
    setBand(newBand);
    const found = HAM_BANDS.find((b) => b.name === newBand);
    if (found) setFrequency(found.defaultFreq);

    // El campo CB solo se pide a quien tiene una SD de radioafición y aún no
    // guardó su identificación de 11 metros. Al cambiar de banda se oculta.
    if (newBand === '11 metros') {
      // La referencia LLOTA queda guardada aunque el formulario oculte el selector en 11 metros.
      setLLOTAsearch('');
      const savedCB = getSavedCbStationCallsign();
      if (savedCB) {
        setCbStationCallsign(savedCB);
        setHasSavedCbStationCallsign(true);
        localStorage.setItem('cb_station_callsign', savedCB);
        setShowCbStationCallsignPrompt(false);
      } else {
        setCbStationCallsign('');
        setShowCbStationCallsignPrompt(true);
      }
      setRstSent('59');
      setRstRcvd('59');
    } else {
      setShowCbStationCallsignPrompt(false);
    }
  };

  // Las señales RST se precargan siempre como 59, independientemente del modo.
  const handleModeChange = (newMode: string) => {
    setMode(newMode);
    if (!rstSent.trim()) setRstSent('59');
    if (!rstRcvd.trim()) setRstRcvd('59');
  };

  const handleUpdateToCurrentUTC = () => {
    const now = timeMode === 'UTC' ? getNowUTC() : getNowLocal();
    setDate(now.date);
    setTime(now.time);
  };

  // Libreta local: reutiliza correos y datos que el usuario ya guardó.
  const getContactBook = (): Record<string, any> => {
    try { return JSON.parse(localStorage.getItem('logbook_contacts') || '{}'); }
    catch { return {}; }
  };
  const saveContact = (call: string, data: Record<string, any>) => {
    const key = call.trim().toUpperCase();
    if (!key) return;
    const book = getContactBook();
    const previous = book[key] || {};
    const merged = { ...previous };
    Object.entries(data).forEach(([field, value]) => {
      if (typeof value === 'string' && value.trim()) merged[field] = value.trim();
    });
    merged.callsign = key;
    merged.updatedAt = new Date().toISOString();
    book[key] = merged;
    localStorage.setItem('logbook_contacts', JSON.stringify(book));
  };


  // Completar solo información de país por prefijo, sin consultar servicios externos.
  const applyPrefixDetails = async (cleanCall: string, requestId: number) => {
    if (!cleanCall || cleanCall.length < 3 || requestId !== lookupRequestId.current) return;
    const prefixes: Record<string, string> = {
      LU: 'Argentina', LW: 'Argentina', AY: 'Argentina', AZ: 'Argentina',
      EA: 'España', EB: 'España', EC: 'España', ED: 'España',
      PY: 'Brasil', PP: 'Brasil', PR: 'Brasil', PU: 'Brasil', PT: 'Brasil', PZ: 'Surinam',
      CX: 'Uruguay', CE: 'Chile', CA: 'Chile', CB: 'Chile', OA: 'Perú', CP: 'Bolivia',
      ZP: 'Paraguay', HK: 'Colombia', YV: 'Venezuela', HC: 'Ecuador', TG: 'Guatemala',
      TI: 'Costa Rica', HP: 'Panamá', HR: 'Honduras', YS: 'El Salvador', YN: 'Nicaragua',
      XE: 'México', W: 'Estados Unidos', K: 'Estados Unidos', N: 'Estados Unidos',
      VE: 'Canadá', VA: 'Canadá', G: 'Reino Unido', M: 'Reino Unido', F: 'Francia',
      DL: 'Alemania', I: 'Italia', JA: 'Japón', VK: 'Australia', ZL: 'Nueva Zelanda'
    };
    setCountry(prefixes[cleanCall.slice(0, 2)] || prefixes[cleanCall.slice(0, 1)] || '');
    setGrid('');
  };

  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  const callsignKeyboardTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCallsignChange = (val: string) => {
    const upper = val.toUpperCase().trim();
    setCallsign(upper);
    setRecipientRegistration(upper.length >= 3 ? 'checking' : 'idle');
    const recipientRequest = ++recipientCheckRequestId.current;
    if (recipientCheckTimer.current) clearTimeout(recipientCheckTimer.current);
    if (upper.length >= 3) {
      recipientCheckTimer.current = setTimeout(() => {
        void checkRecipientRegistration(upper).then((registered) => {
          if (recipientRequest === recipientCheckRequestId.current) {
            setRecipientRegistration(registered === null ? 'idle' : registered ? 'registered' : 'not_registered');
          }
        });
      }, 450);
    }
    // En móvil, cerrar el teclado cuando la carga del indicativo se detiene.
    // Si el usuario continúa escribiendo, el temporizador se reinicia en cada tecla.
    if (callsignKeyboardTimer.current) clearTimeout(callsignKeyboardTimer.current);
    if (upper.length >= 3) {
      callsignKeyboardTimer.current = setTimeout(() => {
        const input = callsignInputRef.current;
        if (input && document.activeElement === input) input.blur();
      }, 1800);
    }
    const requestId = ++lookupRequestId.current;
    // Do not keep contact data from the previous operator while a new lookup is running.
    setEmail('');
    setWhatsapp('');
    setWhatsappUsername('');
    setTelegram('');
    setCountry('');
    setGrid('');
    // Buscar primero la libreta local. Si falta una ficha, recuperar los datos del historial de QSOs
    // guardado en este mismo navegador (por ejemplo, contactos usados en eQSL anteriores).
    const contactBook = getContactBook();
    let localContact = contactBook[upper];
    if (!localContact) {
      try {
        const savedQsos = JSON.parse(localStorage.getItem('logbook_qsos') || '[]');
        if (Array.isArray(savedQsos)) {
          const previousQso = [...savedQsos].reverse().find((q: any) =>
            String(q?.callsign || '').trim().toUpperCase() === upper &&
            (String(q?.email || '').trim() || String(q?.whatsapp || q?.whatsappRaw || '').trim())
          );
          if (previousQso) {
            localContact = {
              callsign: upper,
              email: String(previousQso.email || ''),
              whatsapp: String(previousQso.whatsapp || previousQso.whatsappRaw || ''),
              whatsappUsername: String(previousQso.whatsappUsername || ''),
              telegram: String(previousQso.telegram || ''),
              country: String(previousQso.country || ''),
              grid: String(previousQso.grid || ''),
            };
            saveContact(upper, localContact);
          }
        }
      } catch {
        // Si el historial no se puede leer, continuar con el directorio sin interrumpir el formulario.
      }
    }
    if (localContact) {
      setEmail(String(localContact.email || ''));
      setWhatsapp(String(localContact.whatsapp || localContact.whatsappRaw || ''));
      setWhatsappUsername(String(localContact.whatsappUsername || ''));
      setTelegram(String(localContact.telegram || ''));
      setCountry(String(localContact.country || ''));
      setGrid(String(localContact.grid || '').toUpperCase());
    }
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);

    if (upper.length >= 3) {
      debounceTimeout.current = setTimeout(() => {
        applyPrefixDetails(upper, requestId);
      }, 500);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const shouldOpenEQSL = submitter?.value === 'send';
    setValidationError('');
    const cleanCall = callsign.trim().toUpperCase();
    const cleanCBStationCallsign = cbStationCallsign.trim().toUpperCase();
    const validCall = band === '11 metros'
      ? /^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$/.test(cleanCall)
      : isAmateurRadioCallsign(cleanCall);
    const validStation11m = band !== '11 metros' || /^\d{1,3}[A-Z]{1,4}\d{1,4}$/.test(cleanCBStationCallsign || getSavedCbStationCallsign());
    const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;
    const validTime = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time);
    const normalizedFrequency = frequency.trim().replace(',', '.');
    const numericFrequency = Number(normalizedFrequency);
    const validFrequency = normalizedFrequency !== '' && Number.isFinite(numericFrequency) && numericFrequency > 0 && numericFrequency <= 100000;
    const is11mFrequency = Number.isFinite(numericFrequency) && numericFrequency >= 26.965 && numericFrequency <= 27.999;
    const validBandFrequency = band === '11 metros' ? is11mFrequency : !is11mFrequency;
    const validMode = HAM_MODES.includes(mode);
    const missing = [
      !validCall ? (band === '11 metros' ? 'identificador de estación de 11 metros' : 'indicativo válido') : '',
      band === '11 metros' && !cleanCBStationCallsign && !getSavedCbStationCallsign() ? 'tu señal distintiva de 11 metros' : '',
      !validStation11m ? 'una SD válida de 11 metros (división, letras y números)' : '',
      !validDate ? 'fecha válida' : '',
      !validTime ? (timeMode === 'UTC' ? 'hora válida en UTC' : 'hora local válida') : '',
      !validFrequency ? 'frecuencia válida en MHz' : '',
      !validBandFrequency ? (band === '11 metros' ? 'frecuencia entre 26.965 y 27.999 MHz para 11 metros' : 'una frecuencia que corresponda a la banda seleccionada') : '',
      !validMode ? 'modo válido' : '',
    ].filter(Boolean);
    if (missing.length) {
      setValidationError('No se guardó el QSO ni se puede emitir la eQSL. Corregí: ' + missing.join(', ') + '.');
      if (!validCall) callsignInputRef.current?.focus();
      if (band === '11 metros' && !cleanCBStationCallsign) document.getElementById('cb-station-callsign')?.focus();
      return;
    }

    if (band === '11 metros') {
      const station11m = (cleanCBStationCallsign || getSavedCbStationCallsign()).trim().toUpperCase();
      const rootCallsign = getRegisteredStationIdentity();
      if (station11m) {
        localStorage.setItem('cb_station_callsign', station11m);
        if (rootCallsign && isAmateurRadioCallsign(rootCallsign)) {
          if (!supabase) {
            setValidationError('No se pudo vincular la SD de 11 metros porque no hay conexión con Supabase. El QSO no se guardó.');
            return;
          }
          const identityToken = (localStorage.getItem('community_chat_identity_token') || '').trim();
          const { data, error } = await supabase.rpc('link_community_account_identity', {
            p_primary_callsign: rootCallsign,
            p_token: identityToken,
            p_secondary_callsign: station11m,
          });
          if (error || !data?.ok) {
            const reason = String(data?.reason || '');
            setValidationError(reason === 'taken'
              ? 'Esa SD de 11 metros ya está registrada por otra cuenta.'
              : reason === '11m_identity_already_linked'
                ? 'Esta cuenta ya tiene otra identidad de 11 metros vinculada.'
                : 'No se pudo validar y vincular tu SD de 11 metros. No se guardó el QSO.');
            return;
          }
          localStorage.setItem('community_chat_active_callsign', station11m);
          window.dispatchEvent(new CustomEvent('community-active-identity-changed', { detail: { callsign: station11m } }));
          window.dispatchEvent(new Event('user-profile-updated'));
        }
      }
    }

    let recipientRegistered = false;
    if (shouldOpenEQSL) {
      const confirmedRegistration = await checkRecipientRegistration(cleanCall);
      recipientRegistered = confirmedRegistration === true;
      setRecipientRegistration(confirmedRegistration === null ? 'idle' : confirmedRegistration ? 'registered' : 'not_registered');
    }

    const qsoUtc = timeMode === 'UTC' ? { date, time } : convertDateTime(date, time, 'LOCAL', 'UTC');
    const newQSO: QSO & { recipientRegistered?: boolean } = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      callsign: cleanCall,
      recipientRegistered,
      ...(band === '11 metros' ? { stationCallsign: cleanCBStationCallsign || getSavedCbStationCallsign() } : {}),
      date: qsoUtc.date,
      time: qsoUtc.time,
      band,
      frequency: normalizedFrequency,
      mode,
      rstSent: rstSent.trim() || '59',
      rstRcvd: rstRcvd.trim() || '59',
      exchangeSent: exchangeSent.trim(),
      exchangeReceived: exchangeReceived.trim(),
      ...(contestMode ? { contestLogId, contestLogName: contestLogName.trim(), contestType } : {}),
      ...(selectedLLOTAReference ? { llotaReference: selectedLLOTAReference.code, llotaReferenceName: selectedLLOTAReference.name, llotaActivityId: selectedLLOTAReference.activityId, llotaActivityType: 'LLOTA' } : {}),
      email: email.trim(),
      whatsapp: whatsapp.trim(),
      whatsappRaw: whatsapp.trim(),
      whatsappUsername: whatsappUsername.trim().replace(/^@+/, '') || (/^@/.test(whatsapp.trim()) ? whatsapp.trim().replace(/^@+/, '') : ''),
      telegram: telegram.trim().replace(/^@+/, ''),
      name: '',
      country: country.trim(),
      grid: grid.trim().toUpperCase(),
      notes: notes.trim(),
      qslSent: false,
      qslRcvd: false,
    };

    if (band === '11 metros') {
      const finalCBStationCallsign = cleanCBStationCallsign || getSavedCbStationCallsign();
      if (finalCBStationCallsign) {
        localStorage.setItem('cb_station_callsign', finalCBStationCallsign);
        // Vincular la identidad CB con la SD registrada en este dispositivo.
        const registeredSD = getRegisteredStationIdentity();
        if (registeredSD) localStorage.setItem('cb_station_linked_sd', registeredSD);
        setCbStationCallsign(finalCBStationCallsign);
        setHasSavedCbStationCallsign(true);
        setShowCbStationCallsignPrompt(false);
        localStorage.setItem('cb_station_callsign_prompt_seen', 'true');
      }
    }

    // Recordar los datos del corresponsal para próximos QSOs, incluso si el correo fue pegado manualmente.
    saveContact(cleanCall, { email: email.trim(), whatsapp: whatsapp.trim(), whatsappUsername: whatsappUsername.trim().replace(/^@+/, '') || (/^@/.test(whatsapp.trim()) ? whatsapp.trim().replace(/^@+/, '') : ''), telegram: telegram.trim().replace(/^@+/, ''), country: country.trim(), grid: grid.trim().toUpperCase() });
// Se conserva en la libreta local sin publicar automáticamente datos privados en el directorio mundial.
    // En móvil, cerrar el teclado ANTES de montar el editor de eQSL.
    // El navegador puede conservar el foco del campo anterior durante el cambio de pantalla.
    if (shouldOpenEQSL && document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    const duplicateLLOTA = Boolean(selectedLLOTAReference && hasDuplicateQSO(newQSO));
    const allowDuplicate = duplicateLLOTA ? window.confirm(`Este contacto ya figura en el log LLOTA ${selectedLLOTAReference?.code}. ¿Querés guardarlo igualmente como un nuevo registro?`) : false;
    if (duplicateLLOTA && !allowDuplicate) return;
    // La tarjeta eQSL recibe el canal elegido por el usuario cuando corresponde.
    onAddQSO(newQSO, shouldOpenEQSL, true, allowDuplicate);

    // PRIORIDAD 5: Guardar el último QSO en localStorage ('last_qso')
    // Manteniendo hora (UTC), fecha, banda, frecuencia, modo
    const lastQSOToPersist = {
      date: qsoUtc.date,
      time: qsoUtc.time,
      band,
      frequency,
      mode,
    };
    localStorage.setItem('last_qso', JSON.stringify(lastQSOToPersist));

    // Limpiar indicativo, RST, correo y detalles al guardar
    setCallsign('');
    setRecipientRegistration('idle');
    recipientCheckRequestId.current += 1;
    if (recipientCheckTimer.current) clearTimeout(recipientCheckTimer.current);
    setRstSent('59');
    setRstRcvd('59');
    // El enviado queda preestablecido hasta que el operador lo cambie manualmente.
    // El recibido corresponde a cada corresponsal y se limpia después de guardar.
    setExchangeReceived('');
    setEmail('');
    setWhatsapp('');
    setTelegram('');
    setCountry('');
    setGrid('');
    setNotes('');
    // La referencia seleccionada permanece activa para el siguiente QSO.
    setLLOTAsearch('');

    // Asegurar que el teclado siga cerrado después de que React monte el editor.
    // Se repite el blur tras el cambio de pantalla porque algunos navegadores móviles
    // restauran el foco del último campo durante el siguiente render.
    if (shouldOpenEQSL) {
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 0);
      window.setTimeout(() => {
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
      }, 180);
    } else {
      // Mantener el flujo rápido para cargar QSOs consecutivos sin abrir eQSL.
      window.setTimeout(() => {
        callsignInputRef.current?.focus();
      }, 50);
    }
  };

  // Si el operador pega o escribe el código completo, reconocerlo directamente
  // contra el catálogo oficial ya cargado, sin exigir que toque una sugerencia.
  const handleLLOTAReferenceInput = (value: string) => {
    const normalized = value.trim().toUpperCase().replace(/\\s+/g, '');
    setLLOTAsearch(value.toUpperCase());
    if (!/^LL[A-Z]{2}-\\d{4,5}$/.test(normalized)) return;
    const official = llotaReferences.find((item) => item.code.trim().toUpperCase() === normalized);
    if (!official) return;
    setSelectedLLOTAReference({
      ...official,
      activityId: `llota-${official.code}-${Date.now()}`,
      startedAt: new Date().toISOString(),
    });
    setLLOTAsearch('');
  };

  const filteredLLOTAReferences = llotaSearch.trim().length >= 2
    ? llotaReferences.filter((item) => `${item.code} ${item.name} ${item.country}`.toLocaleLowerCase().includes(llotaSearch.trim().toLocaleLowerCase())).slice(0, 25)
    : [];
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl mb-6 overflow-hidden">
      <button type="button" onClick={() => setIsExpanded(open => !open)} aria-expanded={isExpanded} className="flex min-h-[56px] w-full items-center justify-between gap-3 px-3 py-2.5 sm:px-4 text-left hover:bg-slate-800/70 transition-colors">
        <span className="flex items-center gap-3">
          <span className="p-2 bg-amber-500/10 text-amber-400 rounded-xl"><Radio className="w-5 h-5" /></span>
          <span className="min-w-0 text-left">
            <span className="block text-base font-bold text-white tracking-wide">LIBRO DE GUARDIA</span>
          </span>
        </span>
        <ChevronDown className={`h-5 w-5 shrink-0 text-slate-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      {isExpanded && <div className="p-5 sm:p-6 pt-0">
      <div className="mb-3 rounded-xl border border-slate-700 bg-slate-950 p-3">
        <div className="flex flex-nowrap items-center gap-4">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-white cursor-pointer">
            <input type="checkbox" checked={timeMode === 'LOCAL'} onChange={() => handleTimeModeChange('LOCAL')} className="h-4 w-4 accent-amber-500" /> LOCAL
          </label>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-white cursor-pointer">
            <input type="checkbox" checked={timeMode === 'UTC'} onChange={() => handleTimeModeChange('UTC')} className="h-4 w-4 accent-amber-500" /> UTC
          </label>
        </div>
      </div>
      <div className="flex justify-end pb-3">
        <button type="button" onClick={handleUpdateToCurrentUTC} className="flex items-center gap-1 px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors cursor-pointer" title="Sincronizar a hora UTC actual">
          <RefreshCw className="w-3.5 h-3.5" /> Hora UTC actual
        </button>
      </div>
      <details className="mb-4 rounded-xl border border-slate-700 bg-slate-950 p-3 space-y-3" open={contestSetupOpen || contestMode} onToggle={(e) => { if (!contestMode) setContestSetupOpen((e.currentTarget as HTMLDetailsElement).open); }}>
        <summary className="cursor-pointer list-none text-sm font-semibold text-white">Modo concurso {contestMode ? `· Activo: ${contestLogName}` : ' - Configurar log'}</summary>
        {contestSetupOpen && !contestMode && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border border-slate-800 p-3">
          <div>
            <label className="block text-xs text-slate-300 mb-1">Nombre del log</label>
            <input value={contestLogName} onChange={(e) => { setContestLogName(e.target.value); localStorage.setItem('logbook_contest_name', e.target.value); }} placeholder="Ej. CQ WW SSB 2026" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-slate-300 mb-1">Tipo / plantilla de concurso</label>
            <select value={contestType} onChange={(e) => { setContestType(e.target.value); localStorage.setItem('logbook_contest_type', e.target.value); }} className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white">
              <option value="GENERIC">Cabrillo genérico 3.0</option>
              <option value="CQ-WW">CQ World Wide DX</option>
              <option value="CQ-WPX">CQ WPX</option>
              <option value="ARRL-FIELD-DAY">ARRL Field Day</option>
              <option value="ARRL-SS">ARRL Sweepstakes</option>
              <option value="ADIF">ADIF</option>
              <option value="EDI">EDI (concursos VHF/UHF)</option>
            </select>
          </div>
          <div className="sm:col-span-2 flex justify-end">
            <button type="button" onClick={beginContest} disabled={!contestLogName.trim()} className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">Guardar y activar concurso</button>
          </div>
        </div>}
        {contestMode && <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p className="text-xs text-amber-300">Concurso activo: {contestLogName}. Los próximos QSO se vincularán a este log.</p>
          <button type="button" onClick={finishContest} className="rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-bold text-white">Finalizar concurso y guardar log</button>
        </div>}
        {!contestMode && !contestSetupOpen && <p className="text-xs text-slate-400">Abrí este apartado para configurar el log de concurso.</p>}
        {!contestMode && <div className="flex justify-end border-t border-slate-800 pt-3"><button type="button" className="lb-disclosure-close" onClick={(event) => { const panel = event.currentTarget.closest('details'); if (panel) panel.open = false; setContestSetupOpen(false); }}>CERRAR</button></div>}
      </details>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Banda rápida selector */}
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          <span className="text-xs font-semibold text-slate-400 mr-1">Banda:</span>
          {HAM_BANDS.map((b) => (
            <button
              key={b.name}
              type="button"
              onClick={() => handleBandChange(b.name)}
              className={`px-2.5 py-1 text-xs font-mono font-medium rounded-md transition-all cursor-pointer ${
                band === b.name
                  ? 'bg-amber-500 text-slate-950 font-bold shadow-xs'
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 hover:text-white'
              }`}
            >
              {b.name === '11 metros' ? '11m' : b.name}
            </button>
          ))}
        </div>

        {band === '11 metros' && showCbStationCallsignPrompt && !hasSavedCbStationCallsign && (
          <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3">
            <label htmlFor="cb-station-callsign" className="block text-xs font-bold text-emerald-300 uppercase tracking-wider mb-1">
              Mi señal distintiva de 11 metros (emisor) *
            </label>
            <input
              id="cb-station-callsign"
              type="text"
              value={cbStationCallsign}
              onChange={(e) => setCbStationCallsign(e.target.value.toUpperCase())}
              placeholder="Ej. Estación Sol, móvil 23 o tu señal CB"
              autoComplete="off"
              required
              maxLength={20}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-400">
              Esta es la señal que aparecerá como emisora en tus eQSL y en tus QSO de 11 metros. Se guarda en este dispositivo.
            </p>
          </div>
        )}

        {/* Fila 1: Indicativo corresponsal, RSTs, Email, WhatsApp */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          {/* Indicativo Corresponsal (Principal) */}
          <div className="sm:col-span-3">
            <label className="block text-xs font-bold text-amber-400 uppercase tracking-wider mb-1">
              Corresponsal (Callsign) *
            </label>
            <div className="relative">
              <input
                ref={callsignInputRef}
                type="text"
                required
                value={callsign}
                onChange={(e) => handleCallsignChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (callsignKeyboardTimer.current) clearTimeout(callsignKeyboardTimer.current);
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
                placeholder={band === '11 metros' ? 'Ej. móvil 23, estación Sol' : 'ej. LU7YS, EA1EXP'}
                className="w-full px-3 py-2 bg-slate-950 border border-amber-500/40 rounded-xl text-lg font-mono font-black text-amber-300 uppercase tracking-widest placeholder:text-slate-600 focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
              />
              {recipientRegistration === 'registered' && <p className="mt-1 text-[11px] font-semibold text-emerald-400">Usuario registrado en la app</p>}
              {recipientRegistration === 'not_registered' && <p className="mt-1 text-[11px] font-semibold text-rose-400">Usuario no registrado en la app</p>}
              {recipientRegistration === 'checking' && <p className="mt-1 text-[10px] text-slate-400">Comprobando registro…</p>}
            </div>
          </div>

          {/* RST Enviada */}
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              RST E.
            </label>
            <input
              type="text"
              value={rstSent}
              onChange={(e) => setRstSent(e.target.value)}
              placeholder="59"
              className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-center font-bold text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          {/* RST Recibida */}
          <div className="sm:col-span-1">
            <label className="block text-xs font-semibold text-slate-300 mb-1">
              RST R.
            </label>
            <input
              type="text"
              value={rstRcvd}
              onChange={(e) => setRstRcvd(e.target.value)}
              placeholder="59"
              className="w-full px-2 py-2 bg-slate-950 border border-slate-700 rounded-xl text-sm font-mono text-center font-bold text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

        </div>

        {validationError && <div role="alert" className="rounded-lg border border-rose-500/50 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">{validationError}</div>}

        {/* Fila 2: Fecha UTC, Hora UTC, Frecuencia, Modo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Fecha {timeMode === 'UTC' ? 'UTC' : 'local'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              required
              value={date}
              onChange={(e) => { setDate(e.target.value); setValidationError(''); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1 flex items-center gap-1">
              <Clock className="w-3 h-3" /> Hora {timeMode === 'UTC' ? 'UTC' : 'local'} <span className="text-rose-500">*</span>
            </label>
            <input
              type="time"
              required
              value={time}
              onChange={(e) => { setTime(e.target.value); setValidationError(''); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Frecuencia (MHz) <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={frequency}
              onChange={(e) => { setFrequency(e.target.value); setValidationError(''); }}
              placeholder={band === '11 metros' ? '27.125' : '7.120'}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-amber-300 font-semibold focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1">
              Modo <span className="text-rose-500">*</span>
            </label>
            <select
              required
              value={mode}
              onChange={(e) => { handleModeChange(e.target.value); setValidationError(''); }}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs font-mono text-white focus:border-amber-400 focus:outline-hidden"
            >
              {HAM_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        </div>

        {band !== '11 metros' && <details className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3 space-y-2" open={Boolean(selectedLLOTAReference)}>
        <summary className="cursor-pointer list-none text-xs font-bold uppercase tracking-wider text-teal-200">Actividad LLOTA {selectedLLOTAReference ? `· ${selectedLLOTAReference.code}` : '· Opcional'}</summary>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-teal-200">Seleccioná una referencia oficial para iniciar la actividad.</span>
            <a href="https://llota.app/referencias.html" target="_blank" rel="noreferrer" className="text-[11px] text-teal-300 underline">Catálogo oficial</a>
          </div>
          {selectedLLOTAReference ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-400/40 bg-slate-950 px-3 py-2">
              <div className="min-w-0">
                <div className="font-mono text-sm font-bold text-teal-200">{selectedLLOTAReference.code}</div>
                <div className="text-xs text-slate-300">{selectedLLOTAReference.name}{selectedLLOTAReference.country ? ` · ${selectedLLOTAReference.country}` : ''}</div>
              </div>
              <button type="button" onClick={() => { const active = selectedLLOTAReference; if (!active) return; const ok = onFinishLLOTA({ id: active.activityId, name: active.name, reference: active.code, activityType: 'LLOTA', startedAt: active.startedAt, finishedAt: new Date().toISOString() }); if (ok) setSelectedLLOTAReference(null); }} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white">Finalizar y archivar</button>
            </div>
          ) : <>
            <input type="search" value={llotaSearch} onChange={(e) => handleLLOTAReferenceInput(e.target.value)} placeholder="Pegá o escribí el código LLOTA o buscá por lugar…" autoComplete="off" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-teal-400 focus:outline-none" />
            {llotaLoading && <p className="text-xs text-slate-400">Cargando referencias oficiales de LLOTA…</p>}
            {!llotaLoading && llotaLoadError && <p role="status" className="text-xs text-amber-300">{llotaLoadError}</p>}
            {!llotaLoading && !llotaLoadError && llotaSearch.trim().length < 2 && <p className="text-xs text-slate-400">Escribí al menos 2 caracteres para buscar en el catálogo mundial oficial ({llotaReferences.length.toLocaleString()} referencias).</p>}
            {filteredLLOTAReferences.length > 0 && <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-700 bg-slate-950">
              {filteredLLOTAReferences.map((reference) => <button key={reference.code} type="button" onClick={() => { setSelectedLLOTAReference({ ...reference, activityId: `llota-${reference.code}-${Date.now()}`, startedAt: new Date().toISOString() }); setLLOTAsearch(''); }} className="block w-full border-b border-slate-800 px-3 py-2 text-left last:border-b-0 hover:bg-teal-900/40">
                <span className="block font-mono text-xs font-bold text-teal-200">{reference.code}</span>
                <span className="block text-xs text-slate-200">{reference.name || 'Referencia LLOTA'}{reference.country ? ` · ${reference.country}` : ''}</span>
              </button>)}
            </div>}
            {!llotaLoading && !llotaLoadError && llotaSearch.trim().length >= 2 && filteredLLOTAReferences.length === 0 && <p className="text-xs text-slate-400">No hay coincidencias en el catálogo oficial. Revisá el código o consultá la página de LLOTA.</p>}
          </>}
          <p className="text-[11px] text-slate-500">La referencia queda seleccionada para los próximos QSO, incluso al cambiar de banda o salir de la app. Cada contacto guarda una copia propia. Usá «Quitar» para desactivarla cuando quieras cargar contactos sin referencia.</p>
        </details>}
        {/* Los datos adicionales se ocultan durante el concurso: quedan los datos esenciales y los dos intercambios. */}
        {!contestMode && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">País / Entidad DXCC</label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Argentina"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-amber-400 focus:outline-hidden"
            />
          </div>

          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Comentarios / Notas</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Dipolo 40m / 100W"
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:border-amber-400 focus:outline-hidden"
            />
          </div>
        </div>}

        {/* Los progresivos solo se muestran al activar el modo concurso. */}
        {contestMode && <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Progresivo / intercambio enviado (opcional)</label>
            <input
              type="text"
              value={exchangeSent}
              onChange={(e) => {
                setExchangeSent(e.target.value);
                localStorage.setItem('logbook_exchange_sent_default', e.target.value);
              }}
              placeholder="Ej. 001, GF05, JUJUY"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-400 focus:outline-hidden"
            />
          </div>
          <div>
            <label className="block text-[11px] text-slate-400 mb-1">Progresivo / intercambio recibido (opcional)</label>
            <input
              type="text"
              value={exchangeReceived}
              onChange={(e) => setExchangeReceived(e.target.value)}
              placeholder="Ej. 014, GF05, CORDOBA"
              className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-600 focus:border-amber-400 focus:outline-hidden"
            />
          </div>
        </div>}

        {/* El QSO se puede guardar solo o preparar la eQSL tras guardarlo. */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-end gap-2 pt-2">
          <button
            type="submit"
            name="qsoAction"
            value="save"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer bg-slate-700 hover:bg-slate-600 text-white border border-slate-600"
          >
            <PlusCircle className="w-4 h-4" />
            CARGAR QSO
          </button>
          <button
            type="submit"
            name="qsoAction"
            value="send"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-bold rounded-xl transition-all active:scale-95 cursor-pointer bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-lg shadow-amber-500/20"
          >
            <PlusCircle className="w-4 h-4" />
            GUARDAR QSO Y ENVIAR eQSL
          </button>
        </div>
      </form>
      <div className="flex justify-end mt-4 border-t border-slate-800 pt-4">
        <button type="button" onClick={() => setIsExpanded(false)} className="rounded-xl border border-slate-700 bg-slate-800 px-5 py-2.5 text-sm font-bold text-white hover:bg-slate-700 transition-colors">Cerrar</button>
      </div>
      </div>}
    </div>
  );
};

```
