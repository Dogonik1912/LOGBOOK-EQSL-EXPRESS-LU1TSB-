import React, { useEffect, useState } from 'react';
import { MapPin, MessageCircle, X } from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import { countryForCallsign, flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type PublicProfile = { callsign: string; photo: string; grid: string; location: string; elevation: number | null; loading: boolean };
type GridPoint = { latitude: number; longitude: number };
const localityCache = new Map<string, string>();

function maidenheadCenter(locator: string): GridPoint | null {
  const value = String(locator || '').trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(value)) return null;
  let lon = -180, lat = -90, lonSize = 20, latSize = 10;
  lon += (value.charCodeAt(0) - 65) * lonSize; lat += (value.charCodeAt(1) - 65) * latSize;
  lonSize /= 10; latSize /= 10;
  lon += Number(value[2]) * lonSize; lat += Number(value[3]) * latSize;
  if (value.length >= 6) { lonSize /= 24; latSize /= 24; lon += (value.charCodeAt(4) - 65) * lonSize; lat += (value.charCodeAt(5) - 65) * latSize; }
  if (value.length >= 8) { lonSize /= 10; latSize /= 10; lon += Number(value[6]) * lonSize; lat += Number(value[7]) * latSize; }
  if (value.length >= 10) { lonSize /= 24; latSize /= 24; lon += (value.charCodeAt(8) - 65) * lonSize; lat += (value.charCodeAt(9) - 65) * latSize; }
  return { latitude: lat + latSize / 2, longitude: lon + lonSize / 2 };
}

async function localityForGrid(locator: string, point: GridPoint): Promise<string> {
  const key = locator.toUpperCase();
  if (localityCache.has(key)) return localityCache.get(key) || '';

  const clean = (value: unknown) => String(value || '').trim();
  const format = (place: string, region: string, country: string) =>
    [place, region && region !== place ? region : '', country].filter(Boolean).join(', ');

  // Primero Photon: ofrece localidades cercanas y funciona bien en la mayoría de países.
  const radii = key.length <= 4 ? [30000, 50000] : key.length <= 6 ? [4000, 10000, 20000] : key.length <= 8 ? [500, 2000, 5000] : [100, 500, 1500];
  const settlementTypes = new Set(['city', 'town', 'village', 'hamlet', 'isolated_dwelling', 'suburb', 'neighbourhood']);
  for (const radius of radii) {
    try {
      const params = new URLSearchParams({ lat: String(point.latitude), lon: String(point.longitude), radius: String(radius), lang: 'es', limit: '8' });
      const response = await fetch('https://photon.komoot.io/reverse?' + params.toString());
      if (!response.ok) continue;
      const data = await response.json();
      const features = Array.isArray(data?.features) ? data.features : [];
      const ranked = [...features].sort((a: any, b: any) => {
        const aType = clean(a?.properties?.osm_value || a?.properties?.type).toLowerCase();
        const bType = clean(b?.properties?.osm_value || b?.properties?.type).toLowerCase();
        return Number(settlementTypes.has(bType)) - Number(settlementTypes.has(aType));
      });
      const properties = ranked.find((feature: any) => {
        const p = feature?.properties || {};
        return Boolean(p.locality || p.city || p.name || p.district || p.suburb || p.county);
      })?.properties || {};
      const place = clean(properties.locality || properties.city || properties.name || properties.district || properties.suburb || properties.county);
      const result = format(place, clean(properties.state || properties.county), clean(properties.country));
      if (result) {
        localityCache.set(key, result);
        return result;
      }
    } catch {
      // Si Photon falla o no conoce la zona, se consulta el proveedor alternativo.
    }
  }

  // Alternativa: Nominatim/OSM devuelve la jerarquía administrativa del punto.
  // Es especialmente útil en áreas urbanas donde Photon no devuelve resultados.
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: String(point.latitude),
      lon: String(point.longitude),
      zoom: '10',
      addressdetails: '1',
      'accept-language': 'es',
    });
    const response = await fetch('https://nominatim.openstreetmap.org/reverse?' + params.toString());
    if (response.ok) {
      const data = await response.json();
      const address = data?.address || {};
      const place = clean(
        address.city || address.town || address.village || address.municipality ||
        address.city_district || address.suburb || address.hamlet || address.county
      );
      const region = clean(address.state || address.province || address.region);
      const country = clean(address.country);
      const result = format(place, region, country);
      if (result) {
        localityCache.set(key, result);
        return result;
      }
    }
  } catch {
    // El perfil sigue disponible aunque los servicios externos no respondan.
  }
  return '';
}

export const openUserProfile = (rawCallsign: string) => {
  const callsign = String(rawCallsign || '').trim().toUpperCase().replace(/[^A-Z0-9/]/g, '');
  if (callsign.length >= 3) window.dispatchEvent(new CustomEvent('open-user-profile', { detail: { callsign } }));
};

export const UserPublicProfile: React.FC = () => {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  useEffect(() => {
    const onOpen = (event: Event) => {
      const callsign = String((event as CustomEvent<{callsign?: string}>).detail?.callsign || '').trim().toUpperCase();
      if (callsign.length < 3) return;
      setProfile({ callsign, photo: '', grid: '', location: '', elevation: null, loading: true });
    };
    window.addEventListener('open-user-profile', onOpen);
    return () => window.removeEventListener('open-user-profile', onOpen);
  }, []);
  useEffect(() => {
    if (!profile?.callsign) return;
    let active = true;
    const callsign = profile.callsign;
    const load = async () => {
      let photo = ''; let grid = '';
      if (supabase) {
        const [photoResult, gridResult] = await Promise.all([
          supabase.rpc('community_profile_photos', { p_callsigns: [callsign] }),
          supabase.from('live_spot_grid_locators').select('grid_locator').eq('callsign', callsign).maybeSingle(),
        ]);
        if (photoResult.data?.length) photo = String(photoResult.data[0]?.photo_data_url || '');
        if (!gridResult.error) grid = String(gridResult.data?.grid_locator || '').trim().toUpperCase();
      }
      const point = maidenheadCenter(grid);
      let elevation: number | null = null;
      let location = '';
      if (point) {
        const [place] = await Promise.all([
          localityForGrid(grid, point),
          (async () => {
            try {
              const url = 'https://api.open-meteo.com/v1/elevation?latitude=' + point.latitude.toFixed(5) + '&longitude=' + point.longitude.toFixed(5);
              const response = await fetch(url);
              if (response.ok) { const result = await response.json(); const value = Number(result?.elevation?.[0]); if (Number.isFinite(value)) elevation = Math.round(value); }
            } catch { /* La ficha sigue disponible aunque falle el servicio de elevación. */ }
          })(),
        ]);
        location = place;
      }
      if (active) setProfile({ callsign, photo, grid, location, elevation, loading: false });
    };
    void load();
    return () => { active = false; };
  }, [profile?.callsign]);
  if (!profile) return null;
  const is11m = is11MeterStationIdentifier(profile.callsign);
  const flag = flagForCallsign(profile.callsign, undefined, is11m);
  const country = countryForCallsign(profile.callsign, undefined, is11m) || 'País no identificado';
  return <div className='fixed inset-0 z-[10050] flex items-center justify-center bg-slate-950/80 p-4' role='dialog' aria-modal='true' aria-labelledby='public-profile-title' onMouseDown={(event) => { if (event.target === event.currentTarget) setProfile(null); }}>
    <section className='w-full max-w-sm rounded-2xl border border-sky-400/50 bg-slate-900 p-5 text-white shadow-2xl'>
      <div className='flex items-center justify-between gap-3'><h3 id='public-profile-title' className='text-lg font-black'>Perfil del usuario</h3><button type='button' onClick={() => setProfile(null)} className='rounded-lg p-2 text-slate-300 hover:bg-slate-800' aria-label='Cerrar perfil'><X className='h-5 w-5' /></button></div>
      <div className='mt-4 flex flex-col items-center gap-2'><div className='h-24 w-24 overflow-hidden rounded-full border-2 border-sky-300 bg-slate-800'>{profile.photo ? <img src={profile.photo} alt={'Foto de '+profile.callsign} className='h-full w-full object-cover' /> : <div className='flex h-full items-center justify-center font-mono text-xl font-black'>{profile.callsign.slice(0,3)}</div>}</div>
        <h4 className='font-mono text-xl font-black tracking-wider'>{profile.callsign}</h4><p className='text-sm text-slate-300'>{flag} {country} · {is11m ? '11 metros' : 'Radioaficionado'}</p></div>
      <div className='mt-5 space-y-3 rounded-xl border border-slate-700 bg-slate-950 p-3 text-sm'>
        <p className='flex items-center gap-2'><MapPin className='h-4 w-4 shrink-0 text-sky-300' /><span><strong>Ciudad / pueblo:</strong> {profile.loading ? 'Buscando…' : profile.location || 'No disponible para este Grid Locator'}</span></p>
        <p className='pl-6 text-slate-300'><strong>Grid Locator:</strong> {profile.grid || (profile.loading ? 'Consultando…' : 'No informado')}</p>
        <p className='pl-6 text-slate-300'><strong>Altitud sobre el nivel del mar:</strong> {profile.loading ? 'Calculando…' : profile.elevation === null ? 'No disponible' : '≈ '+profile.elevation+' m s. n. m.'}</p>
        <p className='pl-6 text-[11px] leading-relaxed text-slate-400'>Ciudad, pueblo y altitud estimados a partir del centro de la cuadrícula Maidenhead. No representan una dirección exacta ni la altura de la antena.</p>
      </div>
      <button type='button' disabled={profile.callsign === (localStorage.getItem('community_chat_active_callsign') || localStorage.getItem('community_chat_sd') || '').trim().toUpperCase()} onClick={() => { const target = profile.callsign; setProfile(null); window.dispatchEvent(new CustomEvent('open-private-message', { detail: { callsign: target } })); }} className='mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-3 font-bold text-white hover:bg-sky-600 disabled:opacity-40'><MessageCircle className='h-4 w-4' />Enviar mensaje privado</button>
      <button type='button' onClick={() => setProfile(null)} className='mt-2 w-full rounded-xl border border-slate-600 px-4 py-2.5 text-sm font-semibold text-slate-200'>Cerrar</button>
    </section>
  </div>;
};
