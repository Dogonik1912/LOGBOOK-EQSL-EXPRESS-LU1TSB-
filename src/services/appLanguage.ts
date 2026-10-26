/**
 * Automatic per-device language selection and UI translation.
 * The user's manual choice always takes precedence over browser detection.
 * eQSL artwork is rendered to canvas/images and is intentionally not translated.
 */
export const APP_LANGUAGES = [
  'es','en','pt','fr','de','it','nl','pl','ru','uk','zh','ja','ko','ar','hi',
  'tr','sv','no','da','fi','cs','el','ro','hu','id',
] as const;
export type AppLanguage = typeof APP_LANGUAGES[number];

const COUNTRY_LANGUAGE: Record<string, AppLanguage> = {
  AR:'es', BO:'es', CL:'es', CO:'es', CR:'es', CU:'es', DO:'es', EC:'es', ES:'es',
  GT:'es', HN:'es', MX:'es', NI:'es', PA:'es', PE:'es', PR:'es', PY:'es', SV:'es',
  UY:'es', VE:'es', US:'en', CA:'en', GB:'en', AU:'en', NZ:'en', IE:'en', IT:'it',
  BR:'pt', PT:'pt', FR:'fr', BE:'fr', DE:'de', AT:'de', CH:'de', NL:'nl', PL:'pl',
  RU:'ru', UA:'uk', CN:'zh', TW:'zh', JP:'ja', KR:'ko', IN:'hi', TR:'tr', SE:'sv',
  NO:'no', DK:'da', FI:'fi', CZ:'cs', GR:'el', RO:'ro', HU:'hu', ID:'id',
};

const PHONE_LANGUAGE: Array<[string, AppLanguage]> = [
  ['39','it'],['54','es'],['55','pt'],['351','pt'],['34','es'],['33','fr'],['49','de'],
  ['31','nl'],['32','fr'],['44','en'],['1','en'],['48','pl'],['7','ru'],['380','uk'],
  ['86','zh'],['81','ja'],['82','ko'],['91','hi'],['90','tr'],['46','sv'],['47','no'],
  ['45','da'],['358','fi'],['420','cs'],['30','el'],['40','ro'],['36','hu'],['62','id'],
];

export function normalizeLanguage(value?: string | null): AppLanguage | null {
  const code = String(value || '').toLowerCase().split(/[-_]/)[0];
  return (APP_LANGUAGES as readonly string[]).includes(code) ? code as AppLanguage : null;
}

export function detectBrowserLanguage(): AppLanguage {
  for (const candidate of [...(navigator.languages || []), navigator.language || '']) {
    const language = normalizeLanguage(candidate);
    if (language) return language;
  }
  return 'es';
}

export function languageFromPhone(phone?: string | null): AppLanguage | null {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const international = String(phone || '').trim().startsWith('+') ? digits : '';
  if (!international) return null;
  const match = PHONE_LANGUAGE.sort((a, b) => b[0].length - a[0].length).find(([prefix]) => digits.startsWith(prefix));
  return match?.[1] || null;
}

export function languageFromCallsign(callsign?: string | null): AppLanguage | null {
  const call = String(callsign || '').trim().toUpperCase();
  if (/^(LU|LW|AY|AZ|LO|LP|LQ|LS|LT|LR)/.test(call)) return 'es';
  if (/^(I[0-9]|IK|IZ|IW|IN|IS|IT|IU|IV|IX)/.test(call)) return 'it';
  if (/^PY|^PP|^PR|^PS|^PT|^PU|^PV|^PW|^PX|^ZV|^ZW|^ZX/.test(call)) return 'pt';
  if (/^(F[0-9]|TM|TO|TK)/.test(call)) return 'fr';
  if (/^(D[ABCEFGHIJKLMPQRSTUVWXYZ]|Y[0-9])/.test(call)) return 'de';
  if (/^(PA|PB|PC|PD|PE|PF|PG|PH|PI)/.test(call)) return 'nl';
  if (/^(SP|SQ|SO|SN|3Z)/.test(call)) return 'pl';
  if (/^(JA|JE|JF|JH|JR|JS|7J|8J)/.test(call)) return 'ja';
  if (/^(K|N|W|AA|AB|AC|AD|AE|AF|AG|AI|AJ|AK)/.test(call)) return 'en';
  return null;
}

export function getInitialAppLanguage(): AppLanguage {
  const saved = normalizeLanguage(localStorage.getItem('app_language'));
  if (saved) return saved;
  const detected = detectBrowserLanguage();
  localStorage.setItem('app_language', detected);
  return detected;
}

const translationCache = new Map<string, string>();
const appliedText = new WeakMap<Text, { source: string; translated: string; language: string }>();
const pending = new Set<Text>();
let observer: MutationObserver | null = null;
let currentLanguage: AppLanguage = 'es';

function isExcludedTextNode(node: Text): boolean {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue?.trim()) return true;
  if (parent.closest('script,style,noscript,textarea,code,pre,canvas,svg,[data-no-translate],[contenteditable="true"]')) return true;
  const value = node.nodeValue.trim();
  if (!/[a-zA-ZÀ-ž\u0400-\u04FF\u4e00-\u9fff]/.test(value)) return true;
  if (/^(LogBook eQSL EXPRESS|eQSL EXPRESS|LU1TSB\/4RC978)$/i.test(value)) return true;
  if (/^(https?:\/\/|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}$)/.test(value)) return true;
  return false;
}

async function translateOne(source: string, language: AppLanguage): Promise<string> {
  if (language === 'es') return source;
  const key = language + '\\u0000' + source;
  const cached = translationCache.get(key);
  if (cached) return cached;
  const endpoint = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
    encodeURIComponent(language) + '&dt=t&q=' + encodeURIComponent(source);
  const response = await fetch(endpoint);
  if (!response.ok) throw new Error('Translation unavailable');
  const data = await response.json();
  const translated = Array.isArray(data?.[0]) ? data[0].map((part: any) => part?.[0] || '').join('') : '';
  if (!translated) throw new Error('Empty translation');
  translationCache.set(key, translated);
  return translated;
}

async function translateNode(node: Text, language: AppLanguage): Promise<void> {
  if (isExcludedTextNode(node) || pending.has(node)) return;
  const source = node.nodeValue || '';
  const prior = appliedText.get(node);
  if (prior && source === prior.translated && prior.language === language) return;
  const original = prior && source === prior.translated ? prior.source : source;
  if (prior && source === prior.translated && prior.language !== language) {
    // Translate from the original source, never from a previous language.
  } else if (prior && source !== prior.translated) {
    appliedText.delete(node);
  }
  const text = original.trim();
  if (!text || text.length > 500) return;
  pending.add(node);
  try {
    const translated = await translateOne(text, language);
    if (node.isConnected && (node.nodeValue || '').trim() === source.trim()) {
      const leading = source.match(/^\s*/)?.[0] || '';
      const trailing = source.match(/\s*$/)?.[0] || '';
      node.nodeValue = leading + translated + trailing;
      appliedText.set(node, { source: original, translated: node.nodeValue || translated, language });
    }
  } catch {
    // Keep the original text if the translation service is unavailable.
  } finally {
    pending.delete(node);
  }
}

function translateAttributes(root: ParentNode, language: AppLanguage) {
  root.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach((element) => {
    if (element.closest('[data-no-translate]')) return;
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      const original = element.getAttribute(attribute);
      if (!original || !/[a-zA-ZÀ-ž]/.test(original) || original.length > 200) continue;
      const marker = 'data-lang-original-' + attribute;
      if (!element.hasAttribute(marker)) element.setAttribute(marker, original);
      const source = element.getAttribute(marker) || original;
      void translateOne(source, language).then((value) => {
        if (element.isConnected && element.getAttribute(marker) === source) element.setAttribute(attribute, value);
      }).catch(() => {});
    }
  });
}

export function startAutomaticUiTranslation(): () => void {
  currentLanguage = getInitialAppLanguage();
  const scan = () => {
    if (!document.body) return;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) if (node.nodeType === Node.TEXT_NODE) nodes.push(node as Text);
    // Bound each pass to avoid flooding the translation endpoint on large screens.
    nodes.slice(0, 120).forEach((textNode) => { void translateNode(textNode, currentLanguage); });
    translateAttributes(document.body, currentLanguage);
    document.documentElement.lang = currentLanguage;
  };
  const changeLanguage = () => {
    currentLanguage = getInitialAppLanguage();
    scan();
  };
  scan();
  observer = new MutationObserver(() => scan());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  window.addEventListener('user-profile-updated', changeLanguage);
  window.addEventListener('storage', changeLanguage);
  return () => {
    observer?.disconnect();
    observer = null;
    window.removeEventListener('user-profile-updated', changeLanguage);
    window.removeEventListener('storage', changeLanguage);
  };
}

export function getRecipientLanguage(phone?: string | null, callsign?: string | null): AppLanguage {
  return languageFromPhone(phone) || languageFromCallsign(callsign) || detectBrowserLanguage();
}

export function getLocalizedShareText(language: AppLanguage): string {
  const messages: Record<AppLanguage, string> = {
    es: 'Compartí LogBook eQSL EXPRESS: registrá tus contactos de radio y enviá eQSL fácilmente.',
    en: 'Share LogBook eQSL EXPRESS: log your radio contacts and send eQSL cards easily.',
    pt: 'Compartilhe o LogBook eQSL EXPRESS: registre seus contatos de rádio e envie eQSL facilmente.',
    fr: 'Partagez LogBook eQSL EXPRESS : enregistrez vos contacts radio et envoyez des eQSL facilement.',
    de: 'Teile LogBook eQSL EXPRESS: protokolliere Funkkontakte und versende eQSL-Karten ganz einfach.',
    it: 'Condividi LogBook eQSL EXPRESS: registra i tuoi collegamenti radio e invia eQSL facilmente.',
    nl: 'Deel LogBook eQSL EXPRESS: registreer je radioverbindingen en verstuur eenvoudig eQSL-kaarten.',
    pl: 'Udostępnij LogBook eQSL EXPRESS: zapisuj łączności radiowe i łatwo wysyłaj karty eQSL.',
    ru: 'Поделитесь LogBook eQSL EXPRESS: записывайте радиосвязи и легко отправляйте eQSL.',
    uk: 'Поділіться LogBook eQSL EXPRESS: записуйте радіозв’язки та легко надсилайте eQSL.',
    zh: '分享 LogBook eQSL EXPRESS：记录无线电联络并轻松发送 eQSL 卡片。',
    ja: 'LogBook eQSL EXPRESSを共有して、無線交信を記録し、eQSLを簡単に送信しましょう。',
    ko: 'LogBook eQSL EXPRESS를 공유하고 무선 교신을 기록하며 eQSL 카드를 쉽게 보내세요.',
    ar: 'شارك LogBook eQSL EXPRESS لتسجيل اتصالاتك اللاسلكية وإرسال بطاقات eQSL بسهولة.',
    hi: 'LogBook eQSL EXPRESS साझा करें, रेडियो संपर्क दर्ज करें और आसानी से eQSL भेजें।',
    tr: 'LogBook eQSL EXPRESS’i paylaşın, telsiz bağlantılarınızı kaydedin ve eQSL kartlarını kolayca gönderin.',
    sv: 'Dela LogBook eQSL EXPRESS: logga dina radiokontakter och skicka eQSL-kort enkelt.',
    no: 'Del LogBook eQSL EXPRESS: loggfør radiokontaktene dine og send eQSL-kort enkelt.',
    da: 'Del LogBook eQSL EXPRESS: log dine radiokontakter og send eQSL-kort nemt.',
    fi: 'Jaa LogBook eQSL EXPRESS: kirjaa radioyhteydet ja lähetä eQSL-kortteja helposti.',
    cs: 'Sdílejte LogBook eQSL EXPRESS: zaznamenávejte rádiová spojení a snadno posílejte eQSL.',
    el: 'Μοιραστείτε το LogBook eQSL EXPRESS: καταγράψτε τις ραδιοεπαφές σας και στείλτε εύκολα eQSL.',
    ro: 'Distribuie LogBook eQSL EXPRESS: înregistrează legăturile radio și trimite ușor eQSL.',
    hu: 'Oszd meg a LogBook eQSL EXPRESS alkalmazást, rögzítsd rádiós kapcsolataidat és küldj eQSL-t egyszerűen.',
    id: 'Bagikan LogBook eQSL EXPRESS: catat kontak radio Anda dan kirim kartu eQSL dengan mudah.',
  };
  return messages[language] || messages.en;
}
