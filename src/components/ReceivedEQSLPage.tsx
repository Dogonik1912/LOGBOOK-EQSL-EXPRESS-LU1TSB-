import React, { useEffect, useRef, useState } from 'react';

declare global {
  interface Window {
    /** Exposed only by a native Android wrapper. Returns JSON after a verified MediaStore write. */
    AndroidEQSL?: { saveToGallery: (dataUrl: string, filename: string) => string };
  }
}

type SharedEQSL = {
  from: string; to: string; date: string; time: string; band: string;
  frequency: string; mode: string; rstSent: string; rstRcvd: string;
  name?: string; qth?: string; grid?: string; imageDataUrl?: string; isResponse?: boolean;
};

type Language = 'es' | 'en' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ru' | 'ja' | 'zh' | 'pl' | 'sv' | 'no' | 'da' | 'fi' | 'cs' | 'sk' | 'hu' | 'ro' | 'tr' | 'el' | 'uk' | 'hr' | 'sr' | 'ca';

const translations: Record<Language, Record<string, string>> = {
  es: { title: 'HAY UNA eQSL para ti', intro: 'Responde de manera rápida y gratuita en eQSL EXPRESS.', download: 'Descargar eQSL (PNG)', open: 'Pulsa aquí para descargar y responder esta QSL', note: 'La tarjeta conserva la imagen y el diseño elegidos por quien la envió. Podés descargarla y responder sin registrarte.', missing: 'No se encontró la tarjeta eQSL en este enlace.', invalid: 'El enlace de la eQSL está incompleto o dañado. Pedile al colega que vuelva a compartirla.', heading: 'TARJETA eQSL · CONFIRMACIÓN DE CONTACTO', confirms: 'confirma el QSO con', date: 'Fecha', band: 'Banda', frequency: 'Frecuencia', mode: 'Modo', rst: 'RST enviado/recibido', thanks: '¡Gracias por el contacto! · 73', grid: 'Grid' },
  en: { title: 'eQSL received', intro: 'View and download this card without installing the app or creating an account.', download: 'Download eQSL (PNG)', open: 'Open LogBook eQSL Express', note: 'This card preserves the image and design chosen by the sender. You can download it and reply without registering.', missing: 'No eQSL card was found in this link.', invalid: 'The eQSL link is incomplete or damaged. Ask the operator to share it again.', heading: 'eQSL CARD · QSO CONFIRMATION', confirms: 'confirms the QSO with', date: 'Date', band: 'Band', frequency: 'Frequency', mode: 'Mode', rst: 'RST sent/received', thanks: 'Thanks for the contact! · 73', grid: 'Grid' },
  fr: { title: 'eQSL reçue', intro: 'Consultez et téléchargez cette carte sans installer l’application ni créer de compte.', download: 'Télécharger eQSL (PNG)', open: 'Ouvrir LogBook eQSL Express', note: 'Cette carte est recréée à partir des données du lien partagé. Conservez le lien pour la consulter à nouveau.', missing: 'Aucune carte eQSL trouvée dans ce lien.', invalid: 'Le lien eQSL est incomplet ou endommagé. Demandez à l’opérateur de le partager à nouveau.', heading: 'CARTE eQSL · CONFIRMATION DU QSO', confirms: 'confirme le QSO avec', date: 'Date', band: 'Bande', frequency: 'Fréquence', mode: 'Mode', rst: 'RST envoyé/reçu', thanks: 'Merci pour le contact ! · 73', grid: 'Locator' },
  de: { title: 'eQSL empfangen', intro: 'Diese Karte ansehen und herunterladen, ohne die App zu installieren oder ein Konto anzulegen.', download: 'eQSL herunterladen (PNG)', open: 'LogBook eQSL Express öffnen', note: 'Diese Karte wird aus den Daten des geteilten Links erstellt. Bewahren Sie den Link auf, um sie erneut anzusehen.', missing: 'In diesem Link wurde keine eQSL-Karte gefunden.', invalid: 'Der eQSL-Link ist unvollständig oder beschädigt. Bitten Sie den Funkamateur, ihn erneut zu teilen.', heading: 'eQSL-KARTE · QSO-BESTÄTIGUNG', confirms: 'bestätigt das QSO mit', date: 'Datum', band: 'Band', frequency: 'Frequenz', mode: 'Betriebsart', rst: 'RST gesendet/empfangen', thanks: 'Danke für den Kontakt! · 73', grid: 'Grid' },
  it: { title: 'eQSL ricevuta', intro: 'Visualizza e scarica questa cartolina senza installare l’app o creare un account.', download: 'Scarica eQSL (PNG)', open: 'Apri LogBook eQSL Express', note: 'Questa cartolina viene ricreata dai dati contenuti nel link condiviso. Conserva il link per rivederla.', missing: 'Nessuna cartolina eQSL trovata in questo link.', invalid: 'Il link eQSL è incompleto o danneggiato. Chiedi all’operatore di condividerlo di nuovo.', heading: 'CARTOLINA eQSL · CONFERMA QSO', confirms: 'conferma il QSO con', date: 'Data', band: 'Banda', frequency: 'Frequenza', mode: 'Modo', rst: 'RST inviato/ricevuto', thanks: 'Grazie per il contatto! · 73', grid: 'Grid' },
  pt: { title: 'eQSL recebida', intro: 'Veja e baixe este cartão sem instalar o aplicativo nem criar uma conta.', download: 'Baixar eQSL (PNG)', open: 'Abrir LogBook eQSL Express', note: 'Este cartão é recriado a partir dos dados do link compartilhado. Guarde o link para visualizá-lo novamente.', missing: 'Nenhum cartão eQSL foi encontrado neste link.', invalid: 'O link eQSL está incompleto ou danificado. Peça ao operador para compartilhá-lo novamente.', heading: 'CARTÃO eQSL · CONFIRMAÇÃO DE QSO', confirms: 'confirma o QSO com', date: 'Data', band: 'Banda', frequency: 'Frequência', mode: 'Modo', rst: 'RST enviado/recebido', thanks: 'Obrigado pelo contato! · 73', grid: 'Grid' },
  nl: { title: 'eQSL ontvangen', intro: 'Bekijk en download deze kaart zonder de app te installeren of een account aan te maken.', download: 'eQSL downloaden (PNG)', open: 'LogBook eQSL Express openen', note: 'Deze kaart wordt gemaakt op basis van de gegevens in de gedeelde link. Bewaar de link om de kaart opnieuw te bekijken.', missing: 'Geen eQSL-kaart gevonden in deze link.', invalid: 'De eQSL-link is onvolledig of beschadigd. Vraag de operator om deze opnieuw te delen.', heading: 'eQSL-KAART · QSO-BEVESTIGING', confirms: 'bevestigt het QSO met', date: 'Datum', band: 'Band', frequency: 'Frequentie', mode: 'Modus', rst: 'RST verzonden/ontvangen', thanks: 'Bedankt voor het contact! · 73', grid: 'Grid' },
  ru: { title: 'Получена eQSL', intro: 'Просмотрите и скачайте карточку без установки приложения и создания аккаунта.', download: 'Скачать eQSL (PNG)', open: 'Открыть LogBook eQSL Express', note: 'Карточка создана на основе данных из общей ссылки. Сохраните ссылку, чтобы открыть её снова.', missing: 'В этой ссылке не найдена карточка eQSL.', invalid: 'Ссылка eQSL неполная или повреждена. Попросите оператора отправить её повторно.', heading: 'КАРТОЧКА eQSL · ПОДТВЕРЖДЕНИЕ QSO', confirms: 'подтверждает QSO с', date: 'Дата', band: 'Диапазон', frequency: 'Частота', mode: 'Режим', rst: 'RST передано/получено', thanks: 'Спасибо за связь! · 73', grid: 'Grid' },
  ja: { title: '受信した eQSL', intro: 'アプリのインストールやアカウント作成なしで、このカードを表示・ダウンロードできます。', download: 'eQSL をダウンロード (PNG)', open: 'LogBook eQSL Express を開く', note: 'このカードは共有リンクのデータから再作成されます。再表示する場合はリンクを保存してください。', missing: 'このリンクに eQSL カードが見つかりません。', invalid: 'eQSL リンクが不完全か破損しています。相手局に再共有を依頼してください。', heading: 'eQSL カード · QSO 確認', confirms: 'QSO を確認しました：', date: '日付', band: 'バンド', frequency: '周波数', mode: 'モード', rst: 'RST 送信/受信', thanks: '交信ありがとうございます！ · 73', grid: 'グリッド' },
  zh: { title: '收到的 eQSL', intro: '无需安装应用或创建账户，即可查看并下载此卡片。', download: '下载 eQSL (PNG)', open: '打开 LogBook eQSL Express', note: '此卡片根据共享链接中的数据生成。请保存链接以便再次查看。', missing: '此链接中未找到 eQSL 卡片。', invalid: 'eQSL 链接不完整或已损坏。请联系操作员重新分享。', heading: 'eQSL 卡片 · QSO 确认', confirms: '确认与以下电台的 QSO', date: '日期', band: '波段', frequency: '频率', mode: '模式', rst: 'RST 发出/收到', thanks: '感谢通联！· 73', grid: '网格' },
  pl: { title: 'Otrzymana eQSL', intro: 'Wyświetl i pobierz kartę bez instalowania aplikacji ani tworzenia konta.', download: 'Pobierz eQSL (PNG)', open: 'Otwórz LogBook eQSL Express', note: 'Karta jest odtwarzana z danych zawartych w udostępnionym linku. Zachowaj link, aby zobaczyć ją ponownie.', missing: 'Nie znaleziono karty eQSL w tym linku.', invalid: 'Link eQSL jest niekompletny lub uszkodzony. Poproś operatora o ponowne udostępnienie.', heading: 'KARTA eQSL · POTWIERDZENIE QSO', confirms: 'potwierdza QSO z', date: 'Data', band: 'Pasmo', frequency: 'Częstotliwość', mode: 'Tryb', rst: 'RST nadany/odebrany', thanks: 'Dziękuję za łączność! · 73', grid: 'Grid' },
  sv: { title: 'Mottagen eQSL', intro: 'Visa och ladda ner kortet utan att installera appen eller skapa ett konto.', download: 'Ladda ner eQSL (PNG)', open: 'Öppna LogBook eQSL Express', note: 'Kortet återskapas från uppgifterna i den delade länken. Spara länken om du vill se det igen.', missing: 'Inget eQSL-kort hittades i länken.', invalid: 'eQSL-länken är ofullständig eller skadad. Be operatören dela den igen.', heading: 'eQSL-KORT · QSO-BEKRÄFTELSE', confirms: 'bekräftar QSO med', date: 'Datum', band: 'Band', frequency: 'Frekvens', mode: 'Läge', rst: 'RST sänt/mottaget', thanks: 'Tack för kontakten! · 73', grid: 'Grid' },
  no: { title: 'Mottatt eQSL', intro: 'Vis og last ned kortet uten å installere appen eller opprette en konto.', download: 'Last ned eQSL (PNG)', open: 'Åpne LogBook eQSL Express', note: 'Kortet gjenskapes fra dataene i den delte lenken. Ta vare på lenken for å se det igjen.', missing: 'Fant ikke noe eQSL-kort i denne lenken.', invalid: 'eQSL-lenken er ufullstendig eller skadet. Be operatøren dele den på nytt.', heading: 'eQSL-KORT · QSO-BEKREFTELSE', confirms: 'bekrefter QSO med', date: 'Dato', band: 'Bånd', frequency: 'Frekvens', mode: 'Modus', rst: 'RST sendt/mottatt', thanks: 'Takk for kontakten! · 73', grid: 'Grid' },
  da: { title: 'Modtaget eQSL', intro: 'Se og download kortet uden at installere appen eller oprette en konto.', download: 'Download eQSL (PNG)', open: 'Åbn LogBook eQSL Express', note: 'Kortet genskabes ud fra dataene i det delte link. Gem linket for at se kortet igen.', missing: 'Der blev ikke fundet et eQSL-kort i linket.', invalid: 'eQSL-linket er ufuldstændigt eller beskadiget. Bed operatøren om at dele det igen.', heading: 'eQSL-KORT · QSO-BEKRÆFTELSE', confirms: 'bekræfter QSO med', date: 'Dato', band: 'Bånd', frequency: 'Frekvens', mode: 'Tilstand', rst: 'RST sendt/modtaget', thanks: 'Tak for kontakten! · 73', grid: 'Grid' },
  fi: { title: 'Vastaanotettu eQSL', intro: 'Katso ja lataa kortti asentamatta sovellusta tai luomatta tiliä.', download: 'Lataa eQSL (PNG)', open: 'Avaa LogBook eQSL Express', note: 'Kortti luodaan uudelleen jaetun linkin tietojen perusteella. Säilytä linkki, jos haluat katsoa sen uudelleen.', missing: 'Tästä linkistä ei löytynyt eQSL-korttia.', invalid: 'eQSL-linkki on puutteellinen tai vioittunut. Pyydä operaattoria jakamaan se uudelleen.', heading: 'eQSL-KORTTI · QSO-VAHVISTUS', confirms: 'vahvistaa QSO-yhteyden aseman kanssa', date: 'Päivä', band: 'Taajuusalue', frequency: 'Taajuus', mode: 'Tila', rst: 'RST lähetetty/vastaanotettu', thanks: 'Kiitos yhteydestä! · 73', grid: 'Grid' },
  cs: { title: 'Přijatá eQSL', intro: 'Zobrazte a stáhněte si kartu bez instalace aplikace nebo vytvoření účtu.', download: 'Stáhnout eQSL (PNG)', open: 'Otevřít LogBook eQSL Express', note: 'Karta se obnoví z údajů ve sdíleném odkazu. Odkaz si uložte pro pozdější zobrazení.', missing: 'V tomto odkazu nebyla nalezena karta eQSL.', invalid: 'Odkaz eQSL je neúplný nebo poškozený. Požádejte operátora o nové sdílení.', heading: 'KARTA eQSL · POTVRZENÍ QSO', confirms: 'potvrzuje QSO s', date: 'Datum', band: 'Pásmo', frequency: 'Frekvence', mode: 'Režim', rst: 'RST vysláno/přijato', thanks: 'Děkuji za spojení! · 73', grid: 'Grid' },
  sk: { title: 'Prijatá eQSL', intro: 'Zobrazte a stiahnite si kartu bez inštalácie aplikácie alebo vytvorenia účtu.', download: 'Stiahnuť eQSL (PNG)', open: 'Otvoriť LogBook eQSL Express', note: 'Karta sa obnoví z údajov v zdieľanom odkaze. Odkaz si uložte na neskôr.', missing: 'V tomto odkaze sa nenašla karta eQSL.', invalid: 'Odkaz eQSL je neúplný alebo poškodený. Požiadajte operátora o opätovné zdieľanie.', heading: 'KARTA eQSL · POTVRDENIE QSO', confirms: 'potvrdzuje QSO s', date: 'Dátum', band: 'Pásmo', frequency: 'Frekvencia', mode: 'Režim', rst: 'RST odoslané/prijaté', thanks: 'Ďakujem za spojenie! · 73', grid: 'Grid' },
  hu: { title: 'Kapott eQSL', intro: 'A kártya megtekintéséhez és letöltéséhez nem kell alkalmazást telepíteni vagy fiókot létrehozni.', download: 'eQSL letöltése (PNG)', open: 'LogBook eQSL Express megnyitása', note: 'A kártya a megosztott hivatkozás adataiból készül. Őrizze meg a linket az újbóli megtekintéshez.', missing: 'A hivatkozásban nem található eQSL-kártya.', invalid: 'Az eQSL-hivatkozás hiányos vagy sérült. Kérje meg az operátort az újbóli megosztásra.', heading: 'eQSL-KÁRTYA · QSO-MEGERŐSÍTÉS', confirms: 'megerősíti a QSO-t vele:', date: 'Dátum', band: 'Sáv', frequency: 'Frekvencia', mode: 'Üzemmód', rst: 'RST adva/véve', thanks: 'Köszönöm a kapcsolatot! · 73', grid: 'Grid' },
  ro: { title: 'eQSL primită', intro: 'Vizualizați și descărcați această cartelă fără a instala aplicația sau a crea un cont.', download: 'Descarcă eQSL (PNG)', open: 'Deschide LogBook eQSL Express', note: 'Cartela este recreată din datele incluse în linkul distribuit. Păstrați linkul pentru a o vedea din nou.', missing: 'Nu a fost găsită nicio cartelă eQSL în acest link.', invalid: 'Linkul eQSL este incomplet sau deteriorat. Cereți operatorului să îl distribuie din nou.', heading: 'CARTELĂ eQSL · CONFIRMARE QSO', confirms: 'confirmă QSO cu', date: 'Data', band: 'Bandă', frequency: 'Frecvență', mode: 'Mod', rst: 'RST transmis/recepționat', thanks: 'Mulțumesc pentru contact! · 73', grid: 'Grid' },
  tr: { title: 'Alınan eQSL', intro: 'Uygulamayı yüklemeden veya hesap oluşturmadan bu kartı görüntüleyip indirebilirsiniz.', download: 'eQSL indir (PNG)', open: 'LogBook eQSL Express’i aç', note: 'Bu kart, paylaşılan bağlantıdaki verilerden yeniden oluşturulur. Tekrar görüntülemek için bağlantıyı saklayın.', missing: 'Bu bağlantıda eQSL kartı bulunamadı.', invalid: 'eQSL bağlantısı eksik veya bozuk. Operatörden yeniden paylaşmasını isteyin.', heading: 'eQSL KARTI · QSO ONAYI', confirms: 'şu istasyonla QSO’yu onaylıyor', date: 'Tarih', band: 'Bant', frequency: 'Frekans', mode: 'Mod', rst: 'RST gönderilen/alınan', thanks: 'QSO için teşekkürler! · 73', grid: 'Grid' },
  el: { title: 'Λήφθηκε eQSL', intro: 'Δείτε και κατεβάστε την κάρτα χωρίς εγκατάσταση εφαρμογής ή δημιουργία λογαριασμού.', download: 'Λήψη eQSL (PNG)', open: 'Άνοιγμα LogBook eQSL Express', note: 'Η κάρτα αναδημιουργείται από τα δεδομένα του κοινόχρηστου συνδέσμου. Κρατήστε τον σύνδεσμο για να τη δείτε ξανά.', missing: 'Δεν βρέθηκε κάρτα eQSL σε αυτόν τον σύνδεσμο.', invalid: 'Ο σύνδεσμος eQSL είναι ελλιπής ή κατεστραμμένος. Ζητήστε από τον χειριστή να τον κοινοποιήσει ξανά.', heading: 'ΚΑΡΤΑ eQSL · ΕΠΙΒΕΒΑΙΩΣΗ QSO', confirms: 'επιβεβαιώνει το QSO με', date: 'Ημερομηνία', band: 'Μπάντα', frequency: 'Συχνότητα', mode: 'Τρόπος', rst: 'RST εκπομπής/λήψης', thanks: 'Ευχαριστώ για την επαφή! · 73', grid: 'Grid' },
  uk: { title: 'Отримана eQSL', intro: 'Переглядайте та завантажуйте картку без встановлення програми чи створення облікового запису.', download: 'Завантажити eQSL (PNG)', open: 'Відкрити LogBook eQSL Express', note: 'Картку відтворено з даних у спільному посиланні. Збережіть посилання, щоб переглянути її знову.', missing: 'У цьому посиланні не знайдено картку eQSL.', invalid: 'Посилання eQSL неповне або пошкоджене. Попросіть оператора поділитися ним повторно.', heading: 'КАРТКА eQSL · ПІДТВЕРДЖЕННЯ QSO', confirms: 'підтверджує QSO з', date: 'Дата', band: 'Діапазон', frequency: 'Частота', mode: 'Режим', rst: 'RST передано/отримано', thanks: 'Дякую за зв’язок! · 73', grid: 'Grid' },
  hr: { title: 'Primljena eQSL', intro: 'Pregledajte i preuzmite karticu bez instaliranja aplikacije ili izrade računa.', download: 'Preuzmi eQSL (PNG)', open: 'Otvori LogBook eQSL Express', note: 'Kartica se ponovno izrađuje iz podataka u podijeljenoj poveznici. Sačuvajte poveznicu za ponovni pregled.', missing: 'U ovoj poveznici nije pronađena eQSL kartica.', invalid: 'eQSL poveznica je nepotpuna ili oštećena. Zamolite operatora da je ponovno podijeli.', heading: 'eQSL KARTICA · POTVRDA QSO-a', confirms: 'potvrđuje QSO s', date: 'Datum', band: 'Opseg', frequency: 'Frekvencija', mode: 'Način', rst: 'RST poslano/primljeno', thanks: 'Hvala na vezi! · 73', grid: 'Grid' },
  sr: { title: 'Примљена eQSL', intro: 'Погледајте и преузмите картицу без инсталирања апликације или прављења налога.', download: 'Преузми eQSL (PNG)', open: 'Отвори LogBook eQSL Express', note: 'Картица је поново направљена из података у дељеној вези. Сачувајте везу да бисте је поново видели.', missing: 'У овој вези није пронађена eQSL картица.', invalid: 'eQSL веза је непотпуна или оштећена. Замолите оператера да је поново подели.', heading: 'eQSL КАРТИЦА · ПОТВРДА QSO-а', confirms: 'потврђује QSO са', date: 'Датум', band: 'Опсег', frequency: 'Фреквенција', mode: 'Режим', rst: 'RST послат/примљен', thanks: 'Хвала на вези! · 73', grid: 'Grid' },
  ca: { title: 'eQSL rebuda', intro: 'Pots veure i descarregar aquesta targeta sense instal·lar l’aplicació ni crear un compte.', download: 'Descarrega eQSL (PNG)', open: 'Obre LogBook eQSL Express', note: 'Aquesta targeta es reconstrueix amb les dades de l’enllaç compartit. Desa l’enllaç per tornar-la a veure.', missing: 'No s’ha trobat cap targeta eQSL en aquest enllaç.', invalid: 'L’enllaç eQSL és incomplet o està malmès. Demana a l’operador que el torni a compartir.', heading: 'TARGETA eQSL · CONFIRMACIÓ DE QSO', confirms: 'confirma el QSO amb', date: 'Data', band: 'Banda', frequency: 'Freqüència', mode: 'Mode', rst: 'RST enviat/rebut', thanks: 'Gràcies pel contacte! · 73', grid: 'Grid' },
};

const languageForRecipient = (): Language => {
  // La preferencia que eligió el destinatario en su instalación tiene prioridad.
  const savedLanguage = String(localStorage.getItem('app_language') || '').toLowerCase().replace('_', '-');
  const preferredLanguage = savedLanguage === 'pt-br' ? 'pt' : savedLanguage.split('-')[0];
  if (preferredLanguage in translations) return preferredLanguage as Language;
  const params = new URLSearchParams(window.location.search);
  let targetCall = '';
  try {
    const raw = params.get('view_eqsl');
    if (raw) targetCall = String((JSON.parse(raw) as SharedEQSL).to || '');
  } catch { /* use browser language as fallback */ }
  if (!targetCall) targetCall = params.get('to_call') || '';
  const call = targetCall.toUpperCase().trim().split('/')[0];
  if (/^(PP|PQ|PR|PS|PT|PU|PV|PW|PX|PY|ZV|ZW|ZX|ZY|ZZ)\d/.test(call)) return 'pt';
  if (/^PZ\d/.test(call)) return 'nl';
  if (/^(LU|LW|AY|AZ|CE|CA|CB|CC|CD|3G|CX|CV|CW|CP|OA|OB|OC|4T|HC|HD|HJ|HK|5J|5K|YV|YW|YY|ZP|HI|TG|YS|HR|HQ|YN|HT|HO|HP|3E|3F|XE|XF|XG|XH|XI|TI)\d/.test(call)) return 'es';
  if (/^(CT|CR|CS|CU)\d/.test(call)) return 'pt';
  if (/^F\d/.test(call)) return 'fr';
  if (/^(DA|DB|DC|DD|DE|DF|DG|DH|DI|DJ|DK|DL|DM|DN|DO|DP|DQ|DR)\d/.test(call)) return 'de';
  if (/^I[A-Z]?\d/.test(call)) return 'it';
  if (/^(JA|JH|JR|JE|JF|JG|JI|JJ|JK|JL|JM|JN|JO|JP|JQ|JS|7J|7K|7L|7M|7N|8J|8K|8L|8M|8N)\d/.test(call)) return 'ja';
  if (/^(BA|BD|BG|BH|BI|BJ|BK|BL|BM|BN|BO|BP|BQ|BR|BS|BT|BU|BV|BW|BX|BY|BZ|VR)\d/.test(call)) return 'zh';
  if (/^(SP|SQ|SR|SO|SN|3Z)\d/.test(call)) return 'pl';
  if (/^(SM|SA|SB|SC|SD|SE|SF|SG|SH|SI|SJ|SK|SL|7S|8S)\d/.test(call)) return 'sv';
  if (/^(LA|LB|LC|LD|LE|LF|LG|LH|LI|LJ|LK|LL|LM|LN)\d/.test(call)) return 'no';
  if (/^(OZ|OU|OV|OW|OX|OY)\d/.test(call)) return 'da';
  if (/^(OH|OF|OG|OI|OJ)\d/.test(call)) return 'fi';
  if (/^(OK|OL)\d/.test(call)) return 'cs';
  if (/^OM\d/.test(call)) return 'sk';
  if (/^(HA|HG)\d/.test(call)) return 'hu';
  if (/^(YO|YP|YQ|YR)\d/.test(call)) return 'ro';
  if (/^(TA|TB|TC|YM)\d/.test(call)) return 'tr';
  if (/^(SV|SW|SX|SY|SZ)\d/.test(call)) return 'el';
  if (/^(UR|US|UT|UU|UV|UW|UX|UY|UZ)\d/.test(call)) return 'uk';
  if (/^9A\d/.test(call)) return 'hr';
  if (/^(YT|YU)\d/.test(call)) return 'sr';
  for (const candidate of [...(navigator.languages || []), navigator.language || 'es']) {
    const code = candidate.toLowerCase().split('-')[0] as Language;
    if (code in translations) return code;
  }
  return 'en';
};

export const ReceivedEQSLPage: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [card, setCard] = useState<SharedEQSL | null>(null);
  const [shareId, setShareId] = useState<string | null>(null);
  const [alreadyViewed, setAlreadyViewed] = useState(false);
  const [downloadAttempted, setDownloadAttempted] = useState(false);
  const [galleryStatus, setGalleryStatus] = useState<'saved' | 'failed' | ''>('');
  const [errorKey, setErrorKey] = useState<'missing' | 'invalid' | ''>('');
  const language = languageForRecipient();
  const t = translations[language];

  useEffect(() => {
    let active = true;
    const load = async () => {
      const params = new URLSearchParams(window.location.search);
      const id = params.get('e');
      try {
        let data: SharedEQSL;
        if (id) {
          setShareId(id);
          const response = await fetch('/api/eqsl-share?id=' + encodeURIComponent(id), { cache: 'no-store' });
          const result = await response.json();
          if (!response.ok || !result.card) throw new Error('invalid');
          data = result.card as SharedEQSL;
          setAlreadyViewed(Boolean(result.alreadyViewed));
        } else {
          const raw = params.get('view_eqsl');
          if (!raw) { if (active) setErrorKey('missing'); return; }
          data = JSON.parse(raw) as SharedEQSL;
        }
        if (!data.from || !data.to || !data.date || !data.time) throw new Error('invalid');
        if (!active) return;
        setCard(data);
      } catch {
        if (active) setErrorKey('invalid');
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    // New links carry the exact rendered card. Only recreate legacy links without an image.
    if (!card || card.imageDataUrl || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width = 1200; canvas.height = 750;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const bg = ctx.createLinearGradient(0, 0, 1200, 750);
    bg.addColorStop(0, '#0f172a'); bg.addColorStop(.55, '#1e293b'); bg.addColorStop(1, '#090d16');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, 1200, 750);
    ctx.strokeStyle = '#f59e0b'; ctx.lineWidth = 5; ctx.strokeRect(35, 35, 1130, 680);
    ctx.textAlign = 'center'; ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 28px sans-serif';
    ctx.fillText(t.heading, 600, 95, 1080);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 82px sans-serif'; ctx.fillText(card.from, 600, 205);
    ctx.fillStyle = '#cbd5e1'; ctx.font = '28px sans-serif'; ctx.fillText(t.confirms, 600, 260);
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 58px sans-serif'; ctx.fillText(card.to, 600, 330);
    ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif';
    ctx.fillText(`${t.date}: ${card.date}   ·   ${card.time} UTC`, 600, 410, 1080);
    ctx.fillText(`${t.band}: ${card.band}   ·   ${t.frequency}: ${card.frequency} MHz   ·   ${t.mode}: ${card.mode}`, 600, 465, 1080);
    ctx.fillText(`${t.rst}: ${card.rstSent || '59'} / ${card.rstRcvd || '59'}`, 600, 520, 1080);
    if (card.qth || card.grid) {
      ctx.fillStyle = '#cbd5e1'; ctx.font = '23px sans-serif';
      ctx.fillText([card.qth, card.grid ? `${t.grid} ${card.grid}` : ''].filter(Boolean).join(' · '), 600, 570, 1080);
    }
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(t.thanks, 600, 650, 1080);
  }, [card, t]);

  // After the web download starts, leave a brief window for the optional Android fallback,
  // then return home automatically unless the native save reported a failure.
  useEffect(() => {
    if (!downloadAttempted || !card?.isResponse || galleryStatus !== '') return;
    const timer = window.setTimeout(() => {
      window.location.replace(window.location.origin + '/');
    }, 8000);
    return () => window.clearTimeout(timer);
  }, [downloadAttempted, card?.isResponse, galleryStatus]);

  const getReplyAppUrl = () => {
    if (shareId) return window.location.origin + '/?reply_eqsl=' + encodeURIComponent(shareId);
    if (!card) return window.location.origin + '/';
    const params = new URLSearchParams({ reply_to: card.from, to_call: card.to, date: card.date, time: card.time, band: card.band, freq: card.frequency, mode: card.mode, rst: card.rstSent || '59' });
    return window.location.origin + '/?' + params.toString();
  };

  const getImageDataUrl = () => {
    if (!card) return null;
    if (card.imageDataUrl) return card.imageDataUrl;
    if (!canvasRef.current) return null;
    try { return canvasRef.current.toDataURL('image/png'); } catch { return null; }
  };

  const getDownloadFilename = () => {
    if (!card) return 'eQSL.png';
    const isJpeg = Boolean(card.imageDataUrl?.startsWith('data:image/jpeg'));
    return 'eQSL_' + card.from.replace(/[^A-Z0-9]/gi, '') + '_' + card.to.replace(/[^A-Z0-9]/gi, '') + '_' + card.date + (isJpeg ? '.jpg' : '.png');
  };

  // Web-first and independent: use the browser's normal download mechanism.
  const download = () => {
    const dataUrl = getImageDataUrl();
    if (!dataUrl || !card) return;
    const link = document.createElement('a');
    link.download = getDownloadFilename();
    link.href = dataUrl;
    link.click();
    setDownloadAttempted(true);
    setGalleryStatus('');
  };

  // Offered only inside a native Android wrapper; success requires a verified MediaStore URI.
  const saveToAndroidGallery = () => {
    const dataUrl = getImageDataUrl();
    const bridge = window.AndroidEQSL;
    if (!dataUrl || !bridge?.saveToGallery) { setGalleryStatus('failed'); return; }
    try {
      const raw = bridge.saveToGallery(dataUrl, getDownloadFilename());
      const result = JSON.parse(raw) as { ok?: boolean; uri?: string; error?: string };
      if (result.ok === true && result.uri) {
        setGalleryStatus('saved');
        window.setTimeout(() => { window.location.replace(window.location.origin + '/'); }, 900);
      } else {
        setGalleryStatus('failed');
      }
    } catch { setGalleryStatus('failed'); }
  };

  const returnHome = () => window.location.replace(window.location.origin + '/');
  const hasAndroidGalleryBridge = typeof window !== 'undefined' && typeof window.AndroidEQSL?.saveToGallery === 'function';

  return <main lang={language} className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-3 sm:p-5">
    <section className="w-full max-w-5xl rounded-2xl border border-slate-700 bg-slate-900 p-3 sm:p-6 shadow-2xl">
      <h1 className="text-xl sm:text-3xl font-extrabold text-amber-300 mb-2 text-center">{card?.isResponse ? 'Respuesta eQSL' : t.title}</h1>
      {!card?.isResponse && <p className="text-base sm:text-lg font-semibold text-slate-100 mb-4 text-center">{t.intro}</p>}
      {card && alreadyViewed && <p role="status" className="mb-4 rounded-lg border border-amber-400/50 bg-amber-950/60 p-3 text-center font-semibold text-amber-200">{card.isResponse ? 'Esta respuesta ya fue vista o enviada.' : 'Esta eQSL ya fue vista o descargada.'}</p>}
      {errorKey ? <p role="alert" className="rounded-lg bg-red-950 p-4 text-red-200">{t[errorKey]}</p> : card && <>
        <div className="rounded-xl overflow-hidden border-2 border-amber-400/70 bg-slate-950 p-1 shadow-lg">{card.imageDataUrl ? <img src={card.imageDataUrl} alt={card.isResponse ? 'Tarjeta eQSL de respuesta' : t.title} className="block w-full h-auto" /> : <canvas ref={canvasRef} aria-label={t.title} className="block w-full h-auto" />}</div>
        <div className="mt-4 flex flex-col gap-3">
          {!card.isResponse && <a href={getReplyAppUrl()} className="block rounded-xl bg-amber-400 px-5 py-4 text-center text-base sm:text-lg font-extrabold text-slate-950 shadow-lg hover:bg-amber-300">{t.open}</a>}
          <button onClick={download} className="rounded-xl bg-amber-400 px-5 py-4 text-center text-base sm:text-lg font-extrabold text-slate-950 shadow-lg hover:bg-amber-300">{card.isResponse ? 'Descargar' : t.download}</button>
          {card.isResponse && downloadAttempted && <div className="space-y-3 rounded-xl border border-slate-700 p-3 text-center">
            <p role="status" className="text-sm text-slate-200">La descarga web se inició. Si la imagen no quedó guardada en tu Galería, podés intentar la alternativa disponible.</p>
            {hasAndroidGalleryBridge && <button onClick={saveToAndroidGallery} className="w-full rounded-xl border border-amber-300 px-4 py-3 font-bold text-amber-200 hover:bg-slate-800">Guardar en la Galería del dispositivo</button>}
            {galleryStatus === 'saved' && <p role="status" className="text-sm font-semibold text-green-300">Imagen guardada y verificada en la Galería. Volviendo al inicio…</p>}
            {galleryStatus === 'failed' && <p role="alert" className="text-sm text-red-300">No se pudo confirmar el guardado en la Galería. La descarga web sigue disponible; podés intentarlo de nuevo.</p>}
            <button onClick={returnHome} className="w-full rounded-xl bg-slate-700 px-4 py-3 font-bold text-white hover:bg-slate-600">Volver al inicio</button>
          </div>}
        </div>
      </>}
      {!card?.isResponse && <p className="mt-4 text-center text-xs text-slate-400">{t.note}</p>}
    </section>
  </main>;
};
