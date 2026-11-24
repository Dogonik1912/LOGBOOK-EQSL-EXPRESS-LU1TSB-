import React from 'react';
import { APP_LANGUAGES, type AppLanguage, type ShareLanguageChoice } from '../services/appLanguage';

const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  es: 'Español', en: 'English', pt: 'Português', 'pt-br': 'Português (Brasil)',
  fr: 'Français', de: 'Deutsch', it: 'Italiano', nl: 'Nederlands', pl: 'Polski',
  ru: 'Русский', uk: 'Українська', zh: '中文', ja: '日本語', ko: '한국어',
  ar: 'العربية', hi: 'हिन्दी', tr: 'Türkçe', sv: 'Svenska', no: 'Norsk',
  da: 'Dansk', fi: 'Suomi', cs: 'Čeština', el: 'Ελληνικά', ro: 'Română',
  hu: 'Magyar', id: 'Bahasa Indonesia', th: 'ไทย',
};

type Props = {
  value: ShareLanguageChoice;
  onChange: (value: ShareLanguageChoice) => void;
  recipientCallsign?: string;
  label?: string;
  dark?: boolean;
  autoLabel?: string;
};

export const ShareLanguageSelector: React.FC<Props> = ({
  value, onChange, recipientCallsign, label = 'Idioma del mensaje', dark = true, autoLabel,
}) => {
  const styles = dark ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-300 bg-white text-slate-900';
  const automaticLabel = autoLabel || (recipientCallsign
    ? '🌐 Automático (idioma identificado por SD/indicativo)'
    : '🌐 Automático (idioma habitual de la aplicación)');
  return (
    <label className="my-2 block text-xs font-semibold">
      <span className="mb-1 block">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value as ShareLanguageChoice)}
        className={'w-full rounded-lg border px-3 py-2.5 text-sm ' + styles}>
        <option value="auto">{automaticLabel}</option>
        {APP_LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_NAMES[language]}</option>)}
      </select>
      <span className="mt-1 block text-[10px] font-normal opacity-70">
        Solo para este envío. Al volver a compartir, se seleccionará Automático.
        {recipientCallsign ? ' Destinatario: ' + recipientCallsign.toUpperCase() + '.' : ''}
      </span>
    </label>
  );
};
