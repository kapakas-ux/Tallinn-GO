import { Arrival, Stop, Vehicle } from '../types';
import { CapacitorHttp, Capacitor } from '@capacitor/core';
import { getDistance, getBearing } from '../lib/geo';

const getApiBaseUrl = () => {
  // 1. Check for environment variable (set during build)
  const meta = import.meta as any;
  const envUrl = meta.env?.VITE_API_URL;
  
  if (envUrl && envUrl.trim() !== '' && !envUrl.includes('YOUR_COMPUTER_IP') && !envUrl.includes('10.0.2.2')) {
    console.log('Using API URL from VITE_API_URL:', envUrl);
    return envUrl;
  }
  
  // 2. Check if we are running in a native (Capacitor) environment
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const isNative = origin.includes('localhost') || origin.includes('capacitor://');
  
  if (isNative) {
    // Using the public Shared App URL. 
    // This avoids all local Windows Firewall and emulator networking issues.
    const sharedUrl = 'https://ais-pre-4xsfvezpxu44gxul2ipqsy-662742466451.europe-west2.run.app';
    console.log('Native environment detected, using Shared App URL:', sharedUrl);
    return sharedUrl;
  }
  
  // 3. Web environment (relative paths work fine)
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
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('#')) continue;
        
        const parts = line.split(delim).map(p => p.trim().replace(/"/g, ''));
        
        const routeNum = parts[fld['ROUTENUM']];
        if (routeNum && routeNum !== '-') {
          currentRouteNum = routeNum;
        }
        
        const routeName = parts[fld['ROUTENAME']];
        if (currentRouteNum && routeName) {
          routesMap[currentRouteNum] = routeName;
          const normNum = currentRouteNum.replace(/^0+/, '');
          if (normNum && normNum !== currentRouteNum) routesMap[normNum] = routeName;
        }
        
        const routeStops = parts[fld['ROUTESTOPS']];
        if (routeStops) {
          const stops = routeStops.split(',').filter(Boolean);
          for (const stop of stops) {
            usedStopsSet.add(stop);
          }
          if (currentRouteNum && routeName) {
            if (!routeStopsMap[currentRouteNum]) {
              routeStopsMap[currentRouteNum] = [];
            }
            routeStopsMap[currentRouteNum].push({ name: routeName, stops });
            
            const normNum = currentRouteNum.replace(/^0+/, '');
            if (normNum && normNum !== currentRouteNum) {
              if (!routeStopsMap[normNum]) {
                routeStopsMap[normNum] = [];
              }
              routeStopsMap[normNum].push({ name: routeName, stops });
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

export async function fetchStops(): Promise<Stop[]> {
  if (stopsPromise) return stopsPromise;
  
  stopsPromise = (async () => {
    if (Object.keys(routesMap).length === 0) {
      await fetchRoutes();
    }
    
    try {
      console.log('Fetching stops from peatus.ee GraphQL API...');
      const response = await fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ stops { gtfsId name lat lon code routes { mode } } }' })
      });
      
      const data = await response.json();
      const rawStops = data.data.stops;
      
      console.log(`fetchStops: received ${rawStops.length} stops from peatus.ee`);
      
      const stops: Stop[] = [];
      
      for (const raw of rawStops) {
        const gtfsId = raw.gtfsId.replace('estonia:', '');
        const internalId = raw.code || gtfsId;
        const siriId = gtfsId !== '0' ? gtfsId : undefined;
        const name = raw.name;
        const lat = raw.lat;
        const lng = raw.lon;
        
        // Populate stopsMap for vehicle destination resolution
        const normId = internalId.replace(/^0+/, '');
        const baseId = internalId.split('-')[0];
        
        [internalId, normId, baseId].forEach(key => {
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
        
        const vehicleTypes: string[] = [...new Set(
          (raw.routes || []).map((r: any) => r.mode as string).filter(Boolean)
        )];

        if (vehicleTypes.length === 0) continue; // ghost stop — no active routes

        stops.push({
          id: internalId,
          siriId: siriId,
          name: name,
          lat: lat,
          lng: lng,
          vehicleTypes
        });
      }
      
      console.log(`Successfully parsed ${stops.length} stops from peatus.ee.`);
      return stops;
    } catch (error) {
      console.error('Error fetching/parsing stops from peatus.ee:', error);
      stopsPromise = null;
      return [];
    }
  })();
  
  return stopsPromise;
}

let cachedVehicles: Vehicle[] = [];
let lastVehiclesFetch = 0;

const TALLINN_BOUNDS = { latMin: 59.3, latMax: 59.6, lonMin: 24.4, lonMax: 24.95 };

// Only 'tallinn' exists on gis.ee — other city endpoints return 404
const GIS_EE_CITIES = ['tallinn'];


async function fetchGisEeCity(city: string): Promise<Vehicle[]> {
  const url = `https://gis.ee/${city}/gps.php?ver=${Date.now()}`;
  let data: any;
  if (Capacitor.isNativePlatform()) {
    // CapacitorHttp with browser-like headers so gis.ee returns full dataset including county buses
    const resp = await CapacitorHttp.get({
      url,
      headers: {
        'Referer': `https://gis.ee/${city}/`,
        'Accept': 'application/json, */*',
        'Cache-Control': 'no-cache'
      },
      connectTimeout: 20000,
      readTimeout: 20000
    });
    if (resp.status >= 400) throw new Error(`gis.ee/${city} error: ${resp.status}`);
    data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data;
  } else {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`gis.ee/${city} error: ${response.status}`);
    data = await response.json();
  }
  const vehicles: Vehicle[] = [];
  for (const feature of (data?.features || [])) {
    const props = feature.properties;
    const coords = feature.geometry?.coordinates;
    if (!coords || coords.length < 2) continue;
    let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
    if (props.type === 1) type = 'trolley';
    else if (props.type === 3) type = 'tram';
    else if (props.type === 7) type = 'bus';
    else if (props.type === 10) type = 'train';
    const jitter = (Math.random() - 0.5) * 0.000001;
    vehicles.push({
      id: `gis_${city}_${props.id}`,
      type,
      line: props.line?.toString() || '',
      lng: coords[0] + jitter,
      lat: coords[1] + jitter,
      bearing: props.direction || 0,
      speed: 0,
      destination: props.destination || ''
    });
  }
  const byType: Record<number, number> = {};
  for (const f of (data?.features || [])) {
    const t = f.properties?.type ?? -1;
    byType[t] = (byType[t] || 0) + 1;
  }
  console.log(`gis.ee/${city}: ${vehicles.length} vehicles`);
  return vehicles;
}

async function fetchPeatusVehicles(): Promise<Vehicle[]> {
  const query = `{
    vehicles {
      id lat lon heading speed
      route { shortName mode }
      trip { tripHeadsign }
    }
  }`;
  const response = await fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  if (!response.ok) throw new Error(`peatus.ee vehicles error: ${response.status}`);
  const data = await response.json();
  const rawVehicles: any[] = data?.data?.vehicles || [];
  const vehicles: Vehicle[] = [];
  for (const raw of rawVehicles) {
    if (!raw.lat || !raw.lon) continue;
    const mode = (raw.route?.mode || '').toUpperCase();
    let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
    if (mode === 'TRAM') type = 'tram';
    else if (mode === 'RAIL' || mode === 'SUBWAY') type = 'train';
    else if (mode === 'TROLLEYBUS') type = 'trolley';
    else if (mode === 'BUS') {
      // City buses stay in known urban areas; everything else is a county bus
      const inTallinn = raw.lat >= TALLINN_BOUNDS.latMin && raw.lat <= TALLINN_BOUNDS.latMax &&
                        raw.lon >= TALLINN_BOUNDS.lonMin && raw.lon <= TALLINN_BOUNDS.lonMax;
      const inTartu = raw.lat >= 58.32 && raw.lat <= 58.45 && raw.lon >= 26.65 && raw.lon <= 26.82;
      if (!inTallinn && !inTartu) type = 'regional';
    }
    vehicles.push({
      id: `otp_${raw.id}`,
      type,
      line: raw.route?.shortName || '',
      lat: raw.lat,
      lng: raw.lon,
      bearing: raw.heading || 0,
      speed: raw.speed || 0,
      destination: raw.trip?.tripHeadsign || ''
    });
  }
  return vehicles;
}

export async function fetchVehicles(): Promise<Vehicle[]> {
  try {
    const now = Date.now();
    if (cachedVehicles.length > 0 && now - lastVehiclesFetch < 1000) {
      return cachedVehicles;
    }

    const TARTU_BOUNDS = { latMin: 58.32, latMax: 58.45, lonMin: 26.65, lonMax: 26.82 };
    const inTartu = (lat: number, lng: number) =>
      lat >= TARTU_BOUNDS.latMin && lat <= TARTU_BOUNDS.latMax &&
      lng >= TARTU_BOUNDS.lonMin && lng <= TARTU_BOUNDS.lonMax;

    // Fetch all gis.ee cities + peatus.ee all-Estonia + Tartu Ridango in parallel
    const cityPromises = GIS_EE_CITIES.map(city => fetchGisEeCity(city));
    const [estoniaResult, tartuResult, ...cityResults] = await Promise.allSettled([
      fetchPeatusVehicles(),
      fetchTartuVehicles(),
      ...cityPromises
    ]);

    const vehicles: Vehicle[] = [];
    const gisIds = new Set<string>();

    // Add Tartu Ridango vehicles first (most accurate for Tartu city buses)
    const tartuIds = new Set<string>();
    const hasTartuData = tartuResult.status === 'fulfilled' && tartuResult.value.length > 0;
    if (hasTartuData) {
      vehicles.push(...tartuResult.value);
      tartuResult.value.forEach(v => tartuIds.add(v.id));
      console.log(`fetchVehicles: ${tartuResult.value.length} from Tartu Ridango`);
    } else if (tartuResult.status === 'rejected') {
      console.warn('fetchVehicles: Tartu Ridango failed:', tartuResult.reason);
    }

    // Add gis.ee vehicles from all cities
    for (let i = 0; i < cityResults.length; i++) {
      const result = cityResults[i];
      const city = GIS_EE_CITIES[i];
      if (result.status === 'fulfilled') {
        vehicles.push(...result.value);
        result.value.forEach(v => gisIds.add(v.id));
        console.log(`fetchVehicles: ${result.value.length} from gis.ee/${city}`);
      } else {
        console.warn(`fetchVehicles: gis.ee/${city} failed:`, result.reason);
      }
    }

    // Add peatus.ee vehicles not already covered by gis.ee or Tartu Ridango
    if (estoniaResult.status === 'fulfilled') {
      const extra = estoniaResult.value.filter(v => {
        const inTallinn = v.lat >= TALLINN_BOUNDS.latMin && v.lat <= TALLINN_BOUNDS.latMax &&
                          v.lng >= TALLINN_BOUNDS.lonMin && v.lng <= TALLINN_BOUNDS.lonMax;
        // Skip Tallinn (covered by gis.ee) and Tartu if Ridango data is available
        if (inTallinn) return false;
        if (hasTartuData && inTartu(v.lat, v.lng)) return false;
        return true;
      });
      vehicles.push(...extra);
      console.log(`fetchVehicles: ${extra.length} extra from peatus.ee`);
    } else {
      console.warn('fetchVehicles: peatus.ee failed:', estoniaResult.reason);
    }


    if (vehicles.length > 0) {
      cachedVehicles = vehicles;
      lastVehiclesFetch = now;
    }
    return vehicles.length > 0 ? vehicles : cachedVehicles;
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return cachedVehicles;
  }
}

export async function getRouteStopsForArrival(arrival: Arrival): Promise<Stop[]> {
  if (Object.keys(routeStopsMap).length === 0) {
    await fetchRoutes();
  }
  const allStops = await fetchStops();
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
    const lastStop = allStops.find(s => s.id === lastStopId);
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
    const exactStop = allStops.find(s => s.id === id);
    if (exactStop) return exactStop;
    
    const baseId = id.split('-')[0];
    const baseStop = allStops.find(s => s.id.startsWith(baseId + '-'));
    if (baseStop) return baseStop;
    
    return { id, name: id, lat: 0, lng: 0 }; // Fallback
  }).filter(s => s.lat !== 0 && s.lng !== 0);
}

export async function getRouteStopsForVehicle(vehicle: Vehicle, expectedDestination?: string): Promise<Stop[]> {
  if (Object.keys(routeStopsMap).length === 0) {
    await fetchRoutes();
  }
  const allStops = await fetchStops();
  const routes = routeStopsMap[vehicle.line];
  if (!routes || routes.length === 0) return [];
  
  const vDest = (expectedDestination || vehicle.destination || '').toLowerCase();
  
  // Try to find the route that matches the destination
  let bestRoute = routes[0];
  
  // 0. Try to match by the last stop name (most reliable for direction)
  const lastStopMatch = routes.find(r => {
    if (r.stops.length === 0) return false;
    const lastStopId = r.stops[r.stops.length - 1];
    const lastStop = allStops.find(s => s.id === lastStopId);
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
    const exactStop = allStops.find(s => s.id === id);
    if (exactStop) return exactStop;
    
    const baseId = id.split('-')[0];
    const baseStop = allStops.find(s => s.id.startsWith(baseId + '-'));
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

export async function fetchDepartures(stopId: string, siriId?: string, time?: string): Promise<Arrival[]> {
  try {
    const targetId = siriId && siriId !== '0' ? siriId : stopId;
    const gtfsId = `estonia:${targetId}`;

    const numberOfDepartures = time === '0' ? 50 : 15;

    const query = `
      {
        stop(id: "${gtfsId}") {
          name
          stoptimesWithoutPatterns(numberOfDepartures: ${numberOfDepartures}) {
            scheduledDeparture
            realtimeDeparture
            realtime
            realtimeState
            headsign
            serviceDay
            trip {
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

    const response = await fetch('https://api.peatus.ee/routing/v1/routers/estonia/index/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });

    const data = await response.json();
    const stoptimes = data?.data?.stop?.stoptimesWithoutPatterns || [];

    const arrivals: Arrival[] = [];
    const nowSeconds = Math.floor(Date.now() / 1000);

    for (const st of stoptimes) {
      const modeStr = st.trip?.route?.mode?.toLowerCase() || 'bus';
      const agencyName = st.trip?.route?.agency?.name || '';
      let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
      
      if (modeStr.includes('tram')) type = 'tram';
      else if (modeStr.includes('trolley')) type = 'trolley';
      else if (modeStr.includes('rail') || modeStr.includes('train')) type = 'train';
      else if (modeStr.includes('bus')) {
        // Distinguish city buses from county buses
        if (agencyName && !agencyName.toLowerCase().includes('tallinna linnatranspordi')) {
          type = 'regional';
        }
      }

      const line = st.trip?.route?.shortName || '';
      const destination = st.headsign || '';

      // Calculate time — use ?? so realtimeDeparture=0 (midnight) isn't dropped
      const isRealTime = st.realtime === true;
      const departureTimeSeconds = st.serviceDay + (st.realtimeDeparture ?? st.scheduledDeparture);
      let minutes = Math.floor((departureTimeSeconds - nowSeconds) / 60);

      // Scheduled-only trips may be running late — give a 10-min grace period.
      // Real-time trips have accurate data so a 2-min grace is enough.
      const gracePeriod = isRealTime ? 2 : 10;
      if (minutes < -gracePeriod) continue;
      if (minutes < 0) minutes = 0;

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
        time: timeStr,
        status,
        info: isRealTime ? undefined : 'Scheduled'
      });
    }

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

    return arrivals.slice(0, time === '0' ? 50 : 10);
  } catch (error) {
    console.error('Error fetching departures from peatus.ee:', error);
    return [];
  }
}

/**
 * Fetches live vehicle positions from Tartu city bus API (Ridango).
 * Endpoint: https://wmb-public-api-tartu.eu-prod.ridango.cloud/tenant/7/v1/vehicle-positions
 */
async function fetchTartuVehicles(): Promise<Vehicle[]> {
  const url = 'https://wmb-public-api-tartu.eu-prod.ridango.cloud/tenant/7/v1/vehicle-positions';
  try {
    let data: any;
    if (Capacitor.isNativePlatform()) {
      const response = await CapacitorHttp.get({
        url,
        headers: {
          'Origin': 'https://www.tartulinnaliin.ee',
          'Referer': 'https://www.tartulinnaliin.ee/',
          'Accept': 'application/json',
        },
        connectTimeout: 10000,
        readTimeout: 10000,
      });
      if (response.status !== 200) return [];
      data = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    } else {
      return []; // CORS blocked in browser — only works on native
    }

    // Ridango returns array of vehicle position objects
    // Shape may vary; adapt to actual response structure
    const items: any[] = Array.isArray(data) ? data : (data.vehicles || data.data || data.features || []);
    const vehicles: Vehicle[] = [];

    for (const item of items) {
      // Support both flat and nested GeoJSON-style responses
      const props = item.properties || item;
      const coords = item.geometry?.coordinates;
      const lat = coords ? coords[1] : (props.latitude ?? props.lat);
      const lng = coords ? coords[0] : (props.longitude ?? props.lng);

      if (!lat || !lng) continue;

      const line = String(props.line_name || props.lineName || props.route_short_name || props.line || '');
      const bearing = Number(props.bearing || props.heading || props.direction || 0);
      const speed = Number(props.speed || 0);
      const destination = String(props.destination || props.trip_headsign || props.headsign || '');
      const vehicleId = String(props.vehicle_id || props.vehicleId || props.id || item.id || '');

      if (!line || !vehicleId) continue;

      vehicles.push({
        id: `tartu_${vehicleId}`,
        type: 'bus',
        line,
        lat: Number(lat),
        lng: Number(lng),
        bearing,
        speed,
        destination,
      });
    }

    console.log(`Tartu vehicles fetched: ${vehicles.length}`);
    return vehicles;
  } catch (err) {
    console.error('Error fetching Tartu vehicles:', err);
    return [];
  }
}

/**
 * Improves scheduled (non-realtime) arrival times using live vehicle positions.
 * For each unconfirmed arrival, finds a matching vehicle heading toward the stop
 * and replaces the scheduled ETA with a distance-based estimate.
 */
export function adjustArrivalsWithVehicles(
  arrivals: Arrival[],
  vehicles: Vehicle[],
  stop: Stop
): Arrival[] {
  return arrivals.map(arrival => {
    if (arrival.status !== 'expected') return arrival; // already has real-time data

    const matching = vehicles.filter(v => v.line === arrival.line);
    if (matching.length === 0) return arrival;

    let bestEta: number | null = null;

    for (const v of matching) {
      const distKm = getDistance(v.lat, v.lng, stop.lat, stop.lng);
      const distM = distKm * 1000;
      if (distM > 5000) continue; // ignore vehicles more than 5km away

      // Check vehicle is heading roughly toward the stop (within ±90°)
      const bearingToStop = getBearing(v.lat, v.lng, stop.lat, stop.lng);
      const diff = Math.abs(((v.bearing - bearingToStop) + 180) % 360 - 180);
      if (diff > 90) continue;

      // ETA: use reported speed or default 20 km/h city speed
      const speedMps = (v.speed && v.speed > 1) ? v.speed : (20000 / 3600);
      const etaMinutes = Math.round(distM / speedMps / 60);

      if (bestEta === null || etaMinutes < bestEta) bestEta = etaMinutes;
    }

    if (bestEta !== null && bestEta < arrival.minutes) {
      return { ...arrival, minutes: bestEta, status: 'on-time' as const };
    }

    return arrival;
  });
}
