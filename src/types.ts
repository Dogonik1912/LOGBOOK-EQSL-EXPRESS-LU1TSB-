/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface QSO {
  id: string;
  callsign: string;      // Corresponsal
  date: string;          // YYYY-MM-DD (UTC)
  time: string;          // HH:MM (UTC)
  band: string;          // e.g. "40m", "20m", etc.
  frequency: string;     // e.g. "7.125" MHz
  mode: string;          // e.g. "SSB", "CW", "FT8"
  rstSent: string;       // e.g. "59", "599", "-05"
  rstRcvd: string;       // e.g. "59", "599", "+02"
  email: string;         // Email del corresponsal (Editable)
  whatsapp?: string;     // WhatsApp / Teléfono (dígitos limpios para wa.me)
  whatsappRaw?: string;  // Formato original (ej. 0054 9 388...)
  whatsappUsername?: string; // Alias de WhatsApp cuando esté disponible
  telegram?: string;     // Usuario Telegram sin @
  name?: string;         // Nombre del operador corresponsal
  country?: string;      // País / Entidad DXCC
  grid?: string;         // Grid Locator (ej. GF05te)
  notes?: string;        // Comentarios adicionales
  qslSent?: boolean;     // eQSL enviada
  qslRcvd?: boolean;     // eQSL recibida
  exchangeSent?: string;   // Progresivo/intercambio enviado en concursos
  exchangeReceived?: string; // Progresivo/intercambio recibido en concursos
  mapActivityAt?: number; // Marca temporal local para mostrar actividad en el mapamundi durante 30 minutos
}

export interface UserSettings {
  callsign: string;
  operatorName: string;
  email: string;
  qth: string;
  grid: string;
  qrzUser: string;
  qrzPass: string;
  eqslUser?: string;
  eqslPass?: string;
}

// Hosts precargados fijos en el código (REGLA PRIORIDAD 6)
export const QRZ_API_URL = 'https://xmldata.qrz.com/xml/current/';
export const QRZ_LOGIN_URL = 'https://www.qrz.com/login';
export const EQSL_URL = 'https://www.eqsl.cc/qslcard/';

// Fallback por defecto según requerimiento
export const DEFAULT_CALLSIGN = 'LU1TSB';

export const HAM_BANDS = [
  { name: '160m', defaultFreq: '1.840', type: 'HF' },
  { name: '80m',  defaultFreq: '3.650', type: 'HF' },
  { name: '40m',  defaultFreq: '7.120', type: 'HF' },
  { name: '30m',  defaultFreq: '10.136', type: 'HF' },
  { name: '20m',  defaultFreq: '14.200', type: 'HF' },
  { name: '17m',  defaultFreq: '18.100', type: 'HF' },
  { name: '15m',  defaultFreq: '21.250', type: 'HF' },
  { name: '12m',  defaultFreq: '24.930', type: 'HF' },
  { name: '10m',  defaultFreq: '28.400', type: 'HF' },
  { name: '11 metros', defaultFreq: '27.125', type: 'CB' },
  { name: '6m',   defaultFreq: '50.150', type: 'VHF' },
  { name: '2m',   defaultFreq: '144.300', type: 'VHF' },
  { name: '70cm', defaultFreq: '432.200', type: 'UHF' },
];

export const HAM_MODES = [
  'SSB',
  'CW',
  'FT8',
  'FT4',
  'AM',
  'FM',
  'RTTY',
  'PSK31',
  'SSTV',
  'JS8',
  'D-STAR',
  'DMR',
];
