/**
 * Identificación visual de países para radioafición y 11 metros.
 * Para CB/11 m se prioriza la división numérica internacional (p. ej. 34 = Canarias,
 * 4 = Argentina); para indicativos de radioaficionado se usan prefijos ITU.
 */
const DIVISION_COUNTRY: Record<string, string> =   {
    "1": "Italia",
    "2": "Estados Unidos",
    "3": "Brasil",
    "4": "Argentina",
    "5": "Venezuela",
    "6": "Colombia",
    "7": "Curazao",
    "8": "Perú",
    "9": "Canadá",
    "10": "México",
    "11": "Puerto Rico",
    "12": "Uruguay",
    "13": "Alemania",
    "14": "Francia",
    "15": "Suiza",
    "16": "Bélgica",
    "17": "Hawái",
    "18": "Grecia",
    "19": "Países Bajos",
    "20": "Noruega",
    "21": "Suecia",
    "22": "Guayana Francesa",
    "23": "Jamaica",
    "24": "Panamá",
    "25": "Japón",
    "26": "Reino Unido",
    "27": "Islandia",
    "28": "Honduras",
    "29": "Irlanda",
    "30": "España",
    "31": "Portugal",
    "32": "Chile",
    "33": "Estados Unidos",
    "34": "España",
    "35": "Austria",
    "36": "San Marino",
    "37": "República Dominicana",
    "38": "Groenlandia",
    "39": "Angola",
    "40": "Liechtenstein",
    "41": "Nueva Zelanda",
    "42": "Liberia",
    "43": "Australia",
    "44": "Sudáfrica",
    "45": "Serbia",
    "46": "Alemania",
    "47": "Dinamarca",
    "48": "Arabia Saudita",
    "49": "España",
    "50": "Rusia",
    "51": "Andorra",
    "52": "Dinamarca",
    "53": "El Salvador",
    "54": "Luxemburgo",
    "55": "Gibraltar",
    "56": "Finlandia",
    "57": "India",
    "58": "Malasia",
    "59": "Grecia",
    "60": "Hong Kong",
    "61": "Ecuador",
    "62": "Guam",
    "63": "Santa Elena",
    "64": "Senegal",
    "65": "Sierra Leona",
    "66": "Mauritania",
    "67": "Paraguay",
    "68": "Reino Unido",
    "69": "Costa Rica",
    "70": "Samoa Americana",
    "71": "Estados Unidos",
    "72": "Guatemala",
    "73": "Surinam",
    "74": "Namibia",
    "75": "Portugal",
    "76": "Marruecos",
    "77": "Ghana",
    "78": "Zambia",
    "79": "Filipinas",
    "80": "Bolivia",
    "81": "Colombia",
    "82": "Estados Unidos",
    "83": "Tanzania",
    "84": "Costa de Marfil",
    "85": "Zimbabue",
    "86": "Nepal",
    "87": "Yemen",
    "88": "Cuba",
    "89": "Nigeria",
    "90": "Grecia",
    "91": "Indonesia",
    "92": "Libia",
    "93": "Malta",
    "94": "Emiratos Árabes Unidos",
    "95": "Mongolia",
    "96": "Tonga",
    "97": "Israel",
    "98": "Singapur",
    "99": "Fiyi",
    "153": "Tailandia"
  };

const FLAGS: Record<string, string> = {
  'Argentina':'🇦🇷','España':'🇪🇸','Brasil':'🇧🇷','Uruguay':'🇺🇾','Chile':'🇨🇱','Perú':'🇵🇪',
  'Bolivia':'🇧🇴','Paraguay':'🇵🇾','Colombia':'🇨🇴','Venezuela':'🇻🇪','Ecuador':'🇪🇨','México':'🇲🇽',
  'Estados Unidos':'🇺🇸','Canadá':'🇨🇦','Reino Unido':'🇬🇧','Italia':'🇮🇹','Francia':'🇫🇷','Alemania':'🇩🇪',
  'Bélgica':'🇧🇪','Portugal':'🇵🇹','Japón':'🇯🇵','Australia':'🇦🇺','Nueva Zelanda':'🇳🇿','Noruega':'🇳🇴',
  'Dinamarca':'🇩🇰','Grecia':'🇬🇷','Israel':'🇮🇱','China':'🇨🇳','India':'🇮🇳','Filipinas':'🇵🇭',
  'Tailandia':'🇹🇭','Cuba':'🇨🇺','Panamá':'🇵🇦','Costa Rica':'🇨🇷','El Salvador':'🇸🇻','Guatemala':'🇬🇹',
  'Honduras':'🇭🇳','Nicaragua':'🇳🇮','Jamaica':'🇯🇲','Hawái':'🇺🇸','Escocia':'🇬🇧','Islas Malvinas':'🇫🇰',
  'Taiwán':'🇹🇼','Singapur':'🇸🇬','Fiyi':'🇫🇯','Suiza':'🇨🇭','Países Bajos':'🇳🇱','Suecia':'🇸🇪',
  'Curazao':'🇨🇼','Puerto Rico':'🇵🇷','Islandia':'🇮🇸','Irlanda':'🇮🇪','Austria':'🇦🇹','San Marino':'🇸🇲',
  'República Dominicana':'🇩🇴','Groenlandia':'🇬🇱','Angola':'🇦🇴','Liechtenstein':'🇱🇮','Liberia':'🇱🇷',
  'Sudáfrica':'🇿🇦','Serbia':'🇷🇸','Rusia':'🇷🇺','Andorra':'🇦🇩','Luxemburgo':'🇱🇺','Gibraltar':'🇬🇮',
  'Finlandia':'🇫🇮','Malasia':'🇲🇾','Guayana Francesa':'🇬🇫','Arabia Saudita':'🇸🇦','El Salvador':'🇸🇻',
  'Santa Elena':'🇸🇭','Senegal':'🇸🇳','Sierra Leona':'🇸🇱','Mauritania':'🇲🇷','Costa de Marfil':'🇨🇮',
  'Zimbabue':'🇿🇼','Nepal':'🇳🇵','Yemen':'🇾🇪','Nigeria':'🇳🇬','Namibia':'🇳🇦','Marruecos':'🇲🇦',
  'Ghana':'🇬🇭','Zambia':'🇿🇲','Surinam':'🇸🇷','Samoa Americana':'🇦🇸','Guam':'🇬🇺','Tanzania':'🇹🇿',
  'Libia':'🇱🇾','Malta':'🇲🇹','Emiratos Árabes Unidos':'🇦🇪','Mongolia':'🇲🇳','Tonga':'🇹🇴','Andorra':'🇦🇩',
  'Samoa':'🇼🇸','Hong Kong':'🇭🇰'
};

const HAM_PREFIX_COUNTRY: Record<string, string> = {
  LU:'Argentina',LW:'Argentina',AY:'Argentina',AZ:'Argentina',LO:'Argentina',LP:'Argentina',LQ:'Argentina',LR:'Argentina',LS:'Argentina',LT:'Argentina',
  EA:'España',EB:'España',EC:'España',ED:'España',EE:'España',EF:'España',EG:'España',EH:'España',AM:'España',AN:'España',AO:'España',
  CT:'Portugal',CR:'Portugal',CS:'Portugal',CU:'Portugal',
  PY:'Brasil',PP:'Brasil',PR:'Brasil',PS:'Brasil',PT:'Brasil',PU:'Brasil',PV:'Brasil',PW:'Brasil',PX:'Brasil',PZ:'Brasil',ZV:'Brasil',ZW:'Brasil',ZX:'Brasil',ZY:'Brasil',ZZ:'Brasil',
  CX:'Uruguay',CV:'Uruguay',CW:'Uruguay',CE:'Chile',CA:'Chile',CB:'Chile',XQ:'Chile',XR:'Chile','3G':'Chile',
  HK:'Colombia',HJ:'Colombia','5J':'Colombia','5K':'Colombia',
  OA:'Perú',OB:'Perú',OC:'Perú',CP:'Bolivia',ZP:'Paraguay',YV:'Venezuela',YW:'Venezuela',YX:'Venezuela',YY:'Venezuela','4M':'Venezuela',
  HC:'Ecuador',HD:'Ecuador',XE:'México',XB:'México',XC:'México',XD:'México',XF:'México',XG:'México',XH:'México',
  '4A':'México','4B':'México','4C':'México','6D':'México','6E':'México','6F':'México','6G':'México','6H':'México','6I':'México','6J':'México',
  W:'Estados Unidos',K:'Estados Unidos',N:'Estados Unidos',AA:'Estados Unidos',AB:'Estados Unidos',AC:'Estados Unidos',AD:'Estados Unidos',AE:'Estados Unidos',AF:'Estados Unidos',AG:'Estados Unidos',AI:'Estados Unidos',AJ:'Estados Unidos',AK:'Estados Unidos',
  VE:'Canadá',VA:'Canadá',VO:'Canadá',VY:'Canadá',VZ:'Canadá',CF:'Canadá',CG:'Canadá',CH:'Canadá',CI:'Canadá',CJ:'Canadá',CK:'Canadá',CY:'Canadá',CZ:'Canadá',
  G:'Reino Unido',M:'Reino Unido',GM:'Reino Unido',GW:'Reino Unido',GI:'Reino Unido',GD:'Reino Unido',GJ:'Reino Unido',GU:'Reino Unido',
  F:'Francia',TM:'Francia',TO:'Francia',TK:'Francia',DL:'Alemania',DA:'Alemania',DB:'Alemania',DC:'Alemania',DD:'Alemania',DF:'Alemania',DG:'Alemania',DH:'Alemania',DJ:'Alemania',DK:'Alemania',DM:'Alemania',DN:'Alemania',DO:'Alemania',DP:'Alemania',DQ:'Alemania',DR:'Alemania',
  I:'Italia',JA:'Japón',JE:'Japón',JF:'Japón',JG:'Japón',JH:'Japón',JI:'Japón',JJ:'Japón',JK:'Japón',JL:'Japón',JM:'Japón',JN:'Japón',JO:'Japón',JP:'Japón',JQ:'Japón',JR:'Japón',JS:'Japón','7J':'Japón','7K':'Japón','7L':'Japón','7M':'Japón','7N':'Japón','8J':'Japón',
  VK:'Australia',ZL:'Nueva Zelanda',PA:'Países Bajos',PB:'Países Bajos',PC:'Países Bajos',PD:'Países Bajos',PE:'Países Bajos',PF:'Países Bajos',PG:'Países Bajos',PH:'Países Bajos',PI:'Países Bajos',
  LA:'Noruega',LB:'Noruega',LC:'Noruega',LD:'Noruega',LE:'Noruega',LF:'Noruega',LG:'Noruega',LH:'Noruega',LI:'Noruega',LJ:'Noruega',LK:'Noruega',LL:'Noruega',LM:'Noruega',LN:'Noruega',
  OZ:'Dinamarca',OU:'Dinamarca',SM:'Suecia',SA:'Suecia',SB:'Suecia',SC:'Suecia',SD:'Suecia',SE:'Suecia',SF:'Suecia',SG:'Suecia',SH:'Suecia',SI:'Suecia',SJ:'Suecia',SK:'Suecia',SL:'Suecia',
  OH:'Finlandia',OF:'Finlandia',OG:'Finlandia',OI:'Finlandia',HB:'Suiza',HE:'Suiza',ON:'Bélgica',OO:'Bélgica',OP:'Bélgica',OQ:'Bélgica',OR:'Bélgica',OE:'Austria',
  SV:'Grecia',SW:'Grecia',SX:'Grecia',SY:'Grecia',SZ:'Grecia',J4:'Grecia',
  SP:'Polonia',SQ:'Polonia',SO:'Polonia',SN:'Polonia',SR:'Polonia',HF:'Polonia','3Z':'Polonia',
  YO:'Rumania',YP:'Rumania',YQ:'Rumania',YR:'Rumania',HA:'Hungría',HG:'Hungría',OK:'Chequia',OL:'Chequia',
  HS:'Tailandia',E2:'Tailandia',HL:'Corea del Sur',DS:'Corea del Sur',D7:'Corea del Sur',D8:'Corea del Sur',D9:'Corea del Sur',
  YB:'Indonesia',YC:'Indonesia',YD:'Indonesia',YE:'Indonesia',YF:'Indonesia',YG:'Indonesia',YH:'Indonesia','8A':'Indonesia','8B':'Indonesia','8E':'Indonesia','8I':'Indonesia',
  UA:'Rusia',RA:'Rusia',RZ:'Rusia',UR:'Ucrania',UT:'Ucrania',UU:'Ucrania',UV:'Ucrania',UW:'Ucrania',UX:'Ucrania',UY:'Ucrania',UZ:'Ucrania'
};


/**
 * Clasifica el identificador visible: una SD de 11 metros comienza con
 * la división numérica (p. ej. 4RC978 o 34RC879); un indicativo de
 * radioaficionado comienza por letras (p. ej. LU1TSB o PY1ABC).
 * En Live Spot la banda del QSO prevalece sobre esta detección automática.
 */
export function is11MeterStationIdentifier(identifier: string): boolean {
  const normalized = String(identifier || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return /^\d{1,3}[A-Z]/.test(normalized);
}

export function countryForCallsign(callsign: string, savedCountry?: string, is11m = false): string {
  const call = String(callsign || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!call) return '';

  // Los indicativos numéricos se interpretan como 11 metros cuando el contexto
  // lo confirma o cuando no existe otro dato de banda (presencia en línea/generador).
  const numericCall = /^\d/.test(call);
  if (is11m || numericCall) {
    const match = call.match(/^(\d{1,3})/);
    if (match) {
      // La división 34 identifica Canarias (España); las demás se buscan
      // por prefijo más largo para no confundir 34 con la división 3.
      const division = match[1];
      if (DIVISION_COUNTRY[division]) return DIVISION_COUNTRY[division];
      for (let length = Math.min(3, division.length - 1); length >= 1; length--) {
        const shorter = division.slice(0, length);
        if (DIVISION_COUNTRY[shorter]) return DIVISION_COUNTRY[shorter];
      }
    }
  }

  // Para radioafición prevalecen los prefijos ITU sobre datos de perfil antiguos.
  const keys = Object.keys(HAM_PREFIX_COUNTRY).sort((a,b)=>b.length-a.length);
  const prefix = keys.find(key => call.startsWith(key));
  if (prefix) return HAM_PREFIX_COUNTRY[prefix];
  if (savedCountry?.trim()) return savedCountry.trim();
  return '';
}

export function flagForCallsign(callsign: string, savedCountry?: string, is11m = false): string {
  const country = countryForCallsign(callsign, savedCountry, is11m);
  return FLAGS[country] || '🏳️';
}
