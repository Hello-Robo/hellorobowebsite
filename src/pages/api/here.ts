/**
 * /api/here — where the visitor is and the weather there, for the home hero robot's visor
 * (src/scripts/hero-scene.ts runs it across his display).
 *
 * The place comes from Vercel's own IP geolocation headers (city level), so the visitor's IP
 * never leaves Vercel. Only the city's rounded coordinates go to Open-Meteo (free, no key) for
 * the current weather. Locally, and wherever the headers are missing, it answers without a
 * place; the visor then shows a fallback line.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

/** Open-Meteo / WMO weather codes, in words */
const WEATHER: Record<number, string> = {
  0: 'Clear sky',
  1: 'Mostly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm, hail',
  99: 'Thunderstorm, hail',
};
/** Countries that read Fahrenheit */
const FAHRENHEIT = new Set(['US', 'LR', 'MM', 'BS', 'BZ', 'KY', 'PW', 'FM', 'MH']);

export const GET: APIRoute = async ({ request }) => {
  const h = request.headers;
  const city = decodeURIComponent(h.get('x-vercel-ip-city') ?? '');
  const country = h.get('x-vercel-ip-country') ?? '';
  const lat = Number(h.get('x-vercel-ip-latitude'));
  const lon = Number(h.get('x-vercel-ip-longitude'));
  const body: Record<string, unknown> = { city, country };
  if (Number.isFinite(lat) && Number.isFinite(lon) && (lat || lon)) {
    const f = FAHRENHEIT.has(country);
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m` +
      (f ? '&temperature_unit=fahrenheit&wind_speed_unit=mph' : '');
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(2500) });
      const c = (await r.json())?.current;
      if (c) {
        body.temp = Math.round(c.temperature_2m);
        body.unit = f ? 'F' : 'C';
        body.weather = WEATHER[c.weather_code] ?? '';
        body.wind = Math.round(c.wind_speed_10m);
        body.windUnit = f ? 'mph' : 'km/h';
        body.humidity = Math.round(c.relative_humidity_2m);
      }
    } catch {
      // no weather: the place alone
    }
  }
  return new Response(JSON.stringify(body), {
    headers: {
      'content-type': 'application/json',
      // per visitor (it's their place), fresh for 10 minutes
      'cache-control': 'private, max-age=600',
    },
  });
};
