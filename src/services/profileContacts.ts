import type { QSO } from '../types';
import { countryForCallsign, is11MeterStationIdentifier } from './callsignCountry';

const stationType = (value: string): 'ham' | '11m' | '' => {
  const call = String(value || '').trim().toUpperCase();
  if (/^[0-9]{1,3}[A-Z]{1,4}[0-9]{1,4}$/.test(call)) return '11m';
  if (/^[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,7}(?:\/[A-Z0-9]{1,5})?$/.test(call)) return 'ham';
  return '';
};

export async function persistProfileContacts(qsos: QSO[]) {
  const token = localStorage.getItem('community_chat_identity_token') || '';
  const activeCall = (localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase();
  if (!token || !Array.isArray(qsos) || !qsos.length) return;
  const records = qsos.slice(0, 1000).flatMap(qso => {
    const remote = String(qso.callsign || '').trim().toUpperCase();
    const is11m = is11MeterStationIdentifier(qso.stationCallsign || '') || /11\s*metros|11m|27\s*mhz|banda ciudadana|\bcb\b/i.test(String(qso.band || ''));
    const owner = String(qso.stationCallsign || (is11m ? localStorage.getItem('cb_station_callsign') : '') || (!is11m ? (activeCall || '') : '')).trim().toUpperCase();
    const type = stationType(owner);
    const remoteType = stationType(remote);
    const date = String(qso.date || '').trim();
    const time = String(qso.time || '').trim();
    const band = String(qso.band || '').trim();
    const frequency = Number(String(qso.frequency || '').trim().replace(',', '.'));
    if (!owner || !remote || !type || type !== remoteType || !date || !time || !band || !Number.isFinite(frequency) || frequency <= 0) return [];
    const normalizedFrequency = frequency.toFixed(3);
    const mode = String(qso.mode || '').trim().toUpperCase();
    const calls = [owner, remote].sort((a, b) => a.localeCompare(b));
    return [{
      stationCallsign: owner,
      remoteCallsign: remote,
      date,
      time,
      band,
      frequency: normalizedFrequency,
      mode,
      country: countryForCallsign(remote, qso.country, is11m),
      division: is11m ? (remote.match(/^([0-9]{1,3})[A-Z]/)?.[1] || '') : '',
      stationType: type,
      qsoKey: [calls[0], calls[1], date, time, band.toLowerCase(), normalizedFrequency, mode].join('|'),
    }];
  });
  if (!records.length) return;
  for (let offset = 0; offset < records.length; offset += 100) {
    try {
      await fetch('/api/directory?action=profile-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'profile-contacts', token, callsign: activeCall, records: records.slice(offset, offset + 100) }),
      });
    } catch { /* El libro de guardia sigue funcionando sin conexión; se sincroniza al próximo cambio. */ }
  }
}
