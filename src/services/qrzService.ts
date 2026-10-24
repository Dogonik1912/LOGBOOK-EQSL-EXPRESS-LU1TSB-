/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface CallsignDetails {
  callsign: string;
  email?: string;
  whatsapp?: string;     // Dígitos limpios para wa.me (ej. 5493886067078)
  whatsappRaw?: string;  // Formato original (ej. 0054 9 388...)
  country?: string;
  grid?: string;
  city?: string;
  state?: string;
  bio?: string;
  lookupMessage?: string;
  source: 'qrz' | 'qrz-bio' | 'qrz-xml' | 'qrz-web-session' | 'qrz-authenticated-profile-html' | 'prefix-db' | 'cache';
}

/**
 * Obtiene la firma dinámica del operador según la regla PRIORIDAD 1:
 * const callsign = localStorage.getItem('user_callsign') || 'LU1TSB';
 * const firma = `73 cordiales de ${callsign}`;
 * IMPORTANTE: si el usuario no configuró su callsign, el fallback debe ser "LU1TSB".
 */
export function getFirma(): string {
  const callsign = localStorage.getItem('user_callsign') || 'LU1TSB';
  return `73 cordiales de ${callsign}`;
}

export function getUserCallsign(): string {
  return localStorage.getItem('user_callsign') || 'LU1TSB';
}

// Prefijos DXCC más comunes para reconocimiento instantáneo
const DXCC_PREFIXES: Record<string, { country: string; defaultGrid?: string }> = {
  LU: { country: 'Argentina', defaultGrid: 'GF05te' },
  LW: { country: 'Argentina', defaultGrid: 'GF05' },
  AY: { country: 'Argentina', defaultGrid: 'GF05' },
  AZ: { country: 'Argentina', defaultGrid: 'GF05' },
  EA: { country: 'España', defaultGrid: 'IN80' },
  EB: { country: 'España', defaultGrid: 'IN80' },
  EC: { country: 'España', defaultGrid: 'IN80' },
  ED: { country: 'España', defaultGrid: 'IN80' },
  PY: { country: 'Brasil', defaultGrid: 'GG87' },
  PP: { country: 'Brasil', defaultGrid: 'GG87' },
  PR: { country: 'Brasil', defaultGrid: 'GG87' },
  PU: { country: 'Brasil', defaultGrid: 'GG87' },
  PT: { country: 'Brasil', defaultGrid: 'GG87' },
  CX: { country: 'Uruguay', defaultGrid: 'GF15' },
  CE: { country: 'Chile', defaultGrid: 'FF46' },
  CA: { country: 'Chile', defaultGrid: 'FF46' },
  CB: { country: 'Chile', defaultGrid: 'FF46' },
  OA: { country: 'Perú', defaultGrid: 'FH17' },
  CP: { country: 'Bolivia', defaultGrid: 'FH53' },
  ZP: { country: 'Paraguay', defaultGrid: 'GG14' },
  HK: { country: 'Colombia', defaultGrid: 'FJ24' },
  YV: { country: 'Venezuela', defaultGrid: 'FJ69' },
  HC: { country: 'Ecuador', defaultGrid: 'FI09' },
  TG: { country: 'Guatemala', defaultGrid: 'EK44' },
  TI: { country: 'Costa Rica', defaultGrid: 'EJ79' },
  HP: { country: 'Panamá', defaultGrid: 'FJ08' },
  HR: { country: 'Honduras', defaultGrid: 'EK64' },
  YS: { country: 'El Salvador', defaultGrid: 'EK53' },
  YN: { country: 'Nicaragua', defaultGrid: 'EK62' },
  XE: { country: 'México', defaultGrid: 'DL88' },
  W:  { country: 'Estados Unidos', defaultGrid: 'EM' },
  K:  { country: 'Estados Unidos', defaultGrid: 'EM' },
  N:  { country: 'Estados Unidos', defaultGrid: 'FN' },
  AA: { country: 'Estados Unidos', defaultGrid: 'DM' },
  AB: { country: 'Estados Unidos', defaultGrid: 'DM' },
  AC: { country: 'Estados Unidos', defaultGrid: 'DM' },
  AD: { country: 'Estados Unidos', defaultGrid: 'DM' },
  VE: { country: 'Canadá', defaultGrid: 'FN' },
  VA: { country: 'Canadá', defaultGrid: 'DO' },
  G:  { country: 'Reino Unido', defaultGrid: 'IO91' },
  M:  { country: 'Reino Unido', defaultGrid: 'IO91' },
  F:  { country: 'Francia', defaultGrid: 'JN18' },
  DL: { country: 'Alemania', defaultGrid: 'JO31' },
  I:  { country: 'Italia', defaultGrid: 'JN61' },
  JA: { country: 'Japón', defaultGrid: 'PM95' },
  VK: { country: 'Australia', defaultGrid: 'QF22' },
  ZL: { country: 'Nueva Zelanda', defaultGrid: 'RE78' },
};

function getCountryFromPrefix(callsign: string): { country: string; defaultGrid?: string } {
  const clean = callsign.trim().toUpperCase();
  // Primero 2 letras
  const p2 = clean.slice(0, 2);
  if (DXCC_PREFIXES[p2]) return DXCC_PREFIXES[p2];
  // 1 letra (W, K, N, G, F, I)
  const p1 = clean.slice(0, 1);
  if (DXCC_PREFIXES[p1]) return DXCC_PREFIXES[p1];
  return { country: 'Desconocido' };
}

/**
 * Consulta local por indicativo. No llama a QRZ ni a servicios externos.
 * Los correos deben ser aportados por el usuario o recuperados de datos
 * guardados localmente; nunca se inventan ni se extraen de perfiles ajenos.
 */
export async function lookupQRZCallsign(call: string): Promise<CallsignDetails> {
  const cleanCall = call.trim().toUpperCase();
  const prefixInfo = getCountryFromPrefix(cleanCall);
  return {
    callsign: cleanCall,
    country: prefixInfo.country,
    grid: '',
    source: 'prefix-db',
    lookupMessage: 'No se consulta QRZ automáticamente. Si el correo figura públicamente, copialo manualmente y verificá que corresponda al indicativo.',
  };
}
