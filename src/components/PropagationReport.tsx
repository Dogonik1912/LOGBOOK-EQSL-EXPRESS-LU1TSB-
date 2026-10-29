import React, { useEffect, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';

type Zone = { name: string; utcOffset: number; latitude: number };
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
      const fluxRows = Array.isArray(fluxData) ? fluxData : [fluxData];
      const fluxRow = [...fluxRows].reverse().find((row: any) => Number.isFinite(Number(row?.Flux ?? row?.flux ?? row?.['10cm_flux'])));
      const fluxValue = Number(fluxRow?.Flux ?? fluxRow?.flux ?? fluxRow?.['10cm_flux']);
      const kpRows = Array.isArray(kpData) ? kpData.slice(1) : [];
      const kpRow = [...kpRows].reverse().find((row: any) => Number.isFinite(Number(row?.kp_index ?? row?.estimated_kp ?? row?.Kp)));
      const kpValue = Number(kpRow?.kp_index ?? kpRow?.estimated_kp ?? kpRow?.Kp);
      if (!Number.isFinite(fluxValue) || !Number.isFinite(kpValue)) throw new Error('Los servicios no devolvieron valores solares válidos.');
      setSfi(fluxValue);
      setKp(kpValue);
      setUpdated(new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Datos solares no disponibles. Intentá nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (open && sfi === null && !loading) void refresh(); }, [open]);

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
    <section className="mx-auto my-4 w-[calc(100%-1rem)] max-w-4xl overflow-hidden rounded-xl border border-amber-500/70 bg-slate-950 text-white shadow-lg">
      <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open}
        className="flex w-full min-w-0 items-center justify-between gap-3 bg-slate-900 px-4 py-3 text-left hover:bg-slate-800">
        <span className="min-w-0 break-words font-bold">PROPAGACIÓN · INFORME POR ZONAS</span>
        <ChevronDown className={'h-5 w-5 shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="min-w-0 space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="rounded-lg bg-slate-900 p-3">
            <span className="block break-words text-xs text-slate-300">Flujo solar (SFI)</span>
            <strong className="text-xl">{sfi === null ? '—' : Math.round(sfi)}</strong>
          </div>
          <div className="rounded-lg bg-slate-900 p-3">
            <span className="block break-words text-xs text-slate-300">Índice geomagnético Kp</span>
            <strong className="text-xl">{kp === null ? '—' : kp.toFixed(1)}</strong>
          </div>
        </div>
        <p className="break-words rounded-lg border border-slate-800 bg-slate-900 p-3 text-sm leading-relaxed">{summary}</p>
        <h3 className="text-center text-sm font-bold">Orientación estimada por zona</h3>
        <p className="break-words text-xs leading-relaxed text-slate-400">Los valores SFI y Kp son mediciones globales de NOAA. Las recomendaciones por zona combinan esos valores con la hora local; no son mediciones independientes de cada región.</p>
        <div className="min-w-0 space-y-2">
          {zones.map(zone => <div key={zone.name} className="grid min-w-0 grid-cols-1 gap-1 rounded-lg border border-slate-800 bg-slate-900 p-2 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)] sm:items-start sm:gap-3">
            <strong className="break-words text-sm">{zone.name}</strong>
            <span className="min-w-0 break-words text-xs leading-relaxed text-slate-200">{zoneAssessment(zone)}</span>
          </div>)}
        </div>
        {error && <p role="status" className="break-words text-sm text-amber-200">{error}</p>}
        {updated && <p className="break-words text-xs text-slate-400">Actualizado: {updated} · Fuente: NOAA, Centro de Predicción del Clima Espacial.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex max-w-full items-center justify-center gap-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm font-semibold hover:bg-slate-700 disabled:opacity-60">
            <RefreshCw className={'h-4 w-4 shrink-0 ' + (loading ? 'animate-spin' : '')} />{loading ? 'Actualizando…' : 'Actualizar datos'}
          </button>
          <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm hover:bg-slate-800">Cerrar</button>
        </div>
      </div>}
    </section>
  );
};
