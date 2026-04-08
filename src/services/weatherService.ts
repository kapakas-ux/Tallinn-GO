import { getDistance } from '../lib/geo';
import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

export interface WeatherData {
  temperature: number;
  phenomenon: string;
  windSpeed: number | null;
  humidity: number | null;
  stationName: string;
}

interface Station {
  name: string;
  lat: number;
  lon: number;
  temperature: number | null;
  phenomenon: string;
  windSpeed: number | null;
  humidity: number | null;
}

let cachedStations: Station[] = [];
let cacheTimestamp = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

async function fetchStations(): Promise<Station[]> {
  if (cachedStations.length > 0 && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedStations;
  }

  let text: string;
  const xmlUrl = 'https://www.ilmateenistus.ee/ilma_andmed/xml/observations.php';

  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({ url: xmlUrl, responseType: 'text' });
    text = typeof response.data === 'string' ? response.data : String(response.data);
  } else {
    const res = await fetch('/api/weather');
    text = await res.text();
  }

  const stations: Station[] = [];
  const stationBlocks = text.split('<station>').slice(1);

  for (const block of stationBlocks) {
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}>(.*?)</${tag}>`));
      return m ? m[1].trim() : '';
    };

    const lat = parseFloat(get('latitude'));
    const lon = parseFloat(get('longitude'));
    const temp = parseFloat(get('airtemperature'));

    // Skip stations without coordinates or temperature
    if (isNaN(lat) || isNaN(lon) || isNaN(temp)) continue;

    stations.push({
      name: get('name'),
      lat,
      lon,
      temperature: temp,
      phenomenon: get('phenomenon'),
      windSpeed: parseFloat(get('windspeed')) || null,
      humidity: parseFloat(get('relativehumidity')) || null,
    });
  }

  cachedStations = stations;
  cacheTimestamp = Date.now();
  return stations;
}

export async function getWeatherForLocation(lat: number, lon: number): Promise<WeatherData | null> {
  try {
    const stations = await fetchStations();
    if (stations.length === 0) return null;

    // Find nearest station
    let nearest = stations[0];
    let minDist = Infinity;

    for (const s of stations) {
      const d = getDistance(lat, lon, s.lat, s.lon);
      if (d < minDist) {
        minDist = d;
        nearest = s;
      }
    }

    if (nearest.temperature === null) return null;

    return {
      temperature: nearest.temperature,
      phenomenon: nearest.phenomenon,
      windSpeed: nearest.windSpeed,
      humidity: nearest.humidity,
      stationName: nearest.name,
    };
  } catch (e) {
    console.error('Weather fetch failed:', e);
    return null;
  }
}

/** Map weather phenomenon text to an emoji icon */
export function weatherIcon(phenomenon: string): string {
  const p = phenomenon.toLowerCase();
  if (!p) return '🌡️';
  if (p.includes('thunder')) return '⛈️';
  if (p.includes('heavy rain') || p.includes('torrential')) return '🌧️';
  if (p.includes('rain') || p.includes('shower')) return '🌦️';
  if (p.includes('sleet')) return '🌨️';
  if (p.includes('heavy snow') || p.includes('blowing snow') || p.includes('snowstorm')) return '❄️';
  if (p.includes('snow')) return '🌨️';
  if (p.includes('hail')) return '🌨️';
  if (p.includes('mist') || p.includes('fog') || p.includes('haze')) return '🌫️';
  if (p.includes('overcast') || p.includes('cloudy')) return '☁️';
  if (p.includes('cloud') || p.includes('partly')) return '⛅';
  if (p.includes('clear')) return '☀️';
  return '🌡️';
}
