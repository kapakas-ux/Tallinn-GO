import { Arrival, Stop, Vehicle } from '../types';
import { CapacitorHttp, Capacitor } from '@capacitor/core';
import { getDistance, getBearing } from '../lib/geo';
import { getRidangoVehicles, isRidangoConnected } from './ridangoWebSocket';
import { getTartuVehicles, isTartuConnected } from './tartuWebSocket';

const getApiBaseUrl = () => {
  // 1. Check for environment variable (set during build)
  const meta = import.meta as any;
  const envUrl = meta.env?.VITE_API_URL;
  
  if (envUrl && envUrl.trim() !== '' && !envUrl.includes('YOUR_COMPUTER_IP') && !envUrl.includes('10.0.2.2')) {
    console.log('Using API URL from VITE_API_URL:', envUrl);
    return envUrl;
  }
  
  // 2. Only use the shared URL for actual Capacitor native platforms (Android/iOS),
  //    NOT for localhost in a browser (which is the dev server).
  if (Capacitor.isNativePlatform()) {
    const sharedUrl = 'https://ais-pre-4xsfvezpxu44gxul2ipqsy-662742466451.europe-west2.run.app';
    console.log('Native platform detected, using Shared App URL:', sharedUrl);
    return sharedUrl;
  }
  
  // 3. Web environment (relative paths work fine — hits the local dev server)
  console.log('Web environment detected, using relative API paths');
  return '';
};

const API_BASE = getApiBaseUrl();

/**
 * Universal fetch that uses CapacitorHttp on native to bypass CORS
 */
async function universalFetch(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    console.log(`universalFetch (native) START: ${url}`);
    const options = {
      url,
      headers: { 
        'Accept': 'text/plain, */*',
        'Cache-Control': 'no-cache'
      },
      connectTimeout: 20000,
      readTimeout: 20000
    };
    try {
      const response = await CapacitorHttp.get(options);
      console.log(`universalFetch (native) RESPONSE: ${url} - Status: ${response.status}`);
      
      let dataStr = '';
      if (typeof response.data === 'string') {
        dataStr = response.data;
      } else if (response.data !== null && response.data !== undefined) {
        // If CapacitorHttp parsed it as JSON, convert it back to string if it's not what we wanted
        // or if it's an error object
        dataStr = JSON.stringify(response.data);
        console.log(`universalFetch (native) WARNING: Data was parsed as object, stringified length: ${dataStr.length}`);
      }
      
      console.log(`universalFetch (native) END: ${url} - Data length: ${dataStr.length}`);
      
      // Detect if we got an HTML response (likely a cookie wall or proxy page)
      if (dataStr.trim().toLowerCase().startsWith('<!doctype html') || dataStr.trim().toLowerCase().startsWith('<html')) {
        console.error(`universalFetch (native) ERROR: Received HTML instead of data for ${url}. This usually means a cookie wall or login page is blocking the API.`);
        throw new Error(`API blocked by HTML response (cookie wall). Please check your VITE_API_URL.`);
      }

      // Log a sample of the raw data to help debug parsing
      if (dataStr.length > 0) {
        console.log(`RAW DATA SAMPLE (${url.split('/').pop()}): ${dataStr.substring(0, 300).replace(/\n/g, '\\n')}`);
      } else {
        console.warn(`universalFetch (native) EMPTY DATA for ${url}`);
      }
      
      if (response.status >= 400) {
        throw new Error(`CapacitorHttp error: ${response.status} - ${dataStr.substring(0, 100)}`);
      }
      
      return dataStr;
    } catch (err) {
      console.error(`universalFetch (native) FAILED: ${url}`, err);
      throw err;
    }
  } else {
    console.log(`universalFetch (web) START: ${url}`);
    try {
      const response = await fetch(url);
      console.log(`universalFetch (web) END: ${url} - Status: ${response.status}`);
      if (!response.ok) {
        throw new Error(`Fetch error: ${response.status}`);
      }
      const text = await response.text();
      console.log(`RAW DATA SAMPLE (web): ${text.substring(0, 200)}`);
      return text;
    } catch (err) {
      console.error(`universalFetch (web) FAILED: ${url}`, err);
      throw err;
    }
  }
}

let stopsMap: { [key: string]: string } = {};
let routesMap: { [key: string]: string } = {};
export const routeStopsMap: { [key: string]: { name: string, stops: string[] }[] } = {};
let stopsPromise: Promise<Stop[]> | null = null;
let routesPromise: Promise<void> | null = null;
let stopsByIdMap: Map<string, Stop> | null = null;
let stopsByBaseIdMap: Map<string, Stop> | null = null;

const STOPS_CACHE_KEY = 'tallinngo_stops_v1';

function getCachedStops(): Stop[] | null {
  try {
    const raw = localStorage.getItem(STOPS_CACHE_KEY);
    if (!raw) return null;
    const { stops } = JSON.parse(raw);
    if (!Array.isArray(stops) || stops.length === 0) return null;
    return stops;
  } catch {
    return null;
  }
}

function cacheStops(stops: Stop[]): void {
  try {
    localStorage.setItem(STOPS_CACHE_KEY, JSON.stringify({ stops }));
  } catch (e) {
    console.warn('Failed to cache stops:', e);
  }
}

function populateStopLookups(stops: Stop[]): void {
  stopsByIdMap = new Map();
  stopsByBaseIdMap = new Map();
  for (const stop of stops) {
    stopsByIdMap.set(stop.id, stop);
    // Also index by gtfsId so pattern-stop lookups work for non-Tallinn stops
    if (stop.gtfsId && stop.gtfsId !== stop.id) {
      stopsByIdMap.set(stop.gtfsId, stop);
    }
    const baseId = stop.id.split('-')[0];
    if (!stopsByBaseIdMap.has(baseId)) {
      stopsByBaseIdMap.set(baseId, stop);
    }
    // Populate stopsMap for vehicle destination resolution
    const normId = stop.id.replace(/^0+/, '');
    const normBaseId = baseId.replace(/^0+/, '');
    [stop.id, normId, baseId, normBaseId].forEach(key => {
      if (key && !stopsMap[key]) stopsMap[key] = stop.name;
    });
    if (stop.siriId) {
      const normSiri = stop.siriId.replace(/^0+/, '');
      [stop.siriId, normSiri].forEach(key => {
        if (key && !stopsMap[key]) stopsMap[key] = stop.name;
      });
    }
  }
}

/**
 * Robust coordinate parser that handles both integers (multiplied) and floats
 */
function parseCoordinate(valStr: string, type: 'lat' | 'lng'): number {
  const val = parseFloat(valStr);
  if (isNaN(val) || val === 0) return 0;

  // Tallinn strict range: Lat ~59.4, Lng ~24.7
  const isLat = type === 'lat';
  const min = isLat ? 59.2 : 24.3;
  const max = isLat ? 59.6 : 24.9;

  // 1. Check if it's already a correct float
  if (val >= min && val <= max) return val;

  // 2. Check if it's multiplied by 100,000 (standard for Tallinn)
  const val100k = val / 100000;
  if (val100k >= min && val100k <= max) return val100k;

  // 3. Check if it's multiplied by 1,000,000 (also common)
  const val1M = val / 1000000;
  if (val1M >= min && val1M <= max) return val1M;

  return 0; // Invalid or out of range
}

export const usedStopsSet = new Set<string>();
export const stopModesMap: Record<string, Set<string>> = {};

export async function fetchRoutes(): Promise<void> {
  if (routesPromise) return routesPromise;
  
  routesPromise = (async () => {
    try {
      const url = Capacitor.isNativePlatform() 
        ? `https://transport.tallinn.ee/data/routes.txt?t=${Date.now()}`
        : `${API_BASE}/api/transport/routes`;
      const text = await universalFetch(url);
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      
      console.log(`fetchRoutes: found ${lines.length} lines`);
      
      if (lines.length === 0) return;
      
      let delim = ';';
      if (lines[0].includes(';')) delim = ';';
      else if (lines[0].includes(',')) delim = ',';
      else if (lines[0].includes('\t')) delim = '\t';
      
      const header = lines[0].split(delim).map(h => h.trim().toUpperCase());
      const fld: Record<string, number> = {};
      for (let i = 0; i < header.length; i++) {
        fld[header[i]] = i;
      }
      
      let currentRouteNum = '';
      let currentTransport = '';
      let currentRouteName = '';
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#')) continue;
        
        const parts = line.split(delim).map(p => p.trim().replace(/"/g, ''));
        
        const routeNum = parts[fld['ROUTENUM']];
        const transport = parts[fld['TRANSPORT']];
        const routeName = parts[fld['ROUTENAME']];
        
        if (routeNum && routeNum !== '-') {
          currentRouteNum = routeNum;
        }
        if (transport && transport !== '-') {
          currentTransport = transport;
        }
        if (routeName && routeName !== '-') {
          currentRouteName = routeName;
        }
        
        if (currentRouteNum && currentRouteName) {
          routesMap[currentRouteNum] = currentRouteName;
          const normNum = currentRouteNum.replace(/^0+/, '');
          if (normNum && normNum !== currentRouteNum) routesMap[normNum] = currentRouteName;
        }
        
        const routeStops = parts[fld['ROUTESTOPS']];
        if (routeStops) {
          const stops = routeStops.split(',').filter(Boolean);
          for (const stop of stops) {
            const normStop = stop.replace(/^0+/, '');
            usedStopsSet.add(stop);
            usedStopsSet.add(normStop);
            
            if (currentTransport) {
              let mode = currentTransport.toLowerCase();
              if (mode === 'nightbus') mode = 'bus';
              
              if (!stopModesMap[stop]) stopModesMap[stop] = new Set();
              if (!stopModesMap[normStop]) stopModesMap[normStop] = new Set();
              
              stopModesMap[stop].add(mode);
              stopModesMap[normStop].add(mode);
            }
          }
          if (currentRouteNum && currentRouteName) {
            if (!routeStopsMap[currentRouteNum]) {
              routeStopsMap[currentRouteNum] = [];
            }
            routeStopsMap[currentRouteNum].push({ name: currentRouteName, stops });
            
            const normNum = currentRouteNum.replace(/^0+/, '');
            if (normNum && normNum !== currentRouteNum) {
              if (!routeStopsMap[normNum]) {
                routeStopsMap[normNum] = [];
              }
              routeStopsMap[normNum].push({ name: currentRouteName, stops });
            }
          }
        }
      }
      console.log(`Successfully parsed ${Object.keys(routesMap).length} route mappings and ${usedStopsSet.size} used stops`);
    } catch (error) {
      console.error('Error fetching/parsing routes:', error);
      routesPromise = null;
    }
  })();
  
  return routesPromise;
}

// Estonian county centroids for nearest-county lookup when stop metadata is missing
const COUNTY_CENTROIDS: { name: string; lat: number; lng: number }[] = [
  { name: 'Tallinn', lat: 59.437, lng: 24.753 },
  { name: 'Tartu', lat: 58.378, lng: 26.729 },
  { name: 'Pärnu', lat: 58.385, lng: 24.510 },
  { name: 'Narva', lat: 59.379, lng: 28.179 },
  { name: 'Harjumaa', lat: 59.33, lng: 24.80 },
  { name: 'Ida-Virumaa', lat: 59.25, lng: 27.40 },
  { name: 'Lääne-Virumaa', lat: 59.10, lng: 26.20 },
  { name: 'Tartumaa', lat: 58.40, lng: 26.50 },
  { name: 'Pärnumaa', lat: 58.30, lng: 24.60 },
  { name: 'Järvamaa', lat: 58.88, lng: 25.55 },
  { name: 'Valgamaa', lat: 57.90, lng: 26.05 },
  { name: 'Põlvamaa', lat: 58.05, lng: 27.05 },
  { name: 'Võrumaa', lat: 57.84, lng: 27.00 },
  { name: 'Läänemaa', lat: 58.93, lng: 23.55 },
  { name: 'Hiiumaa', lat: 58.92, lng: 22.60 },
  { name: 'Saaremaa', lat: 58.42, lng: 22.50 },
  { name: 'Raplamaa', lat: 59.00, lng: 24.80 },
  { name: 'Viljandimaa', lat: 58.36, lng: 25.60 },
  { name: 'Jõgevamaa', lat: 58.75, lng: 26.40 },
];

function getCountyFromCoords(lat: number, lng: number): string {
  // First try specific city bounding boxes
  if (lat > 59.35 && lat < 59.50 && lng > 24.55 && lng < 24.95) return 'Tallinn';
  if (lat > 58.33 && lat < 58.42 && lng > 26.62 && lng < 26.80) return 'Tartu';
  if (lat > 58.35 && lat < 58.41 && lng > 24.44 && lng < 24.58) return 'Pärnu';
  if (lat > 59.34 && lat < 59.42 && lng > 28.10 && lng < 28.25) return 'Narva';
  
  // Island counties (explicit, before centroid check)
  if (lat > 57.9 && lat < 58.75 && lng > 21.5 && lng < 23.5) return 'Saaremaa'; // includes Muhu, Ruhnu
  if (lat > 58.75 && lat < 59.1 && lng > 21.8 && lng < 23.2) return 'Hiiumaa';
  
  // Then find nearest county centroid for mainland
  let best = '';
  let bestDist = Infinity;
  for (const c of COUNTY_CENTROIDS) {
    const dlat = lat - c.lat;
    const dlng = (lng - c.lng) * Math.cos(lat * Math.PI / 180); // adjust for latitude
    const d = dlat * dlat + dlng * dlng;
    if (d < bestDist) { bestDist = d; best = c.name; }
  }
  return best;
}

export async function fetchStops(): Promise<Stop[]> {
  if (stopsPromise) return stopsPromise;
  
  // Return cached stops instantly, refresh in background
  const cached = getCachedStops();
  if (cached) {
    console.log(`fetchStops: returning ${cached.length} cached stops instantly`);
    populateStopLookups(cached);
    stopsPromise = Promise.resolve(cached);
    // Background refresh: fetch fresh data and update cache for next launch
    fetchStopsFresh().then(fresh => {
      if (fresh.length > 0) {
        cacheStops(fresh);
        populateStopLookups(fresh);
        console.log(`fetchStops: background refresh cached ${fresh.length} stops`);
      }
    }).catch(e => console.warn('Background stops refresh failed:', e));
    return stopsPromise;
  }

  stopsPromise = fetchStopsFresh().then(stops => {
    if (stops.length > 0) cacheStops(stops);
    return stops;
  }).catch(error => {
    console.error('Error fetching stops:', error);
    stopsPromise = null;
    return [];
  });

  return stopsPromise;
}

async function fetchStopsFresh(): Promise<Stop[]> {
    if (Object.keys(routesMap).length === 0) {
      await fetchRoutes();
    }
    
    try {
      console.log('Fetching stops from peatus.ee GraphQL API...');
      const url = 'https://api.peatus.ee/routing/v1/routers/estonia/index/graphql';
      const query = '{ stops { gtfsId name lat lon code desc zoneId parentStation { name } routes { mode } } }';
      
      let text = '';
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.post({
          url,
          headers: { 'Content-Type': 'application/json' },
          data: { query }
        });
        text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        });
        text = await response.text();
      }
      
      const data = JSON.parse(text);
      const rawStops = data.data.stops;
      
      console.log(`fetchStops: received ${rawStops.length} stops from peatus.ee`);
      
      // Fetch Tallinn stops.txt to get correct SiriIDs
      const siriIdMap = new Map<string, string>();
      try {
        const url = Capacitor.isNativePlatform() 
          ? `https://transport.tallinn.ee/data/stops.txt?t=${Date.now()}`
          : `${API_BASE}/api/transport/stops`;
        const text = await universalFetch(url);
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length > 0) {
          let delim = ';';
          if (lines[0].includes(';')) delim = ';';
          else if (lines[0].includes(',')) delim = ',';
          
          const header = lines[0].split(delim).map(h => h.trim().toUpperCase());
          const idIdx = header.indexOf('ID');
          const siriIdx = header.indexOf('SIRIID');
          
          if (idIdx >= 0 && siriIdx >= 0) {
            for (let i = 1; i < lines.length; i++) {
              const parts = lines[i].split(delim).map(p => p.trim());
              const id = parts[idIdx];
              const siriId = parts[siriIdx];
              if (id && siriId) {
                siriIdMap.set(id, siriId);
                const normId = id.replace(/^0+/, '');
                if (normId && normId !== id) siriIdMap.set(normId, siriId);
              }
            }
          }
        }
      } catch (e) {
        console.error('Error fetching stops.txt for SiriIDs:', e);
      }
      
      const stops: Stop[] = [];
      
      for (const raw of rawStops) {
        const gtfsId = raw.gtfsId.replace('estonia:', '');
        const internalId = raw.code || gtfsId;
        
        // Use SiriID from stops.txt if available, otherwise fallback to gtfsId
        const siriId = siriIdMap.get(internalId) || siriIdMap.get(internalId.replace(/^0+/, '')) || (gtfsId !== '0' ? gtfsId : undefined);
        
        const name = raw.name;
        const lat = raw.lat;
        const lng = raw.lon;
        
        const zoneId = raw.zoneId || '';
        const parentName = raw.parentStation?.name || '';
        
        // Format zoneId to county name
        let county = '';
        if (zoneId) {
          const lower = zoneId.toLowerCase();
          if (lower.includes('harju')) county = 'Harjumaa';
          else if (lower.includes('tartu')) county = 'Tartumaa';
          else if (lower.includes('parnu') || lower.includes('pärnu')) county = 'Pärnumaa';
          else if (lower.includes('viru')) county = 'Virumaa';
          else if (lower.includes('viljandi')) county = 'Viljandimaa';
          else if (lower.includes('rapla')) county = 'Raplamaa';
          else if (lower.includes('saare')) county = 'Saaremaa';
          else if (lower.includes('jogeva') || lower.includes('jõgeva')) county = 'Jõgevamaa';
          else if (lower.includes('jarva') || lower.includes('järva')) county = 'Järvamaa';
          else if (lower.includes('valga')) county = 'Valgamaa';
          else if (lower.includes('polva') || lower.includes('põlva')) county = 'Põlvamaa';
          else if (lower.includes('laane') || lower.includes('lääne')) county = 'Läänemaa';
          else if (lower.includes('hiiu')) county = 'Hiiumaa';
          else if (lower.includes('voru') || lower.includes('võru')) county = 'Võrumaa';
          else if (isNaN(Number(zoneId))) county = zoneId.replace(/[0-9]/g, '').trim();
        }
        
        // Fallback: use raw.desc from peatus.ee if county is empty
        if (!county && raw.desc) {
          county = raw.desc;
        }
        
        // Fallback: estimate county from coordinates using nearest county centroid
        if (!county) {
          county = getCountyFromCoords(lat, lng);
        }
        
        let finalDesc = county;
        if (parentName && parentName !== name && parentName !== county) {
          finalDesc = finalDesc ? `${finalDesc}, ${parentName}` : parentName;
        }
        
        // Populate stopsMap for vehicle destination resolution
        const normId = internalId.replace(/^0+/, '');
        const baseId = internalId.split('-')[0];
        const normBaseId = baseId.replace(/^0+/, '');
        
        [internalId, normId, baseId, normBaseId].forEach(key => {
          if (key && !stopsMap[key]) {
            stopsMap[key] = name;
          }
        });
        
        if (siriId) {
          const normSiri = siriId.replace(/^0+/, '');
          [siriId, normSiri].forEach(key => {
            if (key && !stopsMap[key]) {
              stopsMap[key] = name;
            }
          });
        }
        
        // Hide ghost stops (those not used by any route)
        const hasPeatusRoutes = raw.routes && raw.routes.length > 0;
        const isUsedInTallinn = usedStopsSet.has(internalId) || usedStopsSet.has(normId) || usedStopsSet.has(baseId) || usedStopsSet.has(normBaseId);
        
        if (!hasPeatusRoutes && !isUsedInTallinn) {
          continue;
        }
        
        const modesSet = new Set<string>();
        
        // Add modes from peatus.ee
        if (raw.routes) {
          raw.routes.forEach((r: any) => {
            if (r.mode) {
              let m = r.mode.toLowerCase();
              if (m === 'trolleybus') m = 'trolley';
              if (m === 'rail') m = 'train';
              modesSet.add(m);
            }
          });
        }

        // Add modes from Tallinn routes (backup/override)
        [internalId, normId, baseId, normBaseId].forEach(key => {
          if (stopModesMap[key]) {
            stopModesMap[key].forEach(m => modesSet.add(m));
          }
        });
        
        const modes = Array.from(modesSet) as any[];
        
        stops.push({
          id: internalId,
          siriId: siriId,
          gtfsId: gtfsId,
          name: name,
          lat: lat,
          lng: lng,
          desc: finalDesc,
          modes: modes
        });
      }
      
      console.log(`Successfully parsed ${stops.length} stops from peatus.ee.`);
      
      populateStopLookups(stops);
      
      return stops;
    } catch (error) {
      console.error('Error fetching/parsing stops from peatus.ee:', error);
      return [];
    }
}

let cachedVehicles: Vehicle[] = [];
let lastVehiclesFetch = 0;
let vehiclesPromise: Promise<Vehicle[]> | null = null;

export async function fetchVehicles(): Promise<Vehicle[]> {
  const now = Date.now();
  
  // If we have cached vehicles, return them immediately to avoid blocking.
  // If they are older than 2000ms, trigger a background refresh.
  if (cachedVehicles.length > 0) {
    if (now - lastVehiclesFetch >= 10000) {
      // If cache is very stale (>10s), wait for the new fetch
      if (!vehiclesPromise) {
        vehiclesPromise = fetchVehiclesFromApi().then(vehicles => {
          cachedVehicles = vehicles;
          lastVehiclesFetch = Date.now();
          vehiclesPromise = null;
          return vehicles;
        }).catch(err => {
          console.error('Vehicle fetch failed:', err);
          vehiclesPromise = null;
          return cachedVehicles;
        });
      }
      return vehiclesPromise;
    } else if (now - lastVehiclesFetch >= 2000 && !vehiclesPromise) {
      // Trigger background refresh but return cached immediately
      vehiclesPromise = fetchVehiclesFromApi().then(vehicles => {
        cachedVehicles = vehicles;
        lastVehiclesFetch = Date.now();
        vehiclesPromise = null;
        return vehicles;
      }).catch(err => {
        console.error('Background vehicle fetch failed:', err);
        vehiclesPromise = null;
        return cachedVehicles;
      });
    }
    return cachedVehicles;
  }

  if (vehiclesPromise) {
    return vehiclesPromise;
  }

  vehiclesPromise = fetchVehiclesFromApi().then(vehicles => {
    cachedVehicles = vehicles;
    lastVehiclesFetch = Date.now();
    vehiclesPromise = null;
    return vehicles;
  }).catch(err => {
    console.error('Initial vehicle fetch failed:', err);
    vehiclesPromise = null;
    return cachedVehicles;
  });

  return vehiclesPromise;
}

async function fetchVehiclesFromApi(): Promise<Vehicle[]> {
  if (Object.keys(routesMap).length === 0) {
    await fetchRoutes();
  }

  const gpsUrl = Capacitor.isNativePlatform()
    ? 'https://transport.tallinn.ee/gps.txt'
    : `${API_BASE}/api/transport/gps`;

  // Primary source: Tallinn gps.txt (city buses + trams)
  let cityVehicles: Vehicle[] = [];
  try {
    const gpsText = await universalFetch(gpsUrl);
    cityVehicles = parseVehiclesFromGpsText(gpsText);
    console.log(`fetchVehicles: parsed ${cityVehicles.length} city vehicles from gps.txt`);
  } catch (error) {
    console.warn('fetchVehicles: gps.txt source failed', error);
  }

  // Secondary source: gis.ee GeoJSON — always fetch to get trains (type 10),
  // regional buses (type 20), and trolleybuses (type 1) that gps.txt doesn't include
  let gisVehicles: Vehicle[] = [];
  const vehiclesUrl = Capacitor.isNativePlatform()
    ? 'https://gis.ee/tallinn/gps.php'
    : `${API_BASE}/api/transport/vehicles`;

  try {
    const responseText = await universalFetch(vehiclesUrl);
    const data = JSON.parse(responseText);
    const features = data?.features || [];

    const extraVehicles: Vehicle[] = [];

    for (const feature of features) {
      const props = feature.properties;
      const coords = feature.geometry?.coordinates;

      if (!coords || coords.length < 2) continue;

      // Only pick up vehicle types not covered by gps.txt (type 2=bus, type 3=tram)
      if (props.type === 2 || props.type === 3) continue;

      let type: Vehicle['type'] = 'bus';
      if (props.type === 1) type = 'trolley';
      else if (props.type === 7) type = 'bus';     // nightbus
      else if (props.type === 10) type = 'train';
      else if (props.type === 20) type = 'regional';

      const line = props.line?.toString() || '';
      let destination = props.destination || '';

      if (!destination && line && routesMap[line]) {
        const routeName = routesMap[line];
        destination = routeName.includes(' - ') ? routeName.split(' - ')[1] : routeName;
      }

      extraVehicles.push({
        id: props.id?.toString() || `${props.type}-${line}-${coords[0]}-${coords[1]}`,
        type,
        line,
        lng: coords[0],
        lat: coords[1],
        bearing: props.direction || 0,
        speed: typeof props.speed === 'number' ? props.speed : 0,
        destination
      });
    }

    if (extraVehicles.length > 0) {
      console.log(`fetchVehicles: added ${extraVehicles.length} extra vehicles from gis.ee (trains, regional, trolley)`);
      gisVehicles = extraVehicles;
    }
  } catch (error) {
    console.warn('fetchVehicles: gis.ee extra vehicle fetch failed', error);
  }

  // Tertiary source: Ridango WebSocket (regional buses, trains, trolleybuses)
  // Preferred over gis.ee when connected — push-based, lower latency
  let wsVehicles: Vehicle[] = [];
  if (isRidangoConnected()) {
    const raw = getRidangoVehicles();
    console.log(`fetchVehicles: Ridango WS connected, got ${raw.length} raw vehicles`);
    for (const v of raw) {
      // Don't use routesMap fallback for WS vehicles — routesMap is for city transport
      // and would give wrong destinations. WS vehicles get headsigns from peatus.ee.
      // Skip vehicles already covered by gps.txt (same line, within 200m)
      const isDuplicate = cityVehicles.some(
        cv => cv.line === v.line && getDistance(cv.lat, cv.lng, v.lat, v.lng) < 200
      );
      if (!isDuplicate) wsVehicles.push(v);
    }
    if (wsVehicles.length > 0) {
      console.log(`fetchVehicles: added ${wsVehicles.length} vehicles from Ridango WS`);
    }
  }

  // Merge: gps.txt city + gis.ee (trains/trolley) + WS regional
  // WS vehicles dedup against both gps.txt and gis.ee by line + proximity
  const allExtra = [...gisVehicles];
  for (const v of wsVehicles) {
    const isDupOfGis = gisVehicles.some(
      gv => gv.line === v.line && getDistance(gv.lat, gv.lng, v.lat, v.lng) < 200
    );
    if (!isDupOfGis) allExtra.push(v);
  }

  // Tartu WS vehicles (separate city, no dedup needed against Tallinn sources)
  let tartuVehicles: Vehicle[] = [];
  if (isTartuConnected()) {
    tartuVehicles = getTartuVehicles();
    if (tartuVehicles.length > 0) {
      console.log(`fetchVehicles: added ${tartuVehicles.length} vehicles from Tartu WS`);
    }
  }

  const allVehicles = [...cityVehicles, ...allExtra, ...tartuVehicles];

  if (allVehicles.length > 0) {
    return allVehicles;
  }

  console.warn('fetchVehicles: all sources returned no data');
  return [];
}

function parseVehiclesFromGpsText(text: string): Vehicle[] {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);

  const vehicles: Vehicle[] = [];

  for (const line of lines) {
    const parts = line.split(',');
    if (parts.length < 10) continue;

    const typeNum = parseInt(parts[0], 10);
    const lineNum = (parts[1] || '').trim();
    const rawLng = parseFloat(parts[2]);
    const rawLat = parseFloat(parts[3]);
    const rawBearing = parseFloat(parts[5]);
    const vehicleId = (parts[6] || '').trim();
    const rawSpeed = parseFloat(parts[8]);
    const destination = (parts[9] || '').trim();

    if (!lineNum || !isFinite(rawLng) || !isFinite(rawLat)) continue;

    // gps.txt often stores WGS84 coords multiplied by 1,000,000.
    const lng = Math.abs(rawLng) > 180 ? rawLng / 1_000_000 : rawLng;
    const lat = Math.abs(rawLat) > 90 ? rawLat / 1_000_000 : rawLat;
    if (!isFinite(lng) || !isFinite(lat) || Math.abs(lng) > 180 || Math.abs(lat) > 90) continue;

    let type: Vehicle['type'] = 'bus';
    if (typeNum === 1) type = 'trolley';
    else if (typeNum === 2) type = 'bus';
    else if (typeNum === 3) type = 'tram';
    else if (typeNum === 7) type = 'bus';
    else if (typeNum === 10) type = 'train';
    else if (typeNum === 20) type = 'regional';

    let resolvedDestination = destination;
    if (!resolvedDestination && lineNum && routesMap[lineNum]) {
      const routeName = routesMap[lineNum];
      resolvedDestination = routeName.includes(' - ') ? routeName.split(' - ')[1] : routeName;
    }

    vehicles.push({
      id: vehicleId || `${typeNum}-${lineNum}-${lng.toFixed(6)}-${lat.toFixed(6)}`,
      type,
      line: lineNum,
      lng,
      lat,
      bearing: isFinite(rawBearing) ? rawBearing : 0,
      speed: isFinite(rawSpeed) ? rawSpeed : 0,
      destination: resolvedDestination
    });
  }

  return vehicles;
}

export interface TripStoptime {
  stopName: string;
  stopId: string;
  scheduledArrival: number;   // seconds from midnight
  scheduledDeparture: number; // seconds from midnight
  arrivalTime: string;        // "HH:MM"
  departureTime: string;      // "HH:MM"
}

/**
 * Fetch per-stop schedule times for a specific trip (by tripId from peatus.ee).
 * Returns an ordered list of stops with their scheduled arrival/departure times.
 */
export async function fetchTripStoptimes(tripId: string): Promise<TripStoptime[]> {
  if (!tripId) return [];

  const query = `{
    trip(id: "${tripId}") {
      stoptimes {
        stop { gtfsId name }
        scheduledArrival
        scheduledDeparture
      }
    }
  }`;

  try {
    const url = 'https://api.peatus.ee/routing/v1/routers/estonia/index/graphql';
    let text = '';

    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json' },
        data: { query }
      });
      text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } else {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      text = await response.text();
    }

    const data = JSON.parse(text);
    const stoptimes = data?.data?.trip?.stoptimes;
    if (!stoptimes || !Array.isArray(stoptimes)) return [];

    return stoptimes.map((st: any) => {
      const arrSec = st.scheduledArrival ?? 0;
      const depSec = st.scheduledDeparture ?? 0;
      const fmtTime = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      };
      return {
        stopName: st.stop?.name ?? '',
        stopId: (st.stop?.gtfsId ?? '').replace('estonia:', ''),
        scheduledArrival: arrSec,
        scheduledDeparture: depSec,
        arrivalTime: fmtTime(arrSec),
        departureTime: fmtTime(depSec),
      };
    });
  } catch (error) {
    console.error('Error fetching trip stoptimes:', error);
    return [];
  }
}

/**
 * Fetch scheduled stoptimes for a vehicle's current trip.
 * 1. Look up the OTP route by line name
 * 2. Match the pattern by destination/headsign
 * 3. Return pattern stops (with optional trip stoptimes for scheduled times)
 */
const tripStoptimesCache = new Map<string, { data: TripStoptime[]; ts: number }>();
const STOPTIMES_CACHE_TTL = 120_000; // 2 minutes

export async function fetchVehicleTripStoptimes(vehicle: Vehicle): Promise<TripStoptime[]> {
  const cacheKey = `${vehicle.line}::${(vehicle.destination || '').toLowerCase()}`;
  const cached = tripStoptimesCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < STOPTIMES_CACHE_TTL) {
    return cached.data;
  }

  // Query routes with pattern stops included (no trip stoptimes — too much data)
  const routeQuery = `{
    routes(name: "${vehicle.line}") {
      gtfsId
      shortName
      patterns {
        directionId
        headsign
        stops { gtfsId name lat lon }
        trips { gtfsId }
      }
    }
  }`;

  try {
    const url = 'https://api.peatus.ee/routing/v1/routers/estonia/index/graphql';

    const fetchGql = async (q: string) => {
      let text = '';
      if (Capacitor.isNativePlatform()) {
        const response = await CapacitorHttp.post({
          url,
          headers: { 'Content-Type': 'application/json' },
          data: { query: q }
        });
        text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q })
        });
        text = await response.text();
      }
      return JSON.parse(text);
    };

    const routeData = await fetchGql(routeQuery);
    const routes = routeData?.data?.routes;
    if (!routes || routes.length === 0) return [];

    // Find the route matching the line number, preferring routes whose headsigns match the destination
    const normLine = vehicle.line.replace(/^0+/, '');
    const vDest = (vehicle.destination || '').toLowerCase();
    const candidateRoutes = routes.filter((r: any) => (r.shortName || '').replace(/^0+/, '') === normLine);
    if (candidateRoutes.length === 0) return [];

    // Pick route whose headsign matches the destination
    let route = candidateRoutes[0];
    let matchedPattern: any = null;
    if (vDest) {
      for (const r of candidateRoutes) {
        const match = (r.patterns || []).find((p: any) => {
          const h = (p.headsign || '').toLowerCase();
          if (!h) return false; // skip null/empty headsigns
          return h.includes(vDest) || vDest.includes(h);
        });
        if (match) {
          route = r;
          matchedPattern = match;
          break;
        }
      }
    }
    // If no headsign match, prefer route based on vehicle source
    if (!matchedPattern) {
      const isTartu = vehicle.id.startsWith('tartu-');
      if (isTartu) {
        // Exclude Tallinn routes for Tartu vehicles
        const nonTallinn = candidateRoutes.find((r: any) => !r.gtfsId?.includes('tallinna-lin_'));
        if (nonTallinn) route = nonTallinn;
        else return []; // no suitable route
      } else {
        // Prefer Tallinn route; if none exists, return empty so routeStopsMap fallback can work
        const tallinnRoute = candidateRoutes.find((r: any) => r.gtfsId?.includes('tallinna-lin_'));
        if (tallinnRoute) route = tallinnRoute;
        else return [];
      }
    }
    if (!route?.gtfsId) return [];

    // Pick the best pattern: matched by headsign, or the one with most stops
    let pattern = matchedPattern;
    if (!pattern && route.patterns?.length > 0) {
      // Pick pattern with most stops as default
      pattern = route.patterns.reduce((best: any, p: any) =>
        (p.stops?.length || 0) > (best.stops?.length || 0) ? p : best
      , route.patterns[0]);
    }

    const stops = pattern?.stops;
    if (!stops || stops.length === 0) return [];

    // If there are multiple patterns with same headsign, pick the one with most stops (full route vs shortened)
    if (matchedPattern && route.patterns) {
      const sameDir = route.patterns.filter((p: any) =>
        p.directionId === matchedPattern.directionId &&
        (p.headsign || '').toLowerCase() === (matchedPattern.headsign || '').toLowerCase()
      );
      if (sameDir.length > 1) {
        const longest = sameDir.reduce((best: any, p: any) =>
          (p.stops?.length || 0) > (best.stops?.length || 0) ? p : best
        , sameDir[0]);
        pattern = longest;
      }
    }

    const patternStops = pattern?.stops || stops;

    // Find the active trip by querying the stop nearest the vehicle's current position.
    // We include recently-departed trips (past 30 min) so a bus that just left its last stop
    // is still matched by its realtime departure at that stop.
    const tripIdsSet = new Set((pattern?.trips || []).map((t: any) => t.gtfsId).filter(Boolean));

    if (patternStops.length > 0 && tripIdsSet.size > 0) {
      // Find the pattern stop closest to the vehicle's GPS position
      let nearestStop: any = null;
      let nearestDist = Infinity;
      for (const s of patternStops) {
        if (typeof s.lat !== 'number' || typeof s.lon !== 'number') continue;
        const d = getDistance(vehicle.lat, vehicle.lng, s.lat, s.lon);
        if (d < nearestDist) {
          nearestDist = d;
          nearestStop = s;
        }
      }
      // Fallback to mid-stop if no coords available
      const queryStop = nearestStop || patternStops[Math.floor(patternStops.length / 2)];
      const queryStopId = queryStop?.gtfsId;

      if (queryStopId) {
        try {
          const nowEpoch = Math.floor(Date.now() / 1000);
          const startTime = nowEpoch - 1800; // include trips that departed up to 30 min ago
          // Query this stop's stoptimes and find the trip belonging to our pattern
          const stopQuery = `{
            stop(id: "${queryStopId}") {
              stoptimesWithoutPatterns(numberOfDepartures: 30, startTime: ${startTime}, timeRange: 7200) {
                trip { gtfsId }
                scheduledDeparture
                realtimeDeparture
                serviceDay
              }
            }
          }`;
          const stopData = await fetchGql(stopQuery);
          const stopTimes = stopData?.data?.stop?.stoptimesWithoutPatterns || [];

          // Find the departure at this stop (for a trip in our pattern) closest to now
          let bestTripId = '';
          let bestDiff = Infinity;

          for (const st of stopTimes) {
            const tid = st.trip?.gtfsId;
            if (!tid || !tripIdsSet.has(tid)) continue;

            const depEpoch = (st.serviceDay || 0) + (st.realtimeDeparture ?? st.scheduledDeparture ?? 0);
            const diff = Math.abs(depEpoch - nowEpoch);
            if (diff < bestDiff) {
              bestDiff = diff;
              bestTripId = tid;
            }
          }

          // Fetch the full stoptimes for the matched trip
          if (bestTripId) {
            const stoptimes = await fetchTripStoptimes(bestTripId);
            if (stoptimes.length > 0) {
              const result = stoptimes;
              tripStoptimesCache.set(cacheKey, { data: result, ts: Date.now() });
              return result;
            }
          }
        } catch {
          // fall through to tripIds fallback
        }
      }
    }

    // Fallback: if stop query didn't find a match, use the first trip ID
    const tripIds = [...tripIdsSet];
    if (tripIds.length > 0) {
      try {
        const stoptimes = await fetchTripStoptimes(tripIds[0]);
        if (stoptimes.length > 0) {
          tripStoptimesCache.set(cacheKey, { data: stoptimes, ts: Date.now() });
          return stoptimes;
        }
      } catch {
        // fall through
      }
    }

    // No trip stoptimes found — return pattern stops without scheduled times
    const result: TripStoptime[] = patternStops.map((s: any) => ({
      stopName: s.name ?? '',
      stopId: (s.gtfsId ?? '').replace('estonia:', ''),
      scheduledArrival: 0,
      scheduledDeparture: 0,
      arrivalTime: '',
      departureTime: '',
    }));
    tripStoptimesCache.set(cacheKey, { data: result, ts: Date.now() });
    return result;
  } catch (error) {
    console.error('Error fetching vehicle trip stoptimes:', error);
    return [];
  }
}

export async function getRouteStopsForArrival(arrival: Arrival): Promise<Stop[]> {
  await fetchStops(); // Ensure stops are fetched and maps are populated

  // Primary: try peatus.ee trip stoptimes if tripId is available (works for all cities)
  if (arrival.tripId) {
    try {
      const stoptimes = await fetchTripStoptimes(arrival.tripId);
      if (stoptimes.length > 0) {
        const stops = stoptimes.map(st => {
          const stop = stopsByIdMap?.get(st.stopId) || stopsByBaseIdMap?.get(st.stopId.split('-')[0]);
          return stop || { id: st.stopId, name: st.stopName, lat: 0, lng: 0 };
        }).filter(s => s.lat !== 0 && s.lng !== 0);
        if (stops.length > 0) return stops;
      }
    } catch {
      // fall through to routeStopsMap
    }
  }

  // Fallback: routeStopsMap from routes.txt (Tallinn city routes only)
  if (Object.keys(routeStopsMap).length === 0) {
    await fetchRoutes();
  }
  const normArrivalLine = arrival.line.replace(/^0+/, '');
  const routes = routeStopsMap[normArrivalLine];
  if (!routes || routes.length === 0) return [];
  
  const vDest = (arrival.destination || '').toLowerCase();
  
  // Try to find the route that matches the destination
  let bestRoute = routes[0];
  
  // 0. Try to match by the last stop name (most reliable for direction)
  const lastStopMatch = routes.find(r => {
    if (r.stops.length === 0) return false;
    const lastStopId = r.stops[r.stops.length - 1];
    const lastStop = stopsByIdMap?.get(lastStopId);
    if (!lastStop) return false;
    const sName = lastStop.name.toLowerCase();
    return sName.includes(vDest) || vDest.includes(sName);
  });

  if (lastStopMatch) {
    bestRoute = lastStopMatch;
  } else {
    // 1. Try to match by the end of the route name (e.g. "A - B" -> matches "B")
    const endsWithMatch = routes.find(r => {
      const rName = (r.name || '').toLowerCase();
      return rName.endsWith(vDest) || rName.endsWith(vDest + ' rand'); // handle some edge cases
    });
    
    if (endsWithMatch) {
      bestRoute = endsWithMatch;
    } else {
      // 2. Try exact match
      const exactMatch = routes.find(r => (r.name || '').toLowerCase() === vDest);
      if (exactMatch) {
        bestRoute = exactMatch;
      } else {
        // 3. Try partial match
        const partialMatch = routes.find(r => {
          const rName = (r.name || '').toLowerCase();
          return rName.includes(vDest) || vDest.includes(rName);
        });
        if (partialMatch) bestRoute = partialMatch;
      }
    }
  }
  
  // Map stop IDs to Stop objects
  return bestRoute.stops.map(id => {
    const exactStop = stopsByIdMap?.get(id);
    if (exactStop) return exactStop;
    
    const baseId = id.split('-')[0];
    const baseStop = stopsByBaseIdMap?.get(baseId);
    if (baseStop) return baseStop;
    
    return { id, name: id, lat: 0, lng: 0 }; // Fallback
  }).filter(s => s.lat !== 0 && s.lng !== 0);
}

export async function getRouteStopsForVehicle(vehicle: Vehicle, expectedDestination?: string): Promise<Stop[]> {
  await fetchStops(); // Ensure stops are fetched and maps are populated

  // Primary: use peatus.ee trip stoptimes — always direction-aware
  try {
    const stoptimes = await fetchVehicleTripStoptimes(vehicle);
    if (stoptimes.length > 0) {
      const stops = stoptimes.map(st => {
        const stop = stopsByIdMap?.get(st.stopId) || stopsByBaseIdMap?.get(st.stopId.split('-')[0]);
        return stop || { id: st.stopId, name: st.stopName, lat: 0, lng: 0 };
      }).filter(s => s.lat !== 0 && s.lng !== 0);
      if (stops.length > 0) return stops;
    }
  } catch {
    // fall through to routeStopsMap
  }

  // Fallback: routeStopsMap from routes.txt (not direction-aware, city routes only)
  if (Object.keys(routeStopsMap).length === 0) {
    await fetchRoutes();
  }
  const routes = routeStopsMap[vehicle.line];
  if (!routes || routes.length === 0) return [];
  
  const vDest = (expectedDestination || vehicle.destination || '').toLowerCase();
  
  // Try to find the route that matches the destination
  let bestRoute = routes[0];
  
  // 0. Try to match by the last stop name (most reliable for direction)
  const lastStopMatch = routes.find(r => {
    if (r.stops.length === 0) return false;
    const lastStopId = r.stops[r.stops.length - 1];
    const lastStop = stopsByIdMap?.get(lastStopId);
    if (!lastStop) return false;
    const sName = lastStop.name.toLowerCase();
    return sName.includes(vDest) || vDest.includes(sName);
  });

  if (lastStopMatch) {
    bestRoute = lastStopMatch;
  } else {
    // 1. Try to match by the end of the route name (e.g. "A - B" -> matches "B")
    const endsWithMatch = routes.find(r => {
      const rName = (r.name || '').toLowerCase();
      return rName.endsWith(vDest) || rName.endsWith(vDest + ' rand'); // handle some edge cases
    });
    
    if (endsWithMatch) {
      bestRoute = endsWithMatch;
    } else {
      // 2. Try exact match
      const exactMatch = routes.find(r => (r.name || '').toLowerCase() === vDest);
      if (exactMatch) {
        bestRoute = exactMatch;
      } else {
        // 3. Try partial match
        const partialMatch = routes.find(r => {
          const rName = (r.name || '').toLowerCase();
          return rName.includes(vDest) || vDest.includes(rName);
        });
        if (partialMatch) bestRoute = partialMatch;
      }
    }
  }
  
  // Map stop IDs to Stop objects
  return bestRoute.stops.map(id => {
    const exactStop = stopsByIdMap?.get(id);
    if (exactStop) return exactStop;
    
    const baseId = id.split('-')[0];
    const baseStop = stopsByBaseIdMap?.get(baseId);
    if (baseStop) return baseStop;
    
    return { id, name: id, lat: 0, lng: 0 }; // Fallback
  }).filter(s => s.lat !== 0 && s.lng !== 0);
}

export async function getVehicleForArrival(arrival: Arrival, stop?: Stop): Promise<Vehicle | null> {
  const vehicles = await fetchVehicles();
  const normArrivalLine = arrival.line.replace(/^0+/, '');
  console.log(`getVehicleForArrival: looking for line ${arrival.line} (norm: ${normArrivalLine}), type ${arrival.type}, dest ${arrival.destination}`);
  
  const matching = vehicles.filter(v => {
    const normVLine = v.line.replace(/^0+/, '');
    return normVLine === normArrivalLine && v.type === arrival.type;
  });
  
  console.log(`getVehicleForArrival: found ${matching.length} matching vehicles by line and type`);
  if (matching.length === 0) {
    const matchingLine = vehicles.filter(v => v.line.replace(/^0+/, '') === normArrivalLine);
    console.log(`getVehicleForArrival: found ${matchingLine.length} matching vehicles by line only. Types: ${matchingLine.map(v => v.type).join(', ')}`);
    return null;
  }
  
  const arrDest = (arrival.destination || '').toLowerCase();
  
  // Try to match by destination
  let destinationMatches = matching.filter(v => (v.destination || '').toLowerCase() === arrDest);
  
  // Try partial match if no exact match
  if (destinationMatches.length === 0) {
    destinationMatches = matching.filter(v => {
      const vDest = (v.destination || '').toLowerCase();
      return vDest.includes(arrDest) || arrDest.includes(vDest);
    });
  }
  
  // If still no match, just use all matching by line and type
  if (destinationMatches.length === 0) {
    // Try to exclude vehicles that clearly match the OTHER direction's route name
    const routes = routeStopsMap[normArrivalLine] || [];
    let wrongRouteName = '';
    
    const correctRoute = routes.find(r => {
      const rName = (r.name || '').toLowerCase();
      return rName.endsWith(arrDest) || rName.includes(arrDest) || arrDest.includes(rName);
    });
    
    if (correctRoute) {
      const wrongRoute = routes.find(r => r.name !== correctRoute.name);
      if (wrongRoute) {
        wrongRouteName = (wrongRoute.name || '').toLowerCase();
      }
    }
    
    if (wrongRouteName) {
      destinationMatches = matching.filter(v => {
        const vDest = (v.destination || '').toLowerCase();
        if (!vDest) return true; // keep if unknown
        
        const matchesWrong = vDest.includes(wrongRouteName) || wrongRouteName.includes(vDest);
        const matchesCorrect = correctRoute && (vDest.includes((correctRoute.name || '').toLowerCase()) || (correctRoute.name || '').toLowerCase().includes(vDest));
        
        if (matchesWrong && !matchesCorrect) return false;
        
        const wrongDestParts = wrongRouteName.split('-');
        const wrongEnd = wrongDestParts[wrongDestParts.length - 1]?.trim();
        if (wrongEnd && (vDest === wrongEnd || vDest.endsWith(wrongEnd))) {
           return false;
        }
        
        return true;
      });
    }
    
    if (destinationMatches.length === 0) {
      destinationMatches = matching;
    }
  }
  
  // If we have a stop, sort vehicles by distance to the stop
  if (stop) {
    const routeStops = await getRouteStopsForVehicle(destinationMatches[0], arrival.destination);
    
    // Try to find the target stop in the route
    let targetIndex = routeStops.findIndex(s => s.id === stop.id);
    if (targetIndex === -1) {
      // Try matching by base ID
      const baseStopId = stop.id.split('-')[0];
      targetIndex = routeStops.findIndex(s => s.id.split('-')[0] === baseStopId);
    }
    
    console.log(`getVehicleForArrival: line ${arrival.line} dest ${arrival.destination} stop ${stop.name} (${stop.id}) -> targetIndex ${targetIndex}/${routeStops.length}`);
    
    const vehicleStats = destinationMatches.map(v => {
      let minD = Infinity;
      let closestIdx = -1;
      
      if (routeStops.length > 0) {
        for (let i = 0; i < routeStops.length; i++) {
          const d = getDistance(v.lat, v.lng, routeStops[i].lat, routeStops[i].lng);
          if (d < minD) {
            minD = d;
            closestIdx = i;
          }
        }
      }
      
      let isWrongDirection = false;
      if (closestIdx >= 0 && v.bearing !== null) {
        let s1, s2;
        if (closestIdx < routeStops.length - 1) {
          s1 = routeStops[closestIdx];
          s2 = routeStops[closestIdx + 1];
        } else if (closestIdx > 0) {
          s1 = routeStops[closestIdx - 1];
          s2 = routeStops[closestIdx];
        }
        
        if (s1 && s2) {
          const routeBearing = getBearing(s1.lat, s1.lng, s2.lat, s2.lng);
          
          let diff = Math.abs(v.bearing - routeBearing);
          if (diff > 180) diff = 360 - diff;
          if (diff > 120) {
            isWrongDirection = true;
          }
        }
      }

      const distToTarget = getDistance(v.lat, v.lng, stop.lat, stop.lng);
      console.log(`  Vehicle ${v.id} at idx ${closestIdx}, dist ${distToTarget.toFixed(2)}km, wrongDir: ${isWrongDirection}`);
      return { vehicle: v, closestIdx, distToTarget, isWrongDirection };
    });
    
    // Filter out vehicles that have passed or are going the wrong way
    const filterApproaching = (stats: any[]) => stats.filter(vs => {
      if (vs.isWrongDirection) return false;
      
      if (targetIndex !== -1 && vs.closestIdx !== -1) {
        if (vs.closestIdx <= targetIndex) return true;
        // Allow if it just passed but is still very close (e.g. at the stop)
        if (vs.closestIdx === targetIndex + 1 && vs.distToTarget < 0.3) return true;
        return false;
      }
      
      return true; // If we can't determine position on route, keep it
    });

    let approaching = filterApproaching(vehicleStats);
    
    // If destination filtering resulted in no approaching vehicles, try with ALL matching vehicles
    if (approaching.length === 0 && destinationMatches.length < matching.length) {
      console.log(`getVehicleForArrival: no approaching vehicles found after destination filter, trying all matching vehicles`);
      
      const allVehicleStats = matching.map(v => {
        let minD = Infinity;
        let closestIdx = -1;
        
        if (routeStops.length > 0) {
          for (let i = 0; i < routeStops.length; i++) {
            const d = getDistance(v.lat, v.lng, routeStops[i].lat, routeStops[i].lng);
            if (d < minD) {
              minD = d;
              closestIdx = i;
            }
          }
        }
        
        let isWrongDirection = false;
        if (closestIdx >= 0 && v.bearing !== null) {
          let s1, s2;
          if (closestIdx < routeStops.length - 1) {
            s1 = routeStops[closestIdx];
            s2 = routeStops[closestIdx + 1];
          } else if (closestIdx > 0) {
            s1 = routeStops[closestIdx - 1];
            s2 = routeStops[closestIdx];
          }
          
          if (s1 && s2) {
            const routeBearing = getBearing(s1.lat, s1.lng, s2.lat, s2.lng);
            
            let diff = Math.abs(v.bearing - routeBearing);
            if (diff > 180) diff = 360 - diff;
            if (diff > 120) {
              isWrongDirection = true;
            }
          }
        }

        const distToTarget = getDistance(v.lat, v.lng, stop.lat, stop.lng);
        return { vehicle: v, closestIdx, distToTarget, isWrongDirection };
      });
      
      approaching = filterApproaching(allVehicleStats);
    }
    
    if (approaching.length === 0) {
      console.log(`getVehicleForArrival: no approaching vehicles found for line ${arrival.line} to ${arrival.destination}`);
      return null; // Don't show a wrong bus
    }
    
    approaching.sort((a, b) => {
      if (targetIndex !== -1 && a.closestIdx !== -1 && b.closestIdx !== -1 && a.closestIdx !== b.closestIdx) {
        return b.closestIdx - a.closestIdx; // Descending index (closer to target first)
      }
      return a.distToTarget - b.distToTarget; // Ascending distance
    });
    
    destinationMatches = approaching.map(vs => vs.vehicle);
  }
  
  // Use vehicleIndex to pick the correct vehicle if there are multiple arrivals for the same line/dest
  const index = arrival.vehicleIndex || 0;
  
  if (index < destinationMatches.length) {
    console.log(`getVehicleForArrival: returning vehicle at index ${index} out of ${destinationMatches.length} matches`);
    return destinationMatches[index];
  }
  
  console.log(`getVehicleForArrival: vehicleIndex ${index} is out of bounds, returning closest vehicle`);
  return destinationMatches[0];
}

/**
 * Computes an ETA (in minutes) from the vehicle's GPS position to a target stop.
 *
 * Strategy:
 * - GPS-path ETA: sum distances along route stops -> vehicle -> target, divide by speed
 * - API schedule ETA: the `arrival.minutes` already adjusted by realtime data
 * - Blend: weight towards GPS when vehicle is confirmed approaching, API when no GPS
 */
export async function computeEtaToStop(
  arrival: Arrival,
  stop: Stop
): Promise<{ etaMinutes: number; source: 'gps' | 'schedule' | 'blended' }> {
  const scheduleEta = arrival.minutes; // Fallback: peatus.ee realtime/scheduled minutes
  
  // 1. Try to find the matching vehicle on the map
  const vehicle = await getVehicleForArrival(arrival, stop);
  if (!vehicle) {
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  
  // 2. Get the ordered route stops for this vehicle
  const routeStops = await getRouteStopsForVehicle(vehicle, arrival.destination);
  if (routeStops.length === 0) {
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  
  // 3. Find the vehicle's closest stop index on the route
  let vehicleClosestIdx = -1;
  let minVehicleDist = Infinity;
  for (let i = 0; i < routeStops.length; i++) {
    const d = getDistance(vehicle.lat, vehicle.lng, routeStops[i].lat, routeStops[i].lng);
    if (d < minVehicleDist) {
      minVehicleDist = d;
      vehicleClosestIdx = i;
    }
  }
  
  // 4. Find the target stop index on the route
  let targetIdx = routeStops.findIndex(s => s.id === stop.id);
  if (targetIdx === -1) {
    const baseId = stop.id.split('-')[0];
    targetIdx = routeStops.findIndex(s => s.id.split('-')[0] === baseId);
  }
  
  if (vehicleClosestIdx === -1 || targetIdx === -1) {
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  
  if (vehicleClosestIdx > targetIdx) {
    // Vehicle has passed the target stop — fall back to schedule.
    // The schedule will naturally stop showing this departure once
    // the scheduled time passes, avoiding false "Now" at multiple stops.
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  
  if (vehicleClosestIdx === targetIdx) {
    // Vehicle is at the target stop — keep schedule ETA (bus is here or about to depart)
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }

  // 4b. If the vehicle is more than 500m from its closest route stop it is
  // almost certainly parked at a depot and not currently in service.
  // Fall back to schedule so we don't produce fake GPS ETAs at night.
  if (minVehicleDist > 0.5) {
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  
  // 5. Compute path distance: vehicle -> closest stop -> ... -> target stop
  // First leg: vehicle to its closest stop (partial segment)
  let totalDistKm = getDistance(vehicle.lat, vehicle.lng, routeStops[vehicleClosestIdx].lat, routeStops[vehicleClosestIdx].lng);
  
  // Middle legs: stop-to-stop along the route
  for (let i = vehicleClosestIdx; i < targetIdx; i++) {
    totalDistKm += getDistance(
      routeStops[i].lat, routeStops[i].lng,
      routeStops[i + 1].lat, routeStops[i + 1].lng
    );
  }
  
  // 6. Estimate speed
  // Use the vehicle's GPS speed if meaningful, else use type-based defaults
  const AVG_SPEED_KMH: Record<string, number> = {
    tram: 15,
    trolley: 20,
    bus: 22,
    regional: 45,
    train: 60,
  };
  
  const speedKmh = AVG_SPEED_KMH[vehicle.type] ?? 22;
  
  // 7. GPS-derived ETA
  const gpsEtaMinutes = (totalDistKm / speedKmh) * 60;

  // 8. Sanity check: if the GPS ETA differs wildly from the schedule ETA the
  // matched vehicle almost certainly belongs to a different trip (e.g. it just
  // finished its previous run and is near the route start, or is a wrong match).
  // Only trust GPS when it is within a reasonable band around the schedule.
  //
  // Special case: if the schedule says >=5 min but GPS says ~0, the bus is
  // probably still at/near a depot and hasn't started service yet. Fall back.
  // (Tallinn stops can be <1 min apart, so only distrust big discrepancies.)
  if (gpsEtaMinutes <= 1 && scheduleEta >= 5) {
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  const lowerBound = Math.max(0, scheduleEta - Math.max(5, scheduleEta * 0.5));
  const upperBound = scheduleEta + Math.max(5, scheduleEta * 0.5);
  if (gpsEtaMinutes < lowerBound || gpsEtaMinutes > upperBound) {
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }

  // 9. Blend: how many stops away is the vehicle?
  const stopsAway = targetIdx - vehicleClosestIdx;
  
  // Trust GPS more when vehicle is close (1-3 stops away),
  // blend equally when 4-6 stops, lean on schedule beyond that.
  let gpsWeight: number;
  if (stopsAway <= 2) {
    gpsWeight = 0.85;
  } else if (stopsAway <= 5) {
    gpsWeight = 0.60;
  } else {
    gpsWeight = 0.35;
  }
  
  const blendedEta = gpsWeight * gpsEtaMinutes + (1 - gpsWeight) * scheduleEta;
  const finalEta = Math.max(1, Math.round(blendedEta));
  
  const source = gpsWeight >= 0.75 ? 'gps' : 'blended';
  return { etaMinutes: finalEta, source };
}

async function fetchPeatusDepartures(stopId: string, siriId?: string, time?: string, allModes: boolean = false): Promise<Arrival[]> {
  try {
    const nowSeconds = Math.floor(Date.now() / 1000);
    
    // Find the stop to get its real gtfsId
    await fetchStops();
    let gtfsId = `estonia:${stopId}`;
    if (stopsByIdMap) {
      const stop = stopsByIdMap.get(stopId);
      if (stop && stop.gtfsId) {
        gtfsId = `estonia:${stop.gtfsId}`;
      }
    }

    const numberOfDepartures = time === '0' ? 50 : 15;

    const query = `
      {
        stop(id: "${gtfsId}") {
          name
          stoptimesWithoutPatterns(numberOfDepartures: ${numberOfDepartures}, startTime: ${nowSeconds - 180}) {
            scheduledDeparture
            realtimeDeparture
            realtime
            realtimeState
            headsign
            serviceDay
            trip {
              gtfsId
              route {
                shortName
                mode
                agency {
                  name
                }
              }
            }
          }
        }
      }
    `;

    console.log(`fetchPeatusDepartures: Fetching for ${gtfsId} (allModes: ${allModes})`);
    
    // Use universalFetch for Peatus API too, but we need to handle GraphQL POST
    // Actually, universalFetch currently only supports GET. 
    // Let's modify universalFetch to support options or just use a proxy for Peatus too.
    // For now, let's use a proxy endpoint if possible, or just keep fetch but wrap it.
    // Actually, CapacitorHttp supports POST.
    
    const url = 'https://api.peatus.ee/routing/v1/routers/estonia/index/graphql';
    let text = '';
    
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.post({
        url,
        headers: { 'Content-Type': 'application/json' },
        data: { query }
      });
      text = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    } else {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      text = await response.text();
    }

    const data = JSON.parse(text);
    const stoptimes = data?.data?.stop?.stoptimesWithoutPatterns || [];

    const arrivals: Arrival[] = [];

    for (const st of stoptimes) {
      const modeStr = st.trip?.route?.mode?.toLowerCase() || 'bus';
      const agencyName = st.trip?.route?.agency?.name || '';
      let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
      
      if (modeStr.includes('tram')) type = 'tram';
      else if (modeStr.includes('trolley')) type = 'trolley';
      else if (modeStr.includes('rail') || modeStr.includes('train')) type = 'train';
      else if (modeStr.includes('bus')) {
        // Distinguish city buses from county/regional buses
        const agency = agencyName.toLowerCase();
        const isCityBus = agency.includes('tallinna linnatransport') // Tallinn
          || agency.includes('gobus')                                // Tartu
          || agency.includes('sebe');                                // Pärnu
        if (agencyName && !isCityBus) {
          type = 'regional';
        }
      }

      // If not allModes, ONLY return regional and train from peatus.ee to avoid duplicates with SIRI
      if (!allModes && type !== 'regional' && type !== 'train') {
        continue;
      }

      const line = st.trip?.route?.shortName || '';
      const destination = st.headsign || '';

      // Calculate time
      const departureTimeSeconds = st.serviceDay + (st.realtimeDeparture || st.scheduledDeparture);
      const diffSeconds = departureTimeSeconds - nowSeconds;
      const isRealTime = st.realtime === true;
      
      // If it's marked as departed or canceled, skip
      if (st.realtimeState === 'DEPARTED' || st.realtimeState === 'CANCELED') continue;
      
      // If it's real-time, trust the DEPARTED state mostly, but drop if it's extremely stale (e.g., > 3 mins past)
      if (isRealTime && diffSeconds < -180) continue;
      
      // If it's scheduled (not real-time), drop if it's > 1 min past scheduled time
      if (!isRealTime && diffSeconds < -60) continue;
      
      // Clamp negative minutes to 0 so buses just departing show as "Now"
      let minutes = Math.max(0, Math.floor(diffSeconds / 60));
      
      const depDate = new Date(departureTimeSeconds * 1000);
      const hours = String(depDate.getHours()).padStart(2, '0');
      const mins = String(depDate.getMinutes()).padStart(2, '0');
      const timeStr = `${hours}:${mins}`;

      let status: 'on-time' | 'delayed' | 'expected' | 'departed' = 'expected';
      
      if (isRealTime) {
        if (st.realtimeState === 'UPDATED' && st.realtimeDeparture > st.scheduledDeparture + 60) {
          status = 'delayed';
        } else {
          status = 'on-time';
        }
      }

      arrivals.push({
        line,
        destination,
        type,
        minutes,
        departureTimeSeconds,
        time: timeStr,
        status,
        isRealtime: isRealTime,
        tripId: st.trip?.gtfsId || undefined
      });
    }

    return arrivals;
  } catch (error) {
    console.error('Error fetching peatus departures:', error);
    return [];
  }
}

const inflight = new Map<string, Promise<Arrival[]>>();

export async function fetchDepartures(stopId: string, siriId?: string, time?: string): Promise<Arrival[]> {
  const dedupeKey = `${stopId}:${siriId || ''}:${time || ''}`;
  const existing = inflight.get(dedupeKey);
  if (existing) return existing;

  const promise = _fetchDeparturesImpl(stopId, siriId, time);
  inflight.set(dedupeKey, promise);
  promise.finally(() => inflight.delete(dedupeKey));
  return promise;
}

async function _fetchDeparturesImpl(stopId: string, siriId?: string, time?: string): Promise<Arrival[]> {
  if (Object.keys(routesMap).length === 0) {
    await fetchRoutes();
  }
  
  try {
    const targetId = siriId && siriId !== '0' ? siriId : stopId;
    const url = `${API_BASE}/api/transport/departures?stopId=${stopId}&siriId=${targetId}${time ? `&time=${time}` : ''}`;
    
    // Run SIRI and peatus.ee fetches in parallel
    const [siriText, allPeatusArrivals] = await Promise.all([
      universalFetch(url).catch(e => { console.error('Error fetching SIRI departures:', e); return ''; }),
      fetchPeatusDepartures(stopId, siriId, time, true)
    ]);

    let arrivals: Arrival[] = [];
    
    try {
      console.log(`fetchDepartures: Fetching from ${url}`);
      const text = siriText;
      
      if (text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        if (lines.length > 2) {
          // Header is usually: Transport,RouteNum,ExpectedTimeInSeconds,ScheduleTimeInSeconds,ServerTime,version...
          const headerParts = lines[0].split(',');
          const serverTimeSeconds = parseInt(headerParts[4], 10);
          
          const getTallinnSecondsFromMidnight = () => {
            try {
              const now = new Date();
              const tallinnTime = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/Tallinn', hour12: false });
              const [h, m, s] = tallinnTime.split(':').map(Number);
              return h * 3600 + m * 60 + s;
            } catch (e) {
              return Math.floor(Date.now() / 1000) % 86400;
            }
          };

          const nowInTallinn = getTallinnSecondsFromMidnight();
          
          for (let i = 2; i < lines.length; i++) {
            const parts = lines[i].split(',');
            if (parts.length < 5) continue;
            
            const typeStr = parts[0].toLowerCase();
            let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
            if (typeStr === 'tram') type = 'tram';
            else if (typeStr === 'trolley') type = 'trolley';
            else if (typeStr === 'train' || typeStr === 'rail') type = 'train';
            else if (typeStr === 'regional') type = 'regional';
            
            const line = parts[1];
            const expectedTime = parseInt(parts[2], 10);
            const scheduledTime = parseInt(parts[3], 10);
            let destination = parts[4];
            
            // Fallback for missing destination
            if (!destination && line && routesMap[line]) {
              const routeName = routesMap[line];
              if (routeName.includes(' - ')) {
                destination = routeName.split(' - ')[1];
              } else {
                destination = routeName;
              }
            }
            
            if (isNaN(expectedTime) || isNaN(scheduledTime)) {
              console.warn(`fetchDepartures: Skipping line with invalid times: ${lines[i]}`);
              continue;
            }
            
            // Calculate minutes
            let diffSeconds = expectedTime - (isNaN(serverTimeSeconds) ? nowInTallinn : serverTimeSeconds);
            
            // Handle midnight wrap-around
            if (diffSeconds < -43200) diffSeconds += 86400;
            if (diffSeconds > 43200) diffSeconds -= 86400;
            
            // Skip departed
            if (diffSeconds < -60) continue;
            
            const minutes = Math.max(0, Math.floor(diffSeconds / 60));
            
            // Calculate time string
            const hours = Math.floor(expectedTime / 3600) % 24;
            const mins = Math.floor((expectedTime % 3600) / 60);
            const timeStr = `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
            
            const isRealTime = expectedTime !== scheduledTime;
            let status: 'on-time' | 'delayed' | 'expected' | 'departed' = 'expected';
            
            if (isRealTime) {
              if (expectedTime > scheduledTime + 60) {
                status = 'delayed';
              } else {
                status = 'on-time';
              }
            }
            
            const nowUnixSeconds = Math.floor(Date.now() / 1000);
            const departureTimeSeconds = nowUnixSeconds + diffSeconds;
            
            arrivals.push({
              line,
              destination,
              type,
              minutes,
              departureTimeSeconds,
              time: timeStr,
              status,
              isRealtime: isRealTime
            });
          }
        } else {
          console.log(`fetchDepartures: No departures found in response for ${targetId}`);
        }
      }
    } catch (e) {
      console.error('Error parsing SIRI departures:', e);
    }
    
    // Merge peatus arrivals: enrich matching SIRI arrivals with tripId, add non-duplicates
    allPeatusArrivals.forEach(pa => {
      const matchIndex = arrivals.findIndex(a => 
        a.line === pa.line && 
        Math.abs(a.minutes - pa.minutes) < 3 &&
        (a.destination.toLowerCase().includes(pa.destination.toLowerCase()) || 
         pa.destination.toLowerCase().includes(a.destination.toLowerCase()))
      );
      
      if (matchIndex !== -1) {
        // Enrich existing SIRI arrival with tripId
        if (!arrivals[matchIndex].tripId && pa.tripId) {
          arrivals[matchIndex].tripId = pa.tripId;
        }
      } else {
        arrivals.push(pa);
      }
    });
    
    // Sort by minutes ascending
    arrivals.sort((a, b) => a.minutes - b.minutes);

    // Assign vehicleIndex based on order of arrival for the same line and destination
    const counts: Record<string, number> = {};
    arrivals.forEach(a => {
      const key = `${a.type}-${a.line}-${a.destination}`;
      if (counts[key] === undefined) {
        counts[key] = 0;
      } else {
        counts[key]++;
      }
      a.vehicleIndex = counts[key];
    });

    // Compute ETA for first 5 arrivals only (rest keep schedule-based times)
    await fetchStops(); // Ensure stops and maps are loaded
    let targetStop = stopsByIdMap?.get(stopId);
    if (!targetStop && siriId) {
      // Fallback to searching by siriId if not found by id
      const allStops = await fetchStops();
      targetStop = allStops.find(s => s.siriId === siriId);
    }
    
    if (targetStop) {
      const etaBatch = arrivals.slice(0, 5);
      await Promise.all(etaBatch.map(async (arrival) => {
        const { etaMinutes, source } = await computeEtaToStop(arrival, targetStop);
        
        arrival.minutes = etaMinutes;
        
        // Update departureTimeSeconds to match the new GPS-based minutes
        const nowUnixSeconds = Math.floor(Date.now() / 1000);
        arrival.departureTimeSeconds = nowUnixSeconds + (etaMinutes * 60);
        
        if (source === 'gps') {
          arrival.info = 'Live GPS';
          arrival.isRealtime = true;
        } else if (source === 'blended') {
          arrival.info = 'GPS + Schedule';
          arrival.isRealtime = true;
        }
      }));
    }

    // Re-sort by updated minutes
    arrivals.sort((a, b) => a.minutes - b.minutes);

    // Deduplicate: after GPS ETA adjustment, multiple entries for the same
    // line + destination can collapse to the same ETA. Keep only the first
    // occurrence within a 2-minute window for each line+destination combo.
    const seen = new Map<string, number[]>(); // key -> list of kept departureTimeSeconds
    const deduped = arrivals.filter(a => {
      const key = `${a.line}-${a.destination}`;
      const kept = seen.get(key) || [];
      const depTime = a.departureTimeSeconds || 0;
      // Check if any already-kept entry is within 120s of this one
      if (kept.some(t => Math.abs(t - depTime) < 120)) {
        return false; // duplicate
      }
      kept.push(depTime);
      seen.set(key, kept);
      return true;
    });

    return deduped.slice(0, time === '0' ? 50 : 10);
  } catch (error) {
    console.error('Error fetching departures:', error);
    return [];
  }
}

// ─── JOURNEY PLANNER ─────────────────────────────────────────────────────────

import type { PlanItinerary } from '../types';

export async function planJourney(
  fromLat: number,
  fromLon: number,
  toLat: number,
  toLon: number,
  numItineraries = 3,
  options?: { date?: string; time?: string; arriveBy?: boolean }
): Promise<PlanItinerary[]> {
  const extraParams: string[] = [];
  if (options?.date) extraParams.push(`date: "${options.date}"`);
  if (options?.time) extraParams.push(`time: "${options.time}"`);
  if (options?.arriveBy !== undefined) extraParams.push(`arriveBy: ${options.arriveBy}`);
  const extraStr = extraParams.length ? '\n        ' + extraParams.join('\n        ') : '';

  const query = `
    {
      plan(
        from: { lat: ${fromLat}, lon: ${fromLon} }
        to: { lat: ${toLat}, lon: ${toLon} }
        numItineraries: ${numItineraries}${extraStr}
        transportModes: [
          { mode: WALK }
          { mode: BUS }
          { mode: TRAM }
          { mode: RAIL }
        ]
      ) {
        itineraries {
          duration
          startTime
          endTime
          walkTime
          walkDistance
          legs {
            startTime
            endTime
            mode
            distance
            duration
            realTime
            from { name lat lon }
            to   { name lat lon }
            route { shortName }
            legGeometry { points length }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });

  if (!res.ok) throw new Error(`planJourney HTTP ${res.status}`);

  const json = await res.json();
  const itineraries: PlanItinerary[] = (json?.data?.plan?.itineraries ?? []).map((it: any): PlanItinerary => {
    const legs = (it.legs ?? []).map((leg: any) => ({
      startTime: leg.startTime,
      endTime: leg.endTime,
      mode: leg.mode,
      distance: leg.distance,
      duration: leg.duration,
      realTime: leg.realTime ?? false,
      from: { name: leg.from?.name ?? '', lat: leg.from?.lat, lon: leg.from?.lon },
      to:   { name: leg.to?.name   ?? '', lat: leg.to?.lat,   lon: leg.to?.lon   },
      routeShortName: leg.route?.shortName ?? undefined,
      headsign: undefined,
      legGeometry: { points: leg.legGeometry?.points ?? '', length: leg.legGeometry?.length ?? 0 },
    }));
    const transitLegs = legs.filter((l: any) => l.mode !== 'WALK').length;
    return {
      duration: it.duration,
      startTime: it.startTime,
      endTime: it.endTime,
      walkTime: it.walkTime,
      walkDistance: it.walkDistance,
      transfers: Math.max(0, transitLegs - 1),
      legs,
    };
  });

  return itineraries;
}

/**
 * Fetch active service alerts from transport.tallinn.ee
 * (interruptions = real-time disruptions, announcements = planned route changes)
 */
export async function fetchServiceAlerts(): Promise<import('../types').ServiceAlert[]> {
  const transportModeMap: Record<string, string> = {
    'Buss': 'BUS', 'Tramm': 'TRAM', 'Troll': 'TROLLEYBUS'
  };

  // Parse Estonian date format "DD.MM.YYYY HH:mm" or "DD.MM.YYYY" to unix seconds
  function parseEstDate(s: string | null | undefined): number | undefined {
    if (!s) return undefined;
    const parts = s.split(' ');
    const [d, m, y] = parts[0].split('.');
    const timePart = parts[1] || '00:00';
    const [hh, mm] = timePart.split(':');
    const dt = new Date(+y, +m - 1, +d, +hh, +mm);
    return isNaN(dt.getTime()) ? undefined : Math.floor(dt.getTime() / 1000);
  }

  // Decode announcement route number to display number + transport
  function decodeAnnouncementRoute(num: number): { shortName: string; mode: string } {
    if (num >= 400) return { shortName: String(num % 400), mode: 'TROLLEYBUS' };
    if (num >= 300) return { shortName: String(num % 300), mode: 'TRAM' };
    if (num >= 200) return { shortName: (num % 200) + 'b', mode: 'BUS' };
    if (num >= 100) return { shortName: (num % 100) + 'a', mode: 'BUS' };
    return { shortName: String(num), mode: 'BUS' };
  }

  function stripHtml(html: string): string {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
  }

  try {
    const baseUrl = getApiBaseUrl();
    let data: { interruptions: any[]; announcements: any[] };

    if (Capacitor.isNativePlatform()) {
      // On native, fetch both JSON files directly
      const [intRes, annRes] = await Promise.all([
        CapacitorHttp.get({ url: 'https://transport.tallinn.ee/interruptions.json' }).catch(() => ({ data: [] })),
        CapacitorHttp.get({ url: 'https://transport.tallinn.ee/announcements.json' }).catch(() => ({ data: [] })),
      ]);
      data = {
        interruptions: Array.isArray(intRes.data) ? intRes.data : (typeof intRes.data === 'string' ? JSON.parse(intRes.data) : []),
        announcements: Array.isArray(annRes.data) ? annRes.data : (typeof annRes.data === 'string' ? JSON.parse(annRes.data) : []),
      };
    } else {
      // In browser, use server proxy to avoid CORS
      const res = await fetch(`${baseUrl}/api/transport/alerts`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    }

    const alerts: import('../types').ServiceAlert[] = [];
    const now = Math.floor(Date.now() / 1000);

    // Process interruptions (real-time disruptions like "väljumised hilinevad")
    for (const item of (data.interruptions || [])) {
      const transport = item.transport || '';
      const mode = transportModeMap[transport] || 'BUS';
      const routeNums = (item.routes || '').split(',').map((r: string) => r.trim()).filter(Boolean);

      alerts.push({
        id: `int-${item.start_time}-${item.routes}`,
        headerText: item.announcement || '',
        descriptionText: item.info ? stripHtml(item.info) : '',
        effectiveStartDate: parseEstDate(item.start_time),
        effectiveEndDate: parseEstDate(item.end_time),
        routes: routeNums.map((num: string) => ({ shortName: num, mode })),
        type: 'interruption',
      });
    }

    // Process announcements (planned route changes)
    for (const item of (data.announcements || [])) {
      // Filter by publication dates
      const pubStart = parseEstDate(item.publication_start_time);
      const pubEnd = parseEstDate(item.publication_end_time);
      if (pubStart && pubStart > now) continue;
      if (pubEnd && pubEnd < now) continue;

      const transport = item.transport || '';
      const routeNums = (item.routes || '').split(',').map((r: string) => r.trim()).filter(Boolean);
      const isMixed = transport.includes(','); // e.g. "Buss, Tramm"

      const routes = routeNums.map((numStr: string) => {
        const parsed = parseInt(numStr, 10);
        if (isMixed && !isNaN(parsed)) {
          return decodeAnnouncementRoute(parsed);
        }
        const mode = transportModeMap[transport] || 'BUS';
        return { shortName: numStr, mode };
      });

      alerts.push({
        id: `ann-${item.title}-${item.valid_start_time}`,
        headerText: item.title || '',
        descriptionText: item.info ? stripHtml(item.info) : '',
        effectiveStartDate: parseEstDate(item.valid_start_time),
        effectiveEndDate: parseEstDate(item.valid_end_time),
        routes,
        type: 'announcement',
      });
    }

    // Sort: interruptions first, then by start date descending
    alerts.sort((a, b) => {
      if (a.type === 'interruption' && b.type !== 'interruption') return -1;
      if (a.type !== 'interruption' && b.type === 'interruption') return 1;
      return (b.effectiveStartDate || 0) - (a.effectiveStartDate || 0);
    });

    return alerts;
  } catch (error) {
    console.error('Error fetching service alerts:', error);
    return [];
  }
}
