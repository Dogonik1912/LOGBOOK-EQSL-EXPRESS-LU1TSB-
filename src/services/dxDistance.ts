/**
 * Calcula distancia de gran círculo entre dos estaciones usando Maidenhead.
 * Si falta un locator, usa la capital del país como referencia.
 */
import { countryForCallsign } from './callsignCountry';

type Point = { lat: number; lon: number };

// Coordenadas aproximadas de capitales; usadas solo como respaldo cuando falta un locator.
const CAPITALS: Record<string, Point> = {
  'Argentina': {lat:-34.6037,lon:-58.3816}, 'España':{lat:40.4168,lon:-3.7038},
  'Brasil':{lat:-15.7939,lon:-47.8828}, 'Uruguay':{lat:-34.9011,lon:-56.1645},
  'Chile':{lat:-33.4489,lon:-70.6693}, 'Perú':{lat:-12.0464,lon:-77.0428},
  'Bolivia':{lat:-16.4897,lon:-68.1193}, 'Paraguay':{lat:-25.2637,lon:-57.5759},
  'Colombia':{lat:4.711,lon:-74.0721}, 'Venezuela':{lat:10.4806,lon:-66.9036},
  'Ecuador':{lat:-0.1807,lon:-78.4678}, 'México':{lat:19.4326,lon:-99.1332},
  'Estados Unidos':{lat:38.9072,lon:-77.0369}, 'Canadá':{lat:45.4215,lon:-75.6972},
  'Reino Unido':{lat:51.5072,lon:-0.1276}, 'Italia':{lat:41.9028,lon:12.4964},
  'Francia':{lat:48.8566,lon:2.3522}, 'Alemania':{lat:52.52,lon:13.405},
  'Bélgica':{lat:50.8503,lon:4.3517}, 'Portugal':{lat:38.7223,lon:-9.1393},
  'Japón':{lat:35.6762,lon:139.6503}, 'Australia':{lat:-35.2809,lon:149.1300},
  'Nueva Zelanda':{lat:-41.2866,lon:174.7756}, 'Noruega':{lat:59.9139,lon:10.7522},
  'Dinamarca':{lat:55.6761,lon:12.5683}, 'Grecia':{lat:37.9838,lon:23.7275},
  'Israel':{lat:31.7683,lon:35.2137}, 'China':{lat:39.9042,lon:116.4074},
  'India':{lat:28.6139,lon:77.209}, 'Filipinas':{lat:14.5995,lon:120.9842},
  'Tailandia':{lat:13.7563,lon:100.5018}, 'Cuba':{lat:23.1136,lon:-82.3666},
  'Panamá':{lat:8.9824,lon:-79.5199}, 'Costa Rica':{lat:9.9281,lon:-84.0907},
  'El Salvador':{lat:13.6929,lon:-89.2182}, 'Guatemala':{lat:14.6349,lon:-90.5069},
  'Honduras':{lat:14.0723,lon:-87.1921}, 'Nicaragua':{lat:12.115,lon:-86.2362},
  'Jamaica':{lat:17.9712,lon:-76.7936}, 'Hawái':{lat:21.3069,lon:-157.8583},
  'Escocia':{lat:55.9533,lon:-3.1883}, 'Islas Malvinas':{lat:-51.7963,lon:-59.5236},
  'Singapur':{lat:1.3521,lon:103.8198}, 'Fiyi':{lat:-18.1248,lon:178.4501},
  'Suiza':{lat:46.948,lon:7.4474}, 'Austria':{lat:48.2082,lon:16.3738},
  'Suecia':{lat:59.3293,lon:18.0686}, 'Polonia':{lat:52.2297,lon:21.0122},
  'Rusia':{lat:55.7558,lon:37.6173}, 'Croacia':{lat:45.815,lon:15.9819},
  'Rumania':{lat:44.4268,lon:26.1025}, 'Ucrania':{lat:50.4501,lon:30.5234}
};

export function maidenheadToPoint(locator: string): Point | null {
  const grid = String(locator || '').trim().toUpperCase();
  if (!/^[A-R]{2}[0-9]{2}([A-X]{2}([0-9]{2}([A-X]{2})?)?)?$/.test(grid)) return null;
  let lon = -180 + (grid.charCodeAt(0) - 65) * 20;
  let lat = -90 + (grid.charCodeAt(1) - 65) * 10;
  lon += Number(grid[2]) * 2;
  lat += Number(grid[3]);
  let width = 2, height = 1;
  if (grid.length >= 6) {
    lon += (grid.charCodeAt(4) - 65) * (width / 24);
    lat += (grid.charCodeAt(5) - 65) * (height / 24);
    width /= 24; height /= 24;
  }
  if (grid.length >= 8) {
    lon += Number(grid[6]) * (width / 10);
    lat += Number(grid[7]) * (height / 10);
    width /= 10; height /= 10;
  }
  if (grid.length >= 10) {
    lon += (grid.charCodeAt(8) - 65) * (width / 24);
    lat += (grid.charCodeAt(9) - 65) * (height / 24);
    width /= 24; height /= 24;
  }
  return { lat: lat + height / 2, lon: lon + width / 2 };
}

function pointFor(callsign: string, grid: string | null | undefined, country?: string | null): Point | null {
  const byGrid = maidenheadToPoint(grid || '');
  if (byGrid) return byGrid;
  const resolvedCountry = countryForCallsign(callsign, country || undefined);
  return CAPITALS[resolvedCountry] || null;
}

export function distanceForSpot(
  firstCall: string, firstGrid: string | null | undefined, firstCountry?: string | null,
  secondCall?: string, secondGrid?: string | null, secondCountry?: string | null,
  useMiles = false,
): string {
  if (!secondCall) return '—';
  const a = pointFor(firstCall, firstGrid, firstCountry);
  const b = pointFor(secondCall, secondGrid, secondCountry);
  if (!a || !b) return '—';
  const rad = (v: number) => v * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  const km = 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
  const value = useMiles ? km / 1.609344 : km;
  return `${Math.round(value).toLocaleString()} ${useMiles ? 'mi' : 'km'}`;
}

export function countryUsesMiles(country: string): boolean {
  return ['Estados Unidos', 'Reino Unido', 'Liberia', 'Myanmar'].includes(country);
}
