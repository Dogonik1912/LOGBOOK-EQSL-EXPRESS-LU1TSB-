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
let translationBatchRunning = false;
let rescanRequested = false;
let translationEpoch = 0;
let scanTimer: number | null = null;

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
  const cleanSource = source.trim();
  if (!cleanSource) return source;
  const key = language + '\\u0000' + cleanSource;
  const cached = translationCache.get(key);
  if (cached) return cached;

  const endpoint = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=' +
    encodeURIComponent(language) + '&dt=t&q=' + encodeURIComponent(cleanSource);
  const response = await fetch(endpoint, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Translation unavailable');
  const data = await response.json();
  const translated = Array.isArray(data?.[0])
    ? data[0].map((part: any) => part?.[0] || '').join('')
    : '';
  if (!translated) throw new Error('Empty translation');

  // Keep the cache bounded so a long-running app does not grow indefinitely.
  if (translationCache.size >= 1200) {
    const oldestKey = translationCache.keys().next().value;
    if (oldestKey) translationCache.delete(oldestKey);
  }
  translationCache.set(key, translated);
  return translated;
}

async function translateNode(node: Text, language: AppLanguage, epoch: number): Promise<void> {
  if (isExcludedTextNode(node) || pending.has(node)) return;

  const source = node.nodeValue || '';
  const prior = appliedText.get(node);
  if (prior && source === prior.translated && prior.language === language) return;
  const original = prior && source === prior.translated ? prior.source : source;
  if (prior && source !== prior.translated) appliedText.delete(node);

  const text = original.trim();
  if (!text || text.length > 500) return;
  pending.add(node);
  try {
    const translated = await translateOne(text, language);
    // Discard stale responses when the user switches language mid-request.
    if (epoch !== translationEpoch || !node.isConnected) return;
    if ((node.nodeValue || '').trim() !== source.trim()) return;

    const leading = source.match(/^\\s*/)?.[0] || '';
    const trailing = source.match(/\\s*$/)?.[0] || '';
    node.nodeValue = leading + translated + trailing;
    appliedText.set(node, { source: original, translated: node.nodeValue || translated, language });
  } catch {
    // Translation is best-effort: leave the original text readable on network/API failure.
  } finally {
    pending.delete(node);
  }
}

function translateAttributes(root: ParentNode, language: AppLanguage, epoch: number) {
  root.querySelectorAll<HTMLElement>('[placeholder],[title],[aria-label]').forEach((element) => {
    if (element.closest('[data-no-translate]')) return;
    for (const attribute of ['placeholder', 'title', 'aria-label']) {
      const original = element.getAttribute('data-lang-original-' + attribute) || element.getAttribute(attribute);
      if (!original || !/[a-zA-ZÀ-ž\\u0400-\\u04FF\\u4e00-\\u9fff]/.test(original) || original.length > 200) continue;
      const marker = 'data-lang-original-' + attribute;
      if (!element.hasAttribute(marker)) element.setAttribute(marker, original);
      void translateOne(original, language).then((value) => {
        if (epoch === translationEpoch && element.isConnected && element.getAttribute(marker) === original) {
          element.setAttribute(attribute, value);
        }
      }).catch(() => {});
    }
  });
}

export function startAutomaticUiTranslation(): () => void {
  currentLanguage = getInitialAppLanguage();

  const scan = () => {
    if (!document.body) return;
    const epoch = translationEpoch;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (node.nodeType === Node.TEXT_NODE) nodes.push(node as Text);
    }

    if (translationBatchRunning) {
      rescanRequested = true;
      return;
    }

    const eligible = nodes.filter((textNode) => {
      if (isExcludedTextNode(textNode) || pending.has(textNode)) return false;
      const prior = appliedText.get(textNode);
      return !(prior && textNode.nodeValue === prior.translated && prior.language === currentLanguage);
    });

    // Limit concurrent external requests; this avoids flooding the translation service.
    const batch = eligible.slice(0, 4);
    if (batch.length) {
      translationBatchRunning = true;
      void Promise.all(batch.map((textNode) => translateNode(textNode, currentLanguage, epoch))).finally(() => {
        translationBatchRunning = false;
        if (eligible.length > batch.length || rescanRequested) {
          rescanRequested = false;
          scheduleScan();
        }
      });
    }

    translateAttributes(document.body, currentLanguage, epoch);
    document.documentElement.lang = currentLanguage;
  };

  const scheduleScan = () => {
    if (scanTimer !== null) window.clearTimeout(scanTimer);
    scanTimer = window.setTimeout(() => {
      scanTimer = null;
      scan();
    }, 100);
  };

  const changeLanguage = () => {
    currentLanguage = getInitialAppLanguage();
    translationEpoch += 1;
    rescanRequested = true;
    scheduleScan();
  };

  scan();
  observer = new MutationObserver(() => scheduleScan());
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
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

export function getLocalizedEQSLNotification(language: AppLanguage, kind: 'received' | 'reply', cardUrl = ''): string {
  const messages: Record<AppLanguage, { received: string; reply: string; view: string }> = {
    es:{received:'📻 ¡Has recibido una eQSL!',reply:'📻 ¡Han respondido a tu eQSL!',view:'Ver y descargar la tarjeta'},
    en:{received:'📻 You received an eQSL!',reply:'📻 Someone replied to your eQSL!',view:'View and download the card'},
    pt:{received:'📻 Você recebeu uma eQSL!',reply:'📻 Responderam à sua eQSL!',view:'Ver e baixar o cartão'},
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
