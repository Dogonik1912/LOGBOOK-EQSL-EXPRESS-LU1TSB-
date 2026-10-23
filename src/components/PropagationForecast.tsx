import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Radio, RefreshCw, Sun, MapPin, ExternalLink } from 'lucide-react';

type KpRow = { time_tag?: string; kp?: number | string; observed?: string; noaa_scale?: string | null };
type FluxRow = { time?: string; metric?: string; value?: number | string };
type DayForecast = { date: string; maxKp: number; meanKp: number; flux: number | null; periods: number; predicted: number };

function locatorLabel(grid: string) {
  const v = grid.trim().toUpperCase();
  return /^[A-R]{2}[0-9]{2}([A-X]{2})?$/.test(v) ? v : '';
}
function describeKp(kp: number) {
  if (kp >= 7) return { label: 'Tormenta geomagnética fuerte', tone: 'text-rose-300' };
  if (kp >= 5) return { label: 'Tormenta geomagnética: posibles perturbaciones HF', tone: 'text-amber-300' };
  if (kp >= 4) return { label: 'Actividad elevada; vigilar bandas altas', tone: 'text-yellow-200' };
  if (kp >= 2) return { label: 'Condiciones geomagnéticas tranquilas a moderadas', tone: 'text-emerald-300' };
  return { label: 'Campo geomagnético tranquilo', tone: 'text-emerald-300' };
}
function bandGuidance(flux: number | null, kp: number) {
  const high = flux !== null && flux >= 120 && kp < 5;
  const low = flux !== null && flux < 85;
  if (kp >= 5) return 'Las tormentas pueden degradar la propagación HF; comprobá cada banda en tiempo real.';
  if (high) return 'Flujo solar favorable: buenas posibilidades en 20, 17, 15 y 10 m durante el día, según la ionización local.';
  if (low) return 'Flujo solar bajo: priorizá 40 y 80 m de noche y 20 m según horario y actividad.';
  return 'Panorama moderado: 40 m por la noche y 20/17 m durante el día son puntos de partida; verificá con balizas y actividad real.';
}

export const PropagationForecast: React.FC = () => {
  const [kpRows, setKpRows] = useState<KpRow[]>([]);
  const [fluxRows, setFluxRows] = useState<FluxRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [grid, setGrid] = useState(() => localStorage.getItem('user_grid') || '');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [kpResponse, fluxResponse] = await Promise.all([
        fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json', { cache: 'no-cache' }),
        fetch('https://services.swpc.noaa.gov/json/45-day-forecast.json', { cache: 'no-cache' }),
      ]);
      if (!kpResponse.ok || !fluxResponse.ok) throw new Error('NOAA no respondió correctamente');
      const kpData = await kpResponse.json();
      const fluxData = await fluxResponse.json();
      if (!Array.isArray(kpData) || !Array.isArray(fluxData?.data)) throw new Error('Formato de datos inesperado');
      setKpRows(kpData);
      setFluxRows(fluxData.data);
      setUpdatedAt(new Date());
    } catch {
      setError('No se pudieron actualizar los datos de NOAA. Comprobá la conexión e intentá de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { void load(); }, 30 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onProfileUpdate = () => setGrid(localStorage.getItem('user_grid') || '');
    window.addEventListener('user-profile-updated', onProfileUpdate);
    return () => window.removeEventListener('user-profile-updated', onProfileUpdate);
  }, []);

  const forecasts = useMemo<DayForecast[]>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const predictedRows = kpRows.filter((row) => row.time_tag && row.observed === 'predicted' && Number.isFinite(Number(row.kp)));
    const fluxByDate = new Map<string, number>();
    for (const row of fluxRows) {
      if (row.metric !== 'f107' || !row.time || !Number.isFinite(Number(row.value))) continue;
      const date = new Date(row.time);
      fluxByDate.set(date.toISOString().slice(0, 10), Number(row.value));
    }
    return [0, 1, 2].map((offset) => {
      const date = new Date(today);
      date.setDate(today.getDate() + offset);
      const key = date.toISOString().slice(0, 10);
      const periods = predictedRows.filter((row) => {
        const rowDate = new Date(String(row.time_tag));
        return rowDate.getFullYear() === date.getFullYear() && rowDate.getMonth() === date.getMonth() && rowDate.getDate() === date.getDate();
      });
      const values = periods.map((row) => Number(row.kp));
      return {
        date: key,
        maxKp: values.length ? Math.max(...values) : 0,
        meanKp: values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
        flux: fluxByDate.get(key) ?? null,
        periods: values.length,
        predicted: periods.length,
      };
    });
  }, [kpRows, fluxRows]);

  const validGrid = locatorLabel(grid);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'hora local del dispositivo';
  const hasForecast = forecasts.some((day) => day.periods > 0);

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-emerald-900/70 bg-slate-900/90">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-4 sm:px-5">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-300"><Activity className="h-5 w-5" /></div>
          <div>
            <h2 className="text-lg font-bold text-white">Pronóstico de propagación · 3 días</h2>
            <p className="text-xs text-slate-400">Índices reales de NOAA · actualización automática cada 30 minutos</p>
          </div>
        </div>
        <button type="button" onClick={() => { void load(); }} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Actualizar
        </button>
      </div>
      <div className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-slate-300">
          <MapPin className="h-4 w-4 text-emerald-300" />
          <span>Zona horaria local: <strong>{timezone}</strong></span>
          <span className="text-slate-600">·</span>
          <label className="flex items-center gap-2">Locator (opcional)
            <input value={grid} onChange={(e) => { const value = e.target.value.toUpperCase(); setGrid(value); localStorage.setItem('user_grid', value); }} placeholder="ej. GF05" maxLength={6} className="w-20 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 font-mono text-white outline-none focus:border-emerald-400" aria-label="Locator Maidenhead de la estación" />
          </label>
          {validGrid && <span className="text-emerald-300">Estación {validGrid}</span>}
        </div>
        {loading && !kpRows.length ? <p className="py-8 text-center text-sm text-slate-300">Consultando fuentes oficiales de NOAA…</p> : null}
        {error && <p role="alert" className="mb-4 rounded-lg border border-amber-700/60 bg-amber-950/30 p-3 text-sm text-amber-200">{error}</p>}
        {!loading && !hasForecast && !error && <p className="py-5 text-sm text-slate-300">La fuente todavía no publicó todos los períodos previstos. Volvé a actualizar más tarde.</p>}
        {hasForecast && <div className="grid gap-3 md:grid-cols-3">
          {forecasts.map((day, index) => {
            const kp = describeKp(day.maxKp);
            return <article key={day.date} className="rounded-xl border border-slate-800 bg-slate-950/70 p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="font-bold text-white">{index === 0 ? 'Hoy' : index === 1 ? 'Mañana' : 'Pasado mañana'}</h3>
                <span className="text-xs text-slate-400">{new Date(day.date + 'T12:00:00').toLocaleDateString(undefined, { day: '2-digit', month: 'short' })}</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-lg bg-slate-900 p-3"><div className="text-[11px] text-slate-400">Kp máximo previsto</div><div className="text-2xl font-bold text-white">{day.periods ? day.maxKp.toFixed(1) : '—'}</div></div>
                <div className="rounded-lg bg-slate-900 p-3"><div className="text-[11px] text-slate-400">Flujo solar F10.7</div><div className="text-2xl font-bold text-white">{day.flux ?? '—'}<span className="ml-1 text-xs font-normal text-slate-400">sfu</span></div></div>
              </div>
              <p className={`mt-3 text-sm font-semibold ${kp.tone}`}>{day.periods ? kp.label : 'Pronóstico Kp no disponible'}</p>
              <p className="mt-2 text-xs leading-relaxed text-slate-300">{day.periods ? bandGuidance(day.flux, day.maxKp) : 'Esperando los datos de pronóstico de NOAA para esta fecha.'}</p>
            </article>;
          })}
        </div>}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-800 pt-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><Sun className="h-3.5 w-3.5" /> Predicción orientativa, no garantiza contactos. La propagación también depende de ruta, hora, banda, antenas y ruido local.</span>
          <a href="https://www.swpc.noaa.gov/products/3-day-geomagnetic-forecast" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-300 hover:text-emerald-200">Fuente oficial NOAA <ExternalLink className="h-3 w-3" /></a>
        </div>
        {updatedAt && <p className="mt-2 text-[10px] text-slate-600">Consulta realizada: {updatedAt.toLocaleString()} · La consulta usa fuentes públicas; no se envía el locator ni el indicativo a NOAA.</p>}
      </div>
    </section>
  );
};
