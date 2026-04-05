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

export async function fetchStops(): Promise<Stop[]> {
  if (stopsPromise) return stopsPromise;
  
  stopsPromise = (async () => {
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
        
        let finalDesc = county;
        if (parentName && parentName !== name && parentName !== county) {
          finalDesc = finalDesc ? `${finalDesc}, ${parentName}` : parentName;
        }
        
        // If it's still empty and we are in Tallinn (based on coordinates), use Tallinn
        if (!finalDesc && lat > 59.35 && lat < 59.50 && lng > 24.55 && lng < 24.95) {
          finalDesc = 'Tallinn';
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
      
      stopsByIdMap = new Map();
      stopsByBaseIdMap = new Map();
      for (const stop of stops) {
        stopsByIdMap.set(stop.id, stop);
        const baseId = stop.id.split('-')[0];
        if (!stopsByBaseIdMap.has(baseId)) {
          stopsByBaseIdMap.set(baseId, stop);
        }
      }
      
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
      return [...cityVehicles, ...extraVehicles];
    }
  } catch (error) {
    console.warn('fetchVehicles: gis.ee extra vehicle fetch failed', error);
  }

  // If gis.ee failed or had no regional data, return city vehicles alone
  if (cityVehicles.length > 0) {
    return cityVehicles;
  }

  // Both sources failed — return fallback empty from gis.ee full parse
  console.warn('fetchVehicles: both sources returned no data');
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

export async function getRouteStopsForArrival(arrival: Arrival): Promise<Stop[]> {
  if (Object.keys(routeStopsMap).length === 0) {
    await fetchRoutes();
  }
  await fetchStops(); // Ensure stops are fetched and maps are populated
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
  if (Object.keys(routeStopsMap).length === 0) {
    await fetchRoutes();
  }
  await fetchStops(); // Ensure stops are fetched and maps are populated
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
  
  if (vehicleClosestIdx === -1 || targetIdx === -1 || vehicleClosestIdx >= targetIdx) {
    // Vehicle has already passed the stop, or can't resolve position — fall back to sched
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
  const finalEta = Math.max(0, Math.round(blendedEta));
  
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
        // Distinguish city buses from county buses
        if (agencyName && !agencyName.toLowerCase().includes('tallinna linnatranspordi')) {
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
        isRealtime: isRealTime
      });
    }

    return arrivals;
  } catch (error) {
    console.error('Error fetching peatus departures:', error);
    return [];
  }
}

export async function fetchDepartures(stopId: string, siriId?: string, time?: string): Promise<Arrival[]> {
  if (Object.keys(routesMap).length === 0) {
    await fetchRoutes();
  }
  
  try {
    const targetId = siriId && siriId !== '0' ? siriId : stopId;
    const url = `${API_BASE}/api/transport/departures?stopId=${stopId}&siriId=${targetId}${time ? `&time=${time}` : ''}`;
    
    let arrivals: Arrival[] = [];
    
    try {
      console.log(`fetchDepartures: Fetching from ${url}`);
      const text = await universalFetch(url);
      
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
      console.error('Error fetching SIRI departures:', e);
    }
    
    // Fetch regional/train departures from peatus.ee
    const peatusArrivals = await fetchPeatusDepartures(stopId, siriId, time, false);
    arrivals = [...arrivals, ...peatusArrivals];
    
    // If next departure is far away (> 15 mins) or we have very few departures,
    // try Peatus for ALL modes to catch night buses or early morning gaps.
    const nextDepartureMins = arrivals.length > 0 ? Math.min(...arrivals.map(a => a.minutes)) : Infinity;
    
    if (arrivals.length < 5 || nextDepartureMins > 15) {
      console.log(`fetchDepartures: SIRI data sparse (next: ${nextDepartureMins}m, count: ${arrivals.length}), fetching all modes from Peatus for ${stopId}`);
      const allPeatusArrivals = await fetchPeatusDepartures(stopId, siriId, time, true);
      
      // Merge allPeatusArrivals into arrivals, avoiding duplicates
      allPeatusArrivals.forEach(pa => {
        const isDuplicate = arrivals.some(a => 
          a.line === pa.line && 
          Math.abs(a.minutes - pa.minutes) < 3 &&
          (a.destination.toLowerCase().includes(pa.destination.toLowerCase()) || 
           pa.destination.toLowerCase().includes(a.destination.toLowerCase()))
        );
        
        if (!isDuplicate) {
          arrivals.push(pa);
        }
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

    // Compute ETA for all arrivals
    await fetchStops(); // Ensure stops and maps are loaded
    let targetStop = stopsByIdMap?.get(stopId);
    if (!targetStop && siriId) {
      // Fallback to searching by siriId if not found by id
      const allStops = await fetchStops();
      targetStop = allStops.find(s => s.siriId === siriId);
    }
    
    if (targetStop) {
      await Promise.all(arrivals.map(async (arrival) => {
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

    return arrivals.slice(0, time === '0' ? 50 : 10);
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
  numItineraries = 3
): Promise<PlanItinerary[]> {
  const query = `
    {
      plan(
        from: { lat: ${fromLat}, lon: ${fromLon} }
        to: { lat: ${toLat}, lon: ${toLon} }
        numItineraries: ${numItineraries}
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
          transfers
          legs {
            startTime
            endTime
            mode
            distance
            duration
            realTime
            from { name lat lon stopId }
            to   { name lat lon stopId }
            route { shortName }
            headsign
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
  const itineraries: PlanItinerary[] = (json?.data?.plan?.itineraries ?? []).map((it: any): PlanItinerary => ({
    duration: it.duration,
    startTime: it.startTime,
    endTime: it.endTime,
    walkTime: it.walkTime,
    walkDistance: it.walkDistance,
    transfers: it.transfers,
    legs: (it.legs ?? []).map((leg: any) => ({
      startTime: leg.startTime,
      endTime: leg.endTime,
      mode: leg.mode,
      distance: leg.distance,
      duration: leg.duration,
      realTime: leg.realTime ?? false,
      from: { name: leg.from?.name ?? '', lat: leg.from?.lat, lon: leg.from?.lon, stopId: leg.from?.stopId },
      to:   { name: leg.to?.name   ?? '', lat: leg.to?.lat,   lon: leg.to?.lon,   stopId: leg.to?.stopId   },
      routeShortName: leg.route?.shortName ?? undefined,
      headsign: leg.headsign ?? undefined,
      legGeometry: { points: leg.legGeometry?.points ?? '', length: leg.legGeometry?.length ?? 0 },
    })),
  }));

  return itineraries;
}
