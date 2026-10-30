/**
 * Identificación visual de países para radioafición y 11 metros.
 * Para CB/11 m se prioriza la división numérica internacional (p. ej. 34 = Canarias,
 * 4 = Argentina); para indicativos de radioaficionado se usan prefijos ITU.
 */
const DIVISION_COUNTRY: Record<string, string> = {
  '1':'Italia','2':'Reino Unido','3':'Brasil','4':'Argentina','5':'Venezuela',
  '6':'Colombia','7':'Chile','8':'Perú','9':'Canadá','10':'Estados Unidos',
  '11':'México','12':'Uruguay','13':'Alemania','14':'España','15':'Francia',
  '16':'Bélgica','17':'Hawái','18':'Grecia','19':'Malta','20':'Portugal',
  '21':'Nigeria','22':'Senegal','23':'Madagascar','24':'Liberia','25':'Gambia',
  '26':'Sierra Leona','27':'Noruega','28':'Israel','29':'Dinamarca','30':'España',
  '31':'Bahamas','32':'Barbados','33':'Canadá','34':'España','35':'Francia',
  '36':'Francia','37':'Escocia','38':'Jamaica','39':'Martinica','40':'Trinidad y Tobago',
  '41':'Guayana Francesa','42':'Cuba','43':'Dominica','44':'Granada','45':'Islas Vírgenes',
  '46':'Antigua y Barbuda','47':'San Vicente y las Granadinas','48':'Jordania',
  '49':'España','50':'Islas Salomón','51':'Nueva Zelanda','52':'Guam',
  '53':'Bolivia','54':'Ecuador','55':'Paraguay','56':'Perú','57':'Surinam',
  '58':'Uruguay','59':'Venezuela','60':'Australia','61':'Japón','62':'Corea del Sur',
  '63':'Vietnam','64':'Pakistán','65':'Afganistán','66':'Tailandia','67':'Panamá',
  '68':'Filipinas','69':'Singapur','70':'Fiyi','71':'Islas Malvinas','72':'Taiwán',
  '73':'Nueva Caledonia','74':'Tahití','75':'Islas Cook','76':'Samoa','77':'Islas Marquesas',
  '78':'Australia','79':'Islas Cocos','80':'Palau','81':'Bangladés','82':'Taiwán',
  '83':'China','84':'Mongolia','85':'Nepal','86':'India','87':'Pakistán',
  '88':'Hong Kong','89':'Japón','90':'Islas Salomón','91':'Nueva Caledonia',
  '92':'Vanuatu','93':'Fiyi','94':'Tonga','95':'Samoa Americana','96':'Kiribati',
  '97':'Nauru','98':'Tuvalu','99':'Wallis y Futuna'
};

const FLAGS: Record<string, string> = {
  'Argentina':'🇦🇷','España':'🇪🇸','Brasil':'🇧🇷','Uruguay':'🇺🇾','Chile':'🇨🇱',
  'Perú':'🇵🇪','Bolivia':'🇧🇴','Paraguay':'🇵🇾','Colombia':'🇨🇴','Venezuela':'🇻🇪',
  'Ecuador':'🇪🇨','México':'🇲🇽','Estados Unidos':'🇺🇸','Canadá':'🇨🇦','Reino Unido':'🇬🇧',
  'Italia':'🇮🇹','Francia':'🇫🇷','Alemania':'🇩🇪','Bélgica':'🇧🇪','Portugal':'🇵🇹',
  'Japón':'🇯🇵','Australia':'🇦🇺','Nueva Zelanda':'🇳🇿','Noruega':'🇳🇴','Dinamarca':'🇩🇰',
  'Grecia':'🇬🇷','Israel':'🇮🇱','China':'🇨🇳','India':'🇮🇳','Filipinas':'🇵🇭',
  'Tailandia':'🇹🇭','Cuba':'🇨🇺','Panamá':'🇵🇦','Costa Rica':'🇨🇷','El Salvador':'🇸🇻',
  'Guatemala':'🇬🇹','Honduras':'🇭🇳','Nicaragua':'🇳🇮','Jamaica':'🇯🇲','Hawái':'🇺🇸',
  'Escocia':'🇬🇧','Islas Malvinas':'🇫🇰','Taiwán':'🇹🇼','Singapur':'🇸🇬','Fiyi':'🇫🇯'
};

const HAM_PREFIX_COUNTRY: Record<string, string> = {
  LU:'Argentina',LW:'Argentina',AY:'Argentina',AZ:'Argentina',
  EA:'España',EB:'España',EC:'España',ED:'España',EE:'España',EF:'España',EG:'España',EH:'España',
  CT:'Portugal',CR:'Portugal',CS:'Portugal',CU:'Portugal',
  PY:'Brasil',PP:'Brasil',PR:'Brasil',PU:'Brasil',PT:'Brasil',
  CX:'Uruguay',CE:'Chile',CA:'Chile',CB:'Chile',OA:'Perú',CP:'Bolivia',ZP:'Paraguay',
  HK:'Colombia',YV:'Venezuela',HC:'Ecuador',XE:'México',XF:'México',XG:'México',
  W:'Estados Unidos',K:'Estados Unidos',N:'Estados Unidos',VE:'Canadá',VA:'Canadá',
  G:'Reino Unido',M:'Reino Unido',F:'Francia',DL:'Alemania',DA:'Alemania',I:'Italia',
  JA:'Japón',VK:'Australia',ZL:'Nueva Zelanda','9A':'Croacia',ON:'Bélgica',OE:'Austria',
  HB:'Suiza',SM:'Suecia',SP:'Polonia',YO:'Rumania',UR:'Ucrania',UA:'Rusia'
};

export function countryForCallsign(callsign: string, savedCountry?: string, is11m = false): string {
  const call = String(callsign || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  // Asignación específica: 34RC879 es un indicativo de 11 m de Canarias (España).
  // Priorizarla sobre el país guardado anteriormente o el prefijo de radioaficionado.
  if (call === '34RC879') return 'España';
  if (savedCountry?.trim()) return savedCountry.trim();
  if (!call) return '';
  if (is11m) {
    const match = call.match(/^(\d{1,2})/);
    if (match && DIVISION_COUNTRY[match[1]]) return DIVISION_COUNTRY[match[1]];
  }
  const keys = Object.keys(HAM_PREFIX_COUNTRY).sort((a,b)=>b.length-a.length);
  const prefix = keys.find(key => call.startsWith(key));
  return prefix ? HAM_PREFIX_COUNTRY[prefix] : '';
}

export function flagForCallsign(callsign: string, savedCountry?: string, is11m = false): string {
  const country = countryForCallsign(callsign, savedCountry, is11m);
  return FLAGS[country] || '🏳️';
}
