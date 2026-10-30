/**
 * Automatic per-device language selection and UI translation.
 * The user's manual choice always takes precedence over browser detection.
 * eQSL artwork is rendered to canvas/images and is intentionally not translated.
 */
export const APP_LANGUAGES = [
  'es','en','pt','pt-br','fr','de','it','nl','pl','ru','uk','zh','ja','ko','ar','hi',
  'tr','sv','no','da','fi','cs','el','ro','hu','id',
] as const;
export type AppLanguage = typeof APP_LANGUAGES[number];

const COUNTRY_LANGUAGE: Record<string, AppLanguage> = {
  AR:'es', BO:'es', CL:'es', CO:'es', CR:'es', CU:'es', DO:'es', EC:'es', ES:'es',
  GT:'es', HN:'es', MX:'es', NI:'es', PA:'es', PE:'es', PR:'es', PY:'es', SV:'es',
  UY:'es', VE:'es', US:'en', CA:'en', GB:'en', AU:'en', NZ:'en', IE:'en', IT:'it',
  BR:'pt-br', PT:'pt', FR:'fr', BE:'fr', DE:'de', AT:'de', CH:'de', NL:'nl', PL:'pl',
  RU:'ru', UA:'uk', CN:'zh', TW:'zh', JP:'ja', KR:'ko', IN:'hi', TR:'tr', SE:'sv',
  NO:'no', DK:'da', FI:'fi', CZ:'cs', GR:'el', RO:'ro', HU:'hu', ID:'id',
};

const PHONE_LANGUAGE: Array<[string, AppLanguage]> = [
  ['39','it'],['54','es'],['55','pt-br'],['351','pt'],['34','es'],['33','fr'],['49','de'],
  ['31','nl'],['32','fr'],['44','en'],['1','en'],['48','pl'],['7','ru'],['380','uk'],
  ['86','zh'],['81','ja'],['82','ko'],['91','hi'],['90','tr'],['46','sv'],['47','no'],
  ['45','da'],['358','fi'],['420','cs'],['30','el'],['40','ro'],['36','hu'],['62','id'],
];

export function normalizeLanguage(value?: string | null): AppLanguage | null {
  const raw = String(value || '').toLowerCase().replace('_', '-');
  if (raw === 'pt-br') return 'pt-br';
  const code = raw.split(/[-_]/)[0];
  return (APP_LANGUAGES as readonly string[]).includes(code) ? code as AppLanguage : null;
}

export function detectBrowserLanguage(): AppLanguage {
  for (const candidate of [...(navigator.languages || []), navigator.language || '']) {
    const language = normalizeLanguage(candidate);
    if (language) return language;
    const country = String(candidate || '').toUpperCase().split(/[-_]/)[1];
    if (country && COUNTRY_LANGUAGE[country]) return COUNTRY_LANGUAGE[country];
  }
  return 'es';
}

export function languageFromPhone(phone?: string | null): AppLanguage | null {
  const digits = String(phone || '').replace(/[^0-9]/g, '');
  if (!digits) return null;
  const raw = String(phone || '').trim();
  const international = raw.startsWith('+') || raw.startsWith('00') || digits.length >= 11;
  if (!international) return null;
  const normalizedDigits = raw.startsWith('00') ? digits.slice(2) : digits;
  const match = [...PHONE_LANGUAGE].sort((a, b) => b[0].length - a[0].length).find(([prefix]) => normalizedDigits.startsWith(prefix));
  return match?.[1] || null;
}

export function languageFromCallsign(callsign?: string | null): AppLanguage | null {
  const call = String(callsign || '').trim().toUpperCase();
  // Las SD de 11 metros empiezan por la división internacional numérica.
  // La división 34 corresponde a España/Canarias; se prueba el prefijo más largo.
  const numeric = call.match(/^(\d{1,3})[A-Z]/)?.[1];
  if (numeric) {
    const divisionLanguages: Record<string, AppLanguage> = {
      '1':'it','2':'en','3':'pt-br','4':'es','5':'es','6':'es','7':'es','8':'es','9':'en',
      '10':'en','11':'es','12':'es','13':'de','14':'es','15':'fr','16':'fr','17':'en','18':'el',
      '19':'mt' as AppLanguage,'20':'pt','21':'en','22':'fr','23':'fr','24':'en','25':'en','26':'en',
      '27':'no','28':'he' as AppLanguage,'29':'da','30':'es','31':'en','32':'en','33':'en','34':'es',
      '35':'fr','36':'fr','37':'en','38':'en','39':'fr','40':'en','41':'fr','42':'es','43':'en',
      '44':'en','45':'en','46':'en','47':'en','48':'ar','49':'es','50':'en','51':'en','52':'en',
      '53':'es','54':'es','55':'es','56':'es','57':'nl' as AppLanguage,'58':'es','59':'es','60':'en',
      '61':'ja','62':'ko','63':'vi' as AppLanguage,'64':'ur' as AppLanguage,'65':'fa' as AppLanguage,
      '66':'th' as AppLanguage,'67':'es','68':'en','69':'en','70':'en','71':'en','72':'zh','73':'fr',
      '74':'fr','75':'en','76':'en','77':'fr','78':'en','79':'en','80':'en','81':'bn' as AppLanguage,
      '82':'zh','83':'zh','84':'mn' as AppLanguage,'85':'ne' as AppLanguage,'86':'hi','87':'ur' as AppLanguage,
      '88':'zh','89':'ja','90':'en','91':'fr','92':'en','93':'en','94':'en','95':'en','96':'en',
      '97':'en','98':'en','99':'fr'
    };
    for (let size = numeric.length; size >= 1; size--) {
      const language = divisionLanguages[numeric.slice(0, size)];
      if (language && (APP_LANGUAGES as readonly string[]).includes(language)) return language;
    }
  }
  if (/^(LU|LW|AY|AZ|LO|LP|LQ|LS|LT|LR)/.test(call)) return 'es';
  if (/^(I[0-9]|IK|IZ|IW|IN|IS|IT|IU|IV|IX)/.test(call)) return 'it';
  if (/^PY|^PP|^PR|^PS|^PT|^PU|^PV|^PW|^PX|^ZV|^ZW|^ZX/.test(call)) return 'pt-br';
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

const TRANSLATION_CACHE_KEY = 'app_translation_cache_v1';
const translationCache = new Map<string, string>();
try {
  const saved = JSON.parse(localStorage.getItem(TRANSLATION_CACHE_KEY) || '{}') as Record<string, string>;
  for (const [key, value] of Object.entries(saved)) if (typeof value === 'string' && value) translationCache.set(key, value);
} catch { /* Ignore unavailable or damaged cache. */ }
function persistTranslationCache() {
  try { localStorage.setItem(TRANSLATION_CACHE_KEY, JSON.stringify(Object.fromEntries(Array.from(translationCache.entries()).slice(-400)))); } catch { /* Cache is optional. */ }
}
const appliedText = new WeakMap<Text, { source: string; translated: string; language: string }>();
const pendingLanguage = new WeakMap<Text, AppLanguage>();
let observer: MutationObserver | null = null;
let currentLanguage: AppLanguage = 'es';
let languageGeneration = 0;
let translationBatchRunning = false;
let rescanRequested = false;
let scanTimer: number | null = null;
const pendingAttributes = new WeakMap<HTMLElement, Set<string>>();

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
  // Use a same-origin endpoint so translation does not depend on browser CORS
  // rules or expose the third-party request directly to every device.
  const response = await fetch('/api/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: source, language }),
  });
  if (!response.ok) throw new Error('Translation unavailable');
  const data = await response.json();
  const translated = typeof data?.translated === 'string' ? data.translated : '';
  if (!translated) throw new Error('Empty translation');
  translationCache.set(key, translated);
  if (translationCache.size > 400) translationCache.delete(translationCache.keys().next().value as string);
  persistTranslationCache();
  return translated;
}

async function translateNode(node: Text, language: AppLanguage): Promise<void> {
  if (isExcludedTextNode(node) || pendingLanguage.get(node) === language) return;
  const source = node.nodeValue || '';
  const generation = languageGeneration;
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
  pendingLanguage.set(node, language);
  try {
    const translated = await translateOne(text, language);
    if (generation === languageGeneration && language === currentLanguage && node.isConnected && (node.nodeValue || '').trim() === source.trim()) {
      const leading = source.match(/^\s*/)?.[0] || '';
      const trailing = source.match(/\s*$/)?.[0] || '';
      node.nodeValue = leading + translated + trailing;
      appliedText.set(node, { source: original, translated: node.nodeValue || translated, language });
    }
  } catch {
    // Keep the original text if the translation service is unavailable.
  } finally {
    if (pendingLanguage.get(node) === language) pendingLanguage.delete(node);
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
      let pending = pendingAttributes.get(element);
      if (!pending) {
        pending = new Set<string>();
        pendingAttributes.set(element, pending);
      }
      if (pending.has(attribute)) continue;
      if (element.getAttribute(attribute) === source && language === 'es') continue;
      pending.add(attribute);
      void translateOne(source, language).then((value) => {
        if (language === currentLanguage && element.isConnected && element.getAttribute(marker) === source) element.setAttribute(attribute, value);
      }).catch(() => {}).finally(() => {
        pending?.delete(attribute);
      });
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
    if (translationBatchRunning) {
      rescanRequested = true;
      return;
    }
    const eligible = nodes.filter((textNode) => {
      if (isExcludedTextNode(textNode) || pendingLanguage.get(textNode) === currentLanguage) return false;
      const prior = appliedText.get(textNode);
      return !(prior && textNode.nodeValue === prior.translated && prior.language === currentLanguage);
    });
    // Work in small batches so large screens do not flood the translation service.
    const batch = eligible.slice(0, 8);
    if (batch.length) {
      translationBatchRunning = true;
      void Promise.all(batch.map((textNode) => translateNode(textNode, currentLanguage))).finally(() => {
        translationBatchRunning = false;
        if (eligible.length > batch.length || rescanRequested) {
          rescanRequested = false;
          window.setTimeout(scan, 180);
        }
      });
    }
    translateAttributes(document.body, currentLanguage);
    document.documentElement.lang = currentLanguage;
  };
  const changeLanguage = () => {
    const selected = getInitialAppLanguage();
    if (selected !== currentLanguage) {
      currentLanguage = selected;
      languageGeneration += 1;
    }
    scan();
  };
  scan();
  // React and translation both update text nodes. Observing characterData made
  // every translated word trigger a full-document scan, creating a feedback loop
  // that could exhaust memory on slower desktop browsers. Only new DOM subtrees
  // require another pass; the initial scan already handles existing text.
  observer = new MutationObserver((records) => {
    if (!records.some((record) => record.addedNodes.length > 0)) return;
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scan();
    }, 160);
  });
  observer.observe(document.body, { childList: true, subtree: true });
  window.addEventListener('user-profile-updated', changeLanguage);
  window.addEventListener('storage', changeLanguage);
  return () => {
    observer?.disconnect();
    observer = null;
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = null;
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
    pt: 'Partilhe o LogBook eQSL EXPRESS: registe os seus contactos de rádio e envie eQSL facilmente.',
    'pt-br': 'Compartilhe o LogBook eQSL EXPRESS: registre seus contatos de rádio e envie cartões eQSL com facilidade.',
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

export function getLocalizedEQSLNotification(language: AppLanguage, kind: 'received' | 'reply', cardUrl = ''): string {
  const messages: Record<AppLanguage, { received: string; reply: string; view: string }> = {
    es:{received:'📻 ¡Has recibido una eQSL!',reply:'📻 ¡Han respondido a tu eQSL!',view:'Ver y descargar la tarjeta'},
    en:{received:'📻 You received an eQSL!',reply:'📻 Someone replied to your eQSL!',view:'View and download the card'},
    pt:{received:'📻 Recebeu uma eQSL!',reply:'📻 Recebeu uma resposta à sua eQSL!',view:'Ver e descarregar o cartão'},
    'pt-br':{received:'📻 Você recebeu uma eQSL!',reply:'📻 Responderam à sua eQSL!',view:'Ver e baixar o cartão'},
    fr:{received:'📻 Vous avez reçu une eQSL !',reply:'📻 Une réponse à votre eQSL est arrivée !',view:'Voir et télécharger la carte'},
    de:{received:'📻 Du hast eine eQSL erhalten!',reply:'📻 Deine eQSL wurde beantwortet!',view:'Karte ansehen und herunterladen'},
    it:{received:'📻 Hai ricevuto una eQSL!',reply:'📻 Hai ricevuto una risposta alla tua eQSL!',view:'Visualizza e scarica la cartolina'},
    nl:{received:'📻 Je hebt een eQSL ontvangen!',reply:'📻 Er is gereageerd op je eQSL!',view:'Kaart bekijken en downloaden'},
    pl:{received:'📻 Otrzymałeś eQSL!',reply:'📻 Otrzymałeś odpowiedź na eQSL!',view:'Zobacz i pobierz kartę'},
    ru:{received:'📻 Вы получили eQSL!',reply:'📻 Получен ответ на вашу eQSL!',view:'Посмотреть и скачать карточку'},
    uk:{received:'📻 Ви отримали eQSL!',reply:'📻 Ви отримали відповідь на eQSL!',view:'Переглянути та завантажити картку'},
    zh:{received:'📻 您收到了一张 eQSL！',reply:'📻 您的 eQSL 收到回复！',view:'查看并下载卡片'},
    ja:{received:'📻 eQSLを受信しました！',reply:'📻 eQSLへの返信が届きました！',view:'カードを表示してダウンロード'},
    ko:{received:'📻 eQSL을 받았습니다!',reply:'📻 eQSL 답장이 도착했습니다!',view:'카드 보기 및 다운로드'},
    ar:{received:'📻 لقد تلقيت بطاقة eQSL!',reply:'📻 وصل رد على بطاقة eQSL الخاصة بك!',view:'عرض البطاقة وتنزيلها'},
    hi:{received:'📻 आपको eQSL मिला है!',reply:'📻 आपकी eQSL का जवाब आया है!',view:'कार्ड देखें और डाउनलोड करें'},
    tr:{received:'📻 Bir eQSL aldınız!',reply:'📻 eQSL kartınıza yanıt geldi!',view:'Kartı görüntüle ve indir'},
    sv:{received:'📻 Du har fått en eQSL!',reply:'📻 Du har fått svar på din eQSL!',view:'Visa och ladda ner kortet'},
    no:{received:'📻 Du har mottatt en eQSL!',reply:'📻 Du har fått svar på eQSL-en din!',view:'Vis og last ned kortet'},
    da:{received:'📻 Du har modtaget en eQSL!',reply:'📻 Du har fået svar på din eQSL!',view:'Se og download kortet'},
    fi:{received:'📻 Sait eQSL-kortin!',reply:'📻 Sait vastauksen eQSL-korttiisi!',view:'Näytä ja lataa kortti'},
    cs:{received:'📻 Obdrželi jste eQSL!',reply:'📻 Přišla odpověď na vaši eQSL!',view:'Zobrazit a stáhnout kartu'},
    el:{received:'📻 Λάβατε μια eQSL!',reply:'📻 Ήρθε απάντηση στην eQSL σας!',view:'Προβολή και λήψη κάρτας'},
    ro:{received:'📻 Ați primit o eQSL!',reply:'📻 Ați primit un răspuns la eQSL!',view:'Vezi și descarcă felicitarea'},
    hu:{received:'📻 eQSL-t kaptál!',reply:'📻 Válasz érkezett az eQSL-edre!',view:'Kártya megtekintése és letöltése'},
    id:{received:'📻 Anda menerima eQSL!',reply:'📻 Ada balasan untuk eQSL Anda!',view:'Lihat dan unduh kartu'},
  };
  const item = messages[language] || messages.en;
  return kind === 'received'
    ? item.received + '\\n' + item.view + ': ' + cardUrl
    : item.reply + '\\n' + item.view + ': ' + cardUrl;
}


export function getLocalizedWelcome(language: AppLanguage) {
  const messages: Record<AppLanguage, { title: string; body: string; close: string }> = {
    es: { title: '¡Bienvenido a LogBook eQSL EXPRESS!', body: 'Aquí encontrarás las herramientas para hacer radio de forma más fácil.', close: 'CERRAR Y ENTRAR A LA APP' },
    en: { title: 'Welcome to LogBook eQSL EXPRESS!', body: 'Here you will find tools to make radio communication easier.', close: 'CLOSE AND ENTER THE APP' },
    pt: { title: 'Bem-vindo ao LogBook eQSL EXPRESS!', body: 'Aqui encontrará ferramentas para tornar a atividade de rádio mais fácil.', close: 'FECHAR E ENTRAR NO APP' },
    'pt-br': { title: 'Bem-vindo ao LogBook eQSL EXPRESS!', body: 'Aqui você encontrará ferramentas para facilitar suas comunicações de rádio.', close: 'FECHAR E ENTRAR NO APP' },
    fr: { title: 'Bienvenue sur LogBook eQSL EXPRESS !', body: 'Vous trouverez ici des outils pour faciliter vos communications radio.', close: 'FERMER ET ENTRER DANS L’APPLICATION' },
    de: { title: 'Willkommen bei LogBook eQSL EXPRESS!', body: 'Hier findest du Werkzeuge, die den Funkbetrieb einfacher machen.', close: 'SCHLIESSEN UND APP ÖFFNEN' },
    it: { title: 'Benvenuto su LogBook eQSL EXPRESS!', body: 'Qui troverai strumenti per rendere più semplice l’attività radio.', close: 'CHIUDI E APRI L’APP' },
    nl: { title: 'Welkom bij LogBook eQSL EXPRESS!', body: 'Hier vind je hulpmiddelen om radioverbindingen eenvoudiger te maken.', close: 'SLUITEN EN APP OPENEN' },
    pl: { title: 'Witamy w LogBook eQSL EXPRESS!', body: 'Znajdziesz tu narzędzia ułatwiające łączności radiowe.', close: 'ZAMKNIJ I OTWÓRZ APLIKACJĘ' },
    ru: { title: 'Добро пожаловать в LogBook eQSL EXPRESS!', body: 'Здесь вы найдете инструменты для упрощения радиосвязи.', close: 'ЗАКРЫТЬ И ОТКРЫТЬ ПРИЛОЖЕНИЕ' },
    uk: { title: 'Ласкаво просимо до LogBook eQSL EXPRESS!', body: 'Тут ви знайдете інструменти для спрощення радіозв’язку.', close: 'ЗАКРИТИ Й ВІДКРИТИ ЗАСТОСУНОК' },
    zh: { title: '欢迎使用 LogBook eQSL EXPRESS！', body: '这里有帮助您轻松进行无线电通信的工具。', close: '关闭并进入应用' },
    ja: { title: 'LogBook eQSL EXPRESSへようこそ！', body: '無線通信をより簡単にするツールをご利用いただけます。', close: '閉じてアプリを開く' },
    ko: { title: 'LogBook eQSL EXPRESS에 오신 것을 환영합니다!', body: '무선 통신을 더 쉽게 할 수 있는 도구를 만나보세요.', close: '닫고 앱 열기' },
    ar: { title: 'مرحبًا بك في LogBook eQSL EXPRESS!', body: 'ستجد هنا أدوات تجعل الاتصالات اللاسلكية أسهل.', close: 'إغلاق وفتح التطبيق' },
    hi: { title: 'LogBook eQSL EXPRESS में आपका स्वागत है!', body: 'यहाँ आपको रेडियो संचार को आसान बनाने वाले उपकरण मिलेंगे।', close: 'बंद करें और ऐप खोलें' },
    tr: { title: 'LogBook eQSL EXPRESS’e hoş geldiniz!', body: 'Burada telsiz iletişimini kolaylaştıran araçlar bulacaksınız.', close: 'KAPAT VE UYGULAMAYI AÇ' },
    sv: { title: 'Välkommen till LogBook eQSL EXPRESS!', body: 'Här hittar du verktyg som gör radiosamband enklare.', close: 'STÄNG OCH ÖPPNA APPEN' },
    no: { title: 'Velkommen til LogBook eQSL EXPRESS!', body: 'Her finner du verktøy som gjør radiosamband enklere.', close: 'LUKK OG ÅPNE APPEN' },
    da: { title: 'Velkommen til LogBook eQSL EXPRESS!', body: 'Her finder du værktøjer, der gør radiokontakter nemmere.', close: 'LUK OG ÅBN APPEN' },
    fi: { title: 'Tervetuloa LogBook eQSL EXPRESS -sovellukseen!', body: 'Täältä löydät työkaluja radioyhteyksien helpottamiseen.', close: 'SULJE JA AVAA SOVELLUS' },
    cs: { title: 'Vítejte v LogBook eQSL EXPRESS!', body: 'Najdete zde nástroje, které usnadní rádiová spojení.', close: 'ZAVŘÍT A OTEVŘÍT APLIKACI' },
    el: { title: 'Καλώς ήρθατε στο LogBook eQSL EXPRESS!', body: 'Εδώ θα βρείτε εργαλεία που κάνουν τις ραδιοεπικοινωνίες ευκολότερες.', close: 'ΚΛΕΙΣΙΜΟ ΚΑΙ ΑΝΟΙΓΜΑ ΕΦΑΡΜΟΓΗΣ' },
    ro: { title: 'Bine ați venit la LogBook eQSL EXPRESS!', body: 'Aici veți găsi instrumente care facilitează comunicațiile radio.', close: 'ÎNCHIDE ȘI DESCHIDE APLICAȚIA' },
    hu: { title: 'Üdvözöljük a LogBook eQSL EXPRESS alkalmazásban!', body: 'Itt a rádiókapcsolatokat megkönnyítő eszközöket talál.', close: 'BEZÁRÁS ÉS ALKALMAZÁS MEGNYITÁSA' },
    id: { title: 'Selamat datang di LogBook eQSL EXPRESS!', body: 'Di sini Anda akan menemukan alat untuk memudahkan komunikasi radio.', close: 'TUTUP DAN BUKA APLIKASI' },
  };
  return messages[language] || messages.en;
}
