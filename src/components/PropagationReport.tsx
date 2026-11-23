import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { countryForCallsign, flagForCallsign, is11MeterStationIdentifier } from '../services/callsignCountry';

type Zone = { name: string; utcOffset: number; latitude: number };
type DXReception = { receiverCallsign: string; senderCallsign: string; frequency: number; flowStartSeconds: number; receiverLocator?: string; };
type GeoPoint = { lat: number; lon: number };
function maidenheadToLatLon(locator?: string): GeoPoint | null {
 const v=String(locator||'').trim().toUpperCase();
 if(!/^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(v)) return null;
 let lon=-180+(v.charCodeAt(0)-65)*20, lat=-90+(v.charCodeAt(1)-65)*10, lonSize=2, latSize=1;
 lon+=Number(v[2])*2; lat+=Number(v[3]);
 if(v.length>=6){lonSize/=24;latSize/=24;lon+=(v.charCodeAt(4)-65)*lonSize;lat+=(v.charCodeAt(5)-65)*latSize;}
 if(v.length>=8){lonSize/=10;latSize/=10;lon+=Number(v[6])*lonSize;lat+=Number(v[7])*latSize;}
 return {lat:lat+latSize/2,lon:lon+lonSize/2};
}
function distanceKm(a:GeoPoint,b:GeoPoint){const r=(n:number)=>n*Math.PI/180,d1=r(b.lat-a.lat),d2=r(b.lon-a.lon),h=Math.sin(d1/2)**2+Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(d2/2)**2;return 6371*2*Math.asin(Math.sqrt(h));}
const continentForPoint=(p:GeoPoint)=>p.lon < -30?(p.lat>5?'América del Norte':'América del Sur'):p.lon<60?(p.lat>34?'Europa':'África'):p.lat>-10?'Asia':'Oceanía';
const mapRegions=[
{name:'América del Norte',lat:40,lon:-100,radius:4200000,bounds:{south:5,north:85,west:-170,east:-30}},
{name:'América del Sur',lat:-20,lon:-60,radius:3600000,bounds:{south:-60,north:15,west:-95,east:-30}},
{name:'Europa',lat:52,lon:15,radius:2300000,bounds:{south:34,north:72,west:-30,east:60}},
{name:'África',lat:0,lon:20,radius:3900000,bounds:{south:-40,north:37,west:-30,east:60}},
{name:'Asia',lat:35,lon:100,radius:5200000,bounds:{south:-10,north:80,west:60,east:180}},
{name:'Oceanía',lat:-25,lon:140,radius:3200000,bounds:{south:-50,north:0,west:110,east:180}}
];
const zones: Zone[] = [
  { name: 'América del Sur', utcOffset: -3, latitude: -25 },
  { name: 'América del Norte', utcOffset: -5, latitude: 40 },
  { name: 'Europa', utcOffset: 1, latitude: 50 },
  { name: 'África', utcOffset: 2, latitude: 0 },
  { name: 'Asia', utcOffset: 8, latitude: 30 },
  { name: 'Oceanía', utcOffset: 10, latitude: -25 },
];

export const PropagationReport: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sfi, setSfi] = useState<number | null>(null);
  const [kp, setKp] = useState<number | null>(null);
  const [updated, setUpdated] = useState('');
  const [error, setError] = useState('');
  const [dxReports, setDxReports] = useState<DXReception[]>([]);
  const [dxLoading, setDxLoading] = useState(false);
  const [dxError, setDxError] = useState('');
  const [dxUpdated, setDxUpdated] = useState('');
  const [lastDxRequest, setLastDxRequest] = useState(0);
  const [mapZone, setMapZone] = useState<'world'|'zone'|'country'|'continent'>('world');
  const [mapStatus, setMapStatus] = useState('Cargando cartografía…');
  const mapElementRef = useRef<HTMLDivElement|null>(null);
  const mapInstanceRef = useRef<any>(null);
  const mapLayersRef = useRef<any>(null);
  const [identityRefresh, setIdentityRefresh] = useState(0);
  const [selectedIdentity, setSelectedIdentity] = useState<'11m' | 'ham'>(() => {
    const saved = localStorage.getItem('logbook_propagation_identity');
    if (saved === '11m' || saved === 'ham') return saved;
    const primary = (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
    const active = (localStorage.getItem('community_chat_active_callsign') || '').trim().toUpperCase();
    const cb = (localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
    return cb && active === cb ? '11m' : (is11MeterStationIdentifier(primary) ? '11m' : 'ham');
  });
  const stationIdentity = useMemo(() => {
    const primary = (localStorage.getItem('community_chat_sd') || localStorage.getItem('user_callsign') || '').trim().toUpperCase();
    const cb = (localStorage.getItem('cb_station_callsign') || '').trim().toUpperCase();
    const linkedTo = (localStorage.getItem('cb_station_linked_sd') || '').trim().toUpperCase();
    const primaryIs11m = is11MeterStationIdentifier(primary);
    const linkedCb = Boolean(cb && !primaryIs11m && linkedTo === primary);
    const hasHam = Boolean(primary && !primaryIs11m);
    const has11m = Boolean(linkedCb || primaryIs11m);
    const callsign11m = linkedCb ? cb : (primaryIs11m ? primary : '');
    const callsignHam = hasHam ? primary : '';
    const selectedCallsign = selectedIdentity === '11m' ? callsign11m : callsignHam;
    return {
      hasHam, has11m, selectedCallsign,
      selectedType: selectedCallsign ? selectedIdentity : (callsign11m ? '11m' : 'ham'),
      flag: selectedCallsign ? flagForCallsign(selectedCallsign, undefined, selectedIdentity === '11m') : '🏳️',
      grid: (localStorage.getItem('user_grid_locator') || '').trim().toUpperCase(),
    };
  }, [identityRefresh, selectedIdentity]);
  useEffect(() => {
    const refreshIdentity = () => setIdentityRefresh(value => value + 1);
    window.addEventListener('user-profile-updated', refreshIdentity);
    window.addEventListener('community-active-identity-changed', refreshIdentity);
    window.addEventListener('storage', refreshIdentity);
    return () => {
      window.removeEventListener('user-profile-updated', refreshIdentity);
      window.removeEventListener('community-active-identity-changed', refreshIdentity);
      window.removeEventListener('storage', refreshIdentity);
    };
  }, []);
  useEffect(() => {
    if (stationIdentity.has11m && !stationIdentity.hasHam) setSelectedIdentity('11m');
    else if (stationIdentity.hasHam && !stationIdentity.has11m) setSelectedIdentity('ham');
  }, [stationIdentity.has11m, stationIdentity.hasHam]);
  const chooseIdentity = (identity: '11m' | 'ham') => {
    setSelectedIdentity(identity);
    localStorage.setItem('logbook_propagation_identity', identity);
  };


  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const [fluxResponse, kpResponse] = await Promise.all([
        fetch('https://services.swpc.noaa.gov/products/summary/10cm-flux.json', { cache: 'no-store' }),
        fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json', { cache: 'no-store' }),
      ]);
      if (!fluxResponse.ok || !kpResponse.ok) throw new Error('No se pudieron consultar los datos solares.');
      const fluxData = await fluxResponse.json();
      const kpData = await kpResponse.json();
      const normalizeRows = (data: any, valueKey: string) => {
        if (!Array.isArray(data)) return data && typeof data === 'object' ? [data] : [];
        // NOAA cambió estos productos a objetos JSON con claves en marzo de 2026.
        // Se admite también el formato tabular anterior por compatibilidad.
        if (Array.isArray(data[0])) {
          const headers = data[0].map((key: unknown) => String(key));
          return data.slice(1).map((values: unknown[]) =>
            Object.fromEntries(headers.map((key: string, index: number) => [key, values[index]]))
          );
        }
        return data;
      };
      const fluxRows = normalizeRows(fluxData, 'flux');
      const fluxRow = [...fluxRows].reverse().find((row: any) => {
        const value = Number(row?.Flux ?? row?.flux ?? row?.['10cm_flux']);
        return Number.isFinite(value) && Number.isFinite(Date.parse(String(row?.time_tag || '')));
      });
      const fluxValue = Number(fluxRow?.Flux ?? fluxRow?.flux ?? fluxRow?.['10cm_flux']);
      const kpRows = normalizeRows(kpData, 'Kp');
      const kpRow = [...kpRows].reverse().find((row: any) => {
        const value = Number(row?.kp_index ?? row?.estimated_kp ?? row?.Kp);
        return Number.isFinite(value) && Number.isFinite(Date.parse(String(row?.time_tag || '')));
      });
      const kpValue = Number(kpRow?.kp_index ?? kpRow?.estimated_kp ?? kpRow?.Kp);
      if (!Number.isFinite(fluxValue) || !Number.isFinite(kpValue)) throw new Error('NOAA no devolvió mediciones solares válidas. Se conservan los últimos datos disponibles.');
      const kpTime = Date.parse(String(kpRow.time_tag));
      const fluxTime = Date.parse(String(fluxRow.time_tag));
      const nowTime = Date.now();
      if (nowTime - kpTime > 9 * 60 * 60 * 1000 || nowTime - fluxTime > 72 * 60 * 60 * 1000) {
        throw new Error('Los datos de NOAA recibidos están demasiado antiguos. Se mantienen las últimas mediciones válidas.');
      }
      setSfi(fluxValue);
      setKp(kpValue);
      setUpdated('NOAA · Kp ' + new Date(kpTime).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC · Flujo ' + new Date(fluxTime).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'UTC' }) + ' UTC');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Datos solares no disponibles. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open && sfi === null && !loading) void refresh(); }, [open]);


  const refreshDx = async () => {
    const callsign = stationIdentity.selectedCallsign.trim().toUpperCase();
    if (!callsign || stationIdentity.selectedType !== 'ham') {
      setDxReports([]);
      setDxError(stationIdentity.selectedType === '11m'
        ? 'Los informes de 11 metros requieren una fuente autorizada de 11 m; PSK Reporter no se usa para esta modalidad.'
        : 'Seleccioná una señal distintiva de radioaficionado para consultar informes.');
      return;
    }
    const now = Date.now();
    if (lastDxRequest && now - lastDxRequest < 300000) {
      setDxError('PSK Reporter recomienda consultar como máximo cada 5 minutos. Esperá antes de volver a actualizar.');
      return;
    }
    setLastDxRequest(now);
    setDxLoading(true);
    setDxError('');
    try {
      const url = new URL('https://retrieve.pskreporter.info/query');
      url.searchParams.set('callsign', callsign);
      url.searchParams.set('flowStartSeconds', '-21600');
      url.searchParams.set('rptlimit', '50');
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('PSK Reporter no está disponible en este momento.');
      const xml = new DOMParser().parseFromString(await response.text(), 'application/xml');
      if (xml.querySelector('parsererror')) throw new Error('La respuesta de PSK Reporter no tiene un formato válido.');
      const reports = Array.from(xml.querySelectorAll('receptionReport')).map(node => ({
        receiverCallsign: node.getAttribute('receiverCallsign') || '',
        senderCallsign: node.getAttribute('senderCallsign') || '',
        frequency: Number(node.getAttribute('frequency') || 0),
        flowStartSeconds: Number(node.getAttribute('flowStartSeconds') || 0),
        receiverLocator: node.getAttribute('receiverLocator') || undefined,
      })).filter(report => report.receiverCallsign || report.senderCallsign);
      setDxReports(reports);
      setDxUpdated(new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }));
      if (!reports.length) setDxError('No hay informes para este indicativo en las últimas 6 horas. Esto no significa que no haya propagación.');
    } catch (e) {
      setDxError(e instanceof Error ? e.message : 'No se pudieron recuperar los informes DX.');
    } finally {
      setDxLoading(false);
    }
  };

  const sharePropagation = async () => {
    const shareText = [
      'LogBook eQSL EXPRESS · Centro Mundial de Propagación DX',
      'Estación: ' + (stationIdentity.selectedCallsign || 'sin indicativo'),
      'Modalidad: ' + (stationIdentity.selectedType === '11m' ? '11 metros' : 'Radioafición'),
      'Grid Locator: ' + (stationIdentity.grid || 'no informado'),
      'SFI: ' + (sfi === null ? 'sin dato' : Math.round(sfi)),
      'Kp: ' + (kp === null ? 'sin dato' : kp.toFixed(1)),
      'Informes DX: ' + dxReports.length,
      window.location.origin,
    ].join('\n');
    try {
      if (navigator.share) await navigator.share({ title: 'Propagación DX · LogBook eQSL EXPRESS', text: shareText, url: window.location.origin });
      else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareText);
        window.alert('Información copiada. Ya podés pegarla en WhatsApp, Telegram o correo.');
      } else window.prompt('Copiá la información para compartirla:', shareText);
    } catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) window.alert('No se pudo abrir el menú de compartir.');
    }
  };

  useEffect(() => {
    if (open && stationIdentity.selectedType === 'ham' && stationIdentity.selectedCallsign) void refreshDx();
  }, [open, stationIdentity.selectedCallsign, stationIdentity.selectedType]);

  const ownGeo=maidenheadToLatLon(stationIdentity.grid);
  const ownCountry=countryForCallsign(stationIdentity.selectedCallsign,undefined,stationIdentity.selectedType==='11m');
  const ownContinent=ownGeo?continentForPoint(ownGeo):'';
  const visibleDxReports=dxReports.filter(report=>{
    const p=maidenheadToLatLon(report.receiverLocator); if(!p)return false;
    if(mapZone==='zone')return Boolean(ownGeo&&distanceKm(ownGeo,p)<=1200);
    if(mapZone==='country')return Boolean(ownCountry&&countryForCallsign(report.receiverCallsign)===ownCountry);
    if(mapZone==='continent'){const r=mapRegions.find(x=>x.name===ownContinent);return Boolean(r&&p.lat>=r.bounds.south&&p.lat<=r.bounds.north&&p.lon>=r.bounds.west&&p.lon<=r.bounds.east);}
    return true;
  });
  useEffect(()=>{
    if(!open||!mapElementRef.current)return;
    let cancelled=false;
    const load=async()=>{
      if(!(window as any).L){
        let script=document.querySelector('script[data-logbook-leaflet]') as HTMLScriptElement|null;
        if(!script){script=document.createElement('script');script.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';script.async=true;script.dataset.logbookLeaflet='true';document.head.appendChild(script);}
        await new Promise<void>((resolve,reject)=>{if((window as any).L)return resolve();script!.addEventListener('load',()=>resolve(),{once:true});script!.addEventListener('error',()=>reject(new Error('No se pudo cargar el motor del mapa.')),{once:true});});
      }
      if(cancelled||!mapElementRef.current)return;
      const L=(window as any).L;
      if(!document.querySelector('link[data-logbook-leaflet-css]')){const css=document.createElement('link');css.rel='stylesheet';css.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';css.dataset.logbookLeafletCss='true';document.head.appendChild(css);}
      if(!mapInstanceRef.current){mapInstanceRef.current=L.map(mapElementRef.current,{worldCopyJump:true,scrollWheelZoom:true}).setView([15,0],2);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>'}).addTo(mapInstanceRef.current);mapLayersRef.current=L.layerGroup().addTo(mapInstanceRef.current);}
      const map=mapInstanceRef.current,layers=mapLayersRef.current;layers.clearLayers();
      const state=(r:typeof mapRegions[number])=>{const h=(new Date().getUTCHours()+Math.round(r.lon/15)+24)%24,day=h>=7&&h<19;if(kp!==null&&kp>=5)return{label:'Mala',color:'#ef4444'};if(sfi!==null&&sfi>=120&&day&&(kp===null||kp<4))return{label:'Buena',color:'#22c55e'};return{label:'Media',color:'#f59e0b'};};
      mapRegions.forEach(r=>{const st=state(r);L.circle([r.lat,r.lon],{radius:r.radius,color:st.color,weight:1.5,fillColor:st.color,fillOpacity:.19,opacity:.75}).bindTooltip(r.name+' · Propagación estimada: '+st.label).addTo(layers);});
      const esc=(v:string)=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
      visibleDxReports.forEach(report=>{const p=maidenheadToLatLon(report.receiverLocator);if(!p)return;L.circleMarker([p.lat,p.lon],{radius:7,color:'#fff',weight:2,fillColor:'#06b6d4',fillOpacity:1}).bindPopup('<b>DX reportado · PSK Reporter</b><br>TX: '+esc(report.senderCallsign)+'<br>Receptor: '+esc(report.receiverCallsign)+'<br>Locator: '+esc(report.receiverLocator||'')+'<br>Frecuencia: '+(report.frequency?(report.frequency/1e6).toFixed(3)+' MHz':'—')+'<br>UTC: '+(report.flowStartSeconds?new Date(report.flowStartSeconds*1000).toISOString().slice(11,16):'—')).addTo(layers);});
      const reg=mapRegions.find(x=>x.name===ownContinent);
      if(mapZone==='world')map.setView([15,0],2);else if(ownGeo&&mapZone==='zone')map.setView([ownGeo.lat,ownGeo.lon],5);else if(ownGeo&&mapZone==='continent'&&reg)map.fitBounds([[reg.bounds.south,reg.bounds.west],[reg.bounds.north,reg.bounds.east]]);else if(ownGeo)map.setView([ownGeo.lat,ownGeo.lon],4);
      setMapStatus(visibleDxReports.length?visibleDxReports.length+' informes con locator válido visibles. Los informes sin locator no se pueden ubicar.':'No hay informes DX con locator válido para este filtro. Esto no significa ausencia de propagación.');
      window.setTimeout(()=>map.invalidateSize(),100);
    };
    load().catch(e=>setMapStatus(e instanceof Error?e.message:'Mapa no disponible.'));
    return()=>{cancelled=true;if(mapInstanceRef.current){mapInstanceRef.current.remove();mapInstanceRef.current=null;mapLayersRef.current=null;}};
  },[open,mapZone,dxReports,visibleDxReports.length,stationIdentity.grid,ownContinent,sfi,kp]);

  const summary = kp === null || sfi === null
    ? 'Esperando datos solares actualizados.'
    : kp >= 5
      ? 'Perturbación geomagnética elevada: las bandas altas pueden sufrir desvanecimientos.'
      : sfi >= 120 && kp < 4
        ? 'Buen nivel de flujo solar y campo geomagnético tranquilo: las bandas altas pueden abrirse con mayor facilidad.'
        : sfi >= 90 && kp < 4
          ? 'Condiciones solares moderadas y campo geomagnético tranquilo.'
          : 'Flujo solar bajo o moderado: las bandas bajas suelen ser más útiles, según la hora local.';

  const zoneAssessment = (zone: Zone) => {
    if (sfi === null || kp === null) return 'Sin datos';
    const utcHour = new Date().getUTCHours();
    const localHour = (utcHour + zone.utcOffset + 24) % 24;
    const daylight = localHour >= 7 && localHour < 19;
    if (kp >= 5) return daylight ? 'Bandas altas variables; revisar desvanecimientos' : 'Bandas bajas más estables; posible ruido';
    if (daylight && sfi >= 100) return 'Mejor oportunidad en bandas altas (14–28 MHz)';
    if (daylight) return 'Probar 14 MHz; comparar con 7 MHz';
    if (sfi >= 100) return 'Probar 7–14 MHz según apertura';
    return 'Priorizar 3,5–7 MHz; comprobar ruido local';
  };

  return (
    <section className="relative mx-auto my-4 w-full max-w-6xl overflow-hidden rounded-[26px] border border-slate-700/70 bg-gradient-to-br from-[#071326] via-[#0b1b34] to-[#171536] text-white shadow-[0_24px_80px_rgba(2,8,23,0.48)]">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="flex min-h-[82px] w-full min-w-0 items-center justify-between gap-3 border-b border-white/10 bg-gradient-to-r from-[#12365c] via-[#132b4d] to-[#30204e] px-4 py-4 text-left transition hover:brightness-110 sm:px-6">
        <span className="flex min-w-0 flex-col gap-1"><span className="text-[10px] font-black uppercase tracking-[0.24em] text-cyan-300">LogBook eQSL EXPRESS · DX CENTER</span><span className="break-words text-lg font-black tracking-tight sm:text-2xl">CENTRO MUNDIAL DE PROPAGACIÓN</span><span className="text-xs font-medium text-slate-300">Actividad solar · recepción DX · panorama global</span></span>
        <ChevronDown className={'h-5 w-5 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="relative min-w-0 space-y-5 bg-[radial-gradient(ellipse_at_10%_0%,rgba(14,165,233,0.12),transparent_38%),radial-gradient(ellipse_at_90%_15%,rgba(168,85,247,0.12),transparent_34%)] p-3 sm:p-5 lg:p-6">
        <section className="relative overflow-hidden rounded-3xl border border-cyan-300/20 bg-gradient-to-br from-[#12365d] via-[#102747] to-[#28204e] p-4 shadow-xl sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-cyan-200">MI ESTACIÓN · IDENTIDAD ACTIVA</span>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span role="img" aria-label="Bandera del país de la estación" className="text-4xl leading-none drop-shadow-lg sm:text-5xl">{stationIdentity.flag}</span>
                <strong data-no-translate="true" translate="no" className="break-all font-mono text-3xl font-black tracking-tight text-white sm:text-4xl">{stationIdentity.selectedCallsign || 'Indicativo no disponible'}</strong>
              </div>
              <span className="mt-2 block text-xs font-medium text-blue-100/80">
                {stationIdentity.selectedType === '11m' ? 'Modalidad: 11 metros' : 'Modalidad: radioafición'}
                {stationIdentity.grid ? ' · Grid Locator: ' + stationIdentity.grid : ' · Grid Locator pendiente'}
              </span>
            </div>
            {stationIdentity.hasHam && stationIdentity.has11m && (
              <div className="flex flex-wrap gap-1.5" aria-label="Seleccionar identidad de estación">
                <button type="button" onClick={() => chooseIdentity('11m')} aria-pressed={selectedIdentity === '11m'} className={'rounded-lg border px-3 py-2 text-xs font-bold ' + (selectedIdentity === '11m' ? 'border-emerald-300 bg-emerald-600 text-white' : 'border-slate-600 bg-slate-800 text-slate-200')}>11 metros</button>
                <button type="button" onClick={() => chooseIdentity('ham')} aria-pressed={selectedIdentity === 'ham'} className={'rounded-lg border px-3 py-2 text-xs font-bold ' + (selectedIdentity === 'ham' ? 'border-sky-300 bg-sky-600 text-white' : 'border-slate-600 bg-slate-800 text-slate-200')}>Radioafición</button>
              </div>
            )}
          </div>
          {!stationIdentity.selectedCallsign && <p className="mt-2 text-xs text-amber-200">No se encontró una identidad verificada para esta modalidad. Revisá la identidad de tu cuenta y la SD vinculada de 11 metros en Ajustes.</p>}
        </section>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="group relative overflow-hidden rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-400/15 to-orange-500/5 p-4">
            <span className="block break-words text-xs font-bold uppercase tracking-wider text-amber-100/80">☀ FLUJO SOLAR · SFI</span>
            <strong className="mt-2 block text-4xl font-black tracking-tight text-white">{sfi === null ? '—' : Math.round(sfi)}</strong>
          </div>
          <div className="rounded-lg bg-slate-900 p-3">
            <span className="block break-words text-xs font-bold uppercase tracking-wider text-violet-100/80">◉ GEOMAGNÉTICO · KP</span>
            <strong className="mt-2 block text-4xl font-black tracking-tight text-white">{kp === null ? '—' : kp.toFixed(1)}</strong>
          </div>
        </div>
        <p className="break-words rounded-2xl border border-cyan-300/20 bg-gradient-to-r from-[#153452] to-[#252044] p-4 text-sm font-medium leading-relaxed text-slate-100 shadow-lg">{summary}</p>
        <section className="space-y-3 rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-[#0c263d] to-[#101a34] p-3 shadow-xl sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-base font-black text-white sm:text-lg">MAPA MUNDIAL DX Y PROPAGACIÓN</h3><p className="text-xs text-slate-300">Cartografía real · DX reportados · zonas estimadas</p></div><span className="rounded-full border border-cyan-300/30 bg-cyan-300/10 px-3 py-1 text-[10px] font-black text-cyan-100">OPENSTREETMAP</span></div>
          <div className="flex flex-wrap gap-2">{([{id:'zone',label:'Mi zona'},{id:'country',label:'Mi país'},{id:'continent',label:'Mi continente'},{id:'world',label:'Todo el mundo'}] as const).map(x=><button key={x.id} type="button" onClick={()=>setMapZone(x.id)} aria-pressed={mapZone===x.id} className={'rounded-lg border px-3 py-2 text-xs font-bold '+(mapZone===x.id?'border-cyan-300 bg-cyan-500 text-slate-950':'border-slate-600 bg-slate-900/70 text-slate-200')}>{x.label}</button>)}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-xl border border-white/10 bg-slate-950/60 px-3 py-2 text-[11px] font-bold"><span className="text-emerald-300">● Verde · Buena</span><span className="text-amber-300">● Naranja · Media</span><span className="text-red-400">● Rojo · Mala</span><span className="text-cyan-300">● Punto azul · DX real</span></div>
          <div ref={mapElementRef} className="z-0 h-[420px] w-full overflow-hidden rounded-xl border border-slate-600 bg-slate-900 sm:h-[520px]" role="application" aria-label="Mapa interactivo mundial de propagación y reportes DX"/>
          <p role="status" className="text-xs leading-relaxed text-slate-300">{mapStatus}</p><p className="text-[10px] leading-relaxed text-slate-400">Los puntos azules son reportes digitales reales de PSK Reporter con locator válido. Los círculos de color son orientación regional simplificada basada en SFI, Kp y hora solar; no son mediciones locales ni una predicción de cobertura. © OpenStreetMap.</p>
          {!ownGeo&&<p className="text-xs text-amber-200">Completá tu Grid Locator en el perfil para centrar Mi zona, Mi país y Mi continente.</p>}
        </section>
        <section className="space-y-4 overflow-hidden rounded-2xl border border-emerald-300/20 bg-gradient-to-br from-[#0d2538] to-[#0b1b31] p-4 shadow-xl sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-black tracking-tight text-white sm:text-lg">DX MUNDIAL · RECEPCIÓN DE MI ESTACIÓN</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-300">Informes reales de recepción digital asociados al indicativo, desde estaciones receptoras de cualquier región.</p>
            </div>
            <button type="button" onClick={() => void refreshDx()} disabled={dxLoading || stationIdentity.selectedType !== 'ham'} className="rounded-lg border border-emerald-500/60 px-3 py-2 text-xs font-semibold disabled:opacity-50">{dxLoading ? 'Consultando…' : 'Actualizar DX'}</button>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-slate-300">
            <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-3 py-1.5 font-black tracking-wider text-emerald-200">● REAL · PSK REPORTER</span>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 font-bold text-slate-300">ÚLTIMAS 6 HORAS</span>
            {dxUpdated && <span className="rounded bg-slate-800 px-2 py-1">Consulta: {dxUpdated}</span>}
          </div>
          {dxError && <p role="status" className="text-xs leading-relaxed text-amber-200">{dxError}</p>}
          {dxReports.length > 0 && <div className="max-h-80 overflow-auto rounded-xl border border-white/10 shadow-lg">
            <table className="w-full min-w-[500px] text-left text-xs">
              <thead className="sticky top-0 bg-gradient-to-r from-[#183754] to-[#20274a] text-cyan-100"><tr><th className="p-2">Estación TX</th><th className="p-2">Receptor</th><th className="p-2">Frecuencia</th><th className="p-2">Locator receptor</th><th className="p-2">UTC</th></tr></thead>
              <tbody>{dxReports.map((report, index) => <tr key={report.flowStartSeconds + '-' + report.receiverCallsign + '-' + index} className="border-t border-slate-800">
                <td className="p-2 font-mono">{report.senderCallsign || '—'}</td>
                <td className="p-2 font-mono">{report.receiverCallsign || '—'}</td>
                <td className="p-2">{report.frequency ? (report.frequency / 1000000).toFixed(3) + ' MHz' : '—'}</td>
                <td className="p-2">{report.receiverLocator || '—'}</td>
                <td className="p-2">{report.flowStartSeconds ? new Date(report.flowStartSeconds * 1000).toISOString().slice(11, 16) : '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <p className="text-[11px] leading-relaxed text-slate-400">PSK Reporter recoge recepción de señales digitales reportadas por estaciones voluntarias. No representa todos los contactos ni la fonía SSB. Para 11 metros se necesita una conexión autorizada con una fuente específica de esa banda.</p>
          {stationIdentity.selectedType === '11m' && <a href="https://log11dx.com/" target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-sky-500/50 px-3 py-2 text-xs font-semibold text-sky-200">Abrir cluster mundial de 11 metros (LOG11DX)</a>}
        </section>
        <h3 className="text-base font-black uppercase tracking-wider text-white">PANORAMA POR REGIONES DEL MUNDO</h3>
        <p className="break-words text-xs leading-relaxed text-violet-100/70">Orientación calculada con índices globales y hora local; no son reportes medidos de cada región.</p>
        <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map(zone => <div key={zone.name} className="grid min-w-0 grid-cols-1 gap-2 rounded-xl border border-white/10 bg-gradient-to-br from-violet-400/10 to-sky-400/5 p-3 transition hover:border-violet-200/30 hover:from-violet-400/15 sm:items-start">
            <strong className="break-words text-sm font-bold text-white">{zone.name}</strong>
            <span className="min-w-0 break-words text-xs leading-relaxed text-slate-300">{zoneAssessment(zone)}</span>
          </div>)}
        </div>
        {error && <p role="status" className="break-words text-sm text-amber-200">{error}</p>}
        {updated && <p className="break-words text-xs text-slate-400">Actualizado: {updated} · Fuente: NOAA, Centro de Predicción del Clima Espacial.</p>}
        <div className="flex flex-wrap gap-2 border-t border-white/10 pt-4">
          <button type="button" onClick={() => void sharePropagation()} className="inline-flex items-center justify-center rounded-xl border border-cyan-200/20 bg-gradient-to-r from-cyan-400 to-blue-500 px-5 py-3 text-sm font-black uppercase tracking-wider text-slate-950 shadow-lg shadow-blue-950/40 transition hover:brightness-110">Compartir propagación</button>
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex max-w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-slate-100 transition hover:bg-white/10 disabled:opacity-60">
            <RefreshCw className={'h-4 w-4 shrink-0 ' + (loading ? 'animate-spin' : '')} />{loading ? 'Actualizando…' : 'Actualizar datos'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-slate-300 transition hover:bg-white/10">Cerrar</button>
        </div>
      </div>}
    </section>
  );
};
