/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { QRZ_API_URL } from '../types';

export interface CallsignDetails {
  callsign: string;
  name?: string;
  email?: string;
  country?: string;
  grid?: string;
  city?: string;
  state?: string;
  bio?: string;
  source: 'qrz' | 'prefix-db' | 'cache';
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

let cachedSessionKey: string | null = null;
let sessionTimestamp = 0;

/**
 * Autentica o reutiliza una clave de sesión XML de QRZ.com
 */
async function getQRZSessionKey(user: string, pass: string): Promise<string | null> {
  // Reutilizar token si tiene menos de 45 minutos
  if (cachedSessionKey && Date.now() - sessionTimestamp < 45 * 60 * 1000) {
    return cachedSessionKey;
  }

  try {
    const query = new URLSearchParams({
      username: user,
      password: pass,
      agent: 'LU1TSB-LogBook-eQSL-1.0',
    }).toString();

    // Intentamos a través del proxy de Vite (/api/qrz)
    const res = await fetch(`/api/qrz?${query}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xmlText = await res.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
    const keyNode = xmlDoc.querySelector('Key');
    const errNode = xmlDoc.querySelector('Error');

    if (errNode && !keyNode) {
      console.warn('QRZ Auth Error:', errNode.textContent);
      return null;
    }

    if (keyNode && keyNode.textContent) {
      cachedSessionKey = keyNode.textContent.trim();
      sessionTimestamp = Date.now();
      return cachedSessionKey;
    }
  } catch (err) {
    console.warn('Error connecting to QRZ XML API:', err);
  }
  return null;
}

/**
 * Consulta un indicativo en QRZ.com para autocompletar Email, Nombre, Grid, etc.
 */
export async function lookupQRZCallsign(call: string): Promise<CallsignDetails> {
  const cleanCall = call.trim().toUpperCase();
  const prefixInfo = getCountryFromPrefix(cleanCall);

  const fallbackResult: CallsignDetails = {
    callsign: cleanCall,
    country: prefixInfo.country,
    grid: prefixInfo.defaultGrid || '',
    source: 'prefix-db',
  };

  const qrzUser = localStorage.getItem('qrz_user');
  const qrzPass = localStorage.getItem('qrz_pass');

  if (!qrzUser || !qrzPass) {
    return fallbackResult;
  }

  try {
    const sessionKey = await getQRZSessionKey(qrzUser, qrzPass);
    if (!sessionKey) return fallbackResult;

    const query = new URLSearchParams({
      s: sessionKey,
      callsign: cleanCall,
    }).toString();

    const res = await fetch(`/api/qrz?${query}`);
    if (!res.ok) return fallbackResult;
    const xmlText = await res.text();

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, 'text/xml');

    const callNode = xmlDoc.querySelector('Callsign');
    if (!callNode) return fallbackResult;

    const getText = (selector: string): string => {
      const el = callNode.querySelector(selector);
      return el?.textContent?.trim() || '';
    };

    const fname = getText('fname');
    const name = getText('name');
    const fullName = [fname, name].filter(Boolean).join(' ') || getText('nickname');
    const email = getText('email');
    const country = getText('country') || prefixInfo.country;
    const grid = getText('grid') || prefixInfo.defaultGrid;
    const city = getText('addr2');
    const state = getText('state');

    return {
      callsign: cleanCall,
      name: fullName,
      email: email || '',
      country: country || prefixInfo.country,
      grid: grid || '',
      city,
      state,
      source: 'qrz',
    };
  } catch (e) {
    console.warn('QRZ lookup failed:', e);
    return fallbackResult;
  }
}
