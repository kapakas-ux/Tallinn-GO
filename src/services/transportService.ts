import { Arrival, Stop, Vehicle } from '../types';
import { Capacitor } from '@capacitor/core';
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
 * Universal fetch that uses standard fetch.
 * The proxy server handles CORS, so we don't need CapacitorHttp anymore.
 * This vastly improves performance on Android for large files like routes.txt.
 */
async function universalFetch(url: string): Promise<string> {
  console.log(`universalFetch START: ${url}`);
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Fetch error: ${response.status}`);
    }
    const text = await response.text();
    return text;
  } catch (err) {
    console.error(`universalFetch FAILED: ${url}`, err);
    throw err;
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
      const url = `${API_BASE}/api/transport/parsed-routes`;
      const response = await fetch(url);
      const data = await response.json();
      
      routesMap = data.routesMap || {};
      
      // Update routeStopsMap
      for (const [key, value] of Object.entries(data.routeStopsMap || {})) {
        routeStopsMap[key] = value as any;
      }
      
      // Update usedStopsSet
      (data.usedStopsArray || []).forEach((stop: string) => usedStopsSet.add(stop));
      
      // Update stopModesMap
      for (const [key, value] of Object.entries(data.stopModesMap || {})) {
        stopModesMap[key] = new Set(value as string[]);
      }
      
      console.log(`Successfully loaded ${Object.keys(routesMap).length} route mappings and ${usedStopsSet.size} used stops from parsed-routes`);
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
      const url = `${API_BASE}/api/transport/peatus/stops`;
      
      const response = await fetch(url);
      const text = await response.text();
      
      const data = JSON.parse(text);
      const rawStops = data.data?.stops || data.stops;
      
      console.log(`fetchStops: received ${rawStops.length} stops from peatus.ee`);
      
      // Fetch Tallinn stops.txt to get correct SiriIDs
      const siriIdMap = new Map<string, string>();
      try {
        const url = `${API_BASE}/api/transport/stops`;
        const text = await universalFetch(url);
        const lines = text.split(/\r?\n/);
        if (lines.length > 0) {
          let delim = ';';
          if (lines[0].includes(';')) delim = ';';
          else if (lines[0].includes(',')) delim = ',';
          
          const header = lines[0].split(delim).map(h => h.trim().toUpperCase());
          const idIdx = header.indexOf('ID');
          const siriIdx = header.indexOf('SIRIID');
          
          if (idIdx >= 0 && siriIdx >= 0) {
            for (let i = 1; i < lines.length; i++) {
              const line = lines[i];
              if (!line || line.trim().length === 0) continue;
              const parts = line.split(delim);
              const id = parts[idIdx]?.trim();
              const siriId = parts[siriIdx]?.trim();
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
  
  const url = `${API_BASE}/api/transport/vehicles?t=${Date.now()}`;
    
  const responseText = await universalFetch(url);
  const data = JSON.parse(responseText);
  const features = data?.features || [];

  const vehicles: Vehicle[] = [];
  
  for (const feature of features) {
    const props = feature.properties;
    const coords = feature.geometry?.coordinates;
    
    if (!coords || coords.length < 2) continue;

    let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
    
    if (props.type === 1) type = 'trolley';
    else if (props.type === 2) type = 'bus';
    else if (props.type === 3) type = 'tram';
    else if (props.type === 7) type = 'bus'; // nightbus
    else if (props.type === 10) type = 'train';
    else if (props.type === 20) type = 'regional';

    const jitter = (Math.random() - 0.5) * 0.000001;
    
    const line = props.line?.toString() || '';
    let destination = props.destination || '';
    
    // Fallback for missing destination (common for night buses)
    if (!destination && line && routesMap[line]) {
      const routeName = routesMap[line];
      if (routeName.includes(' - ')) {
        destination = routeName.split(' - ')[1];
      } else {
        destination = routeName;
      }
    }
    
    vehicles.push({
      id: props.id?.toString() || Math.random().toString(),
      type,
      line,
      lng: coords[0] + jitter,
      lat: coords[1] + jitter,
      bearing: props.direction || 0,
      speed: 0,
      destination
    });
  }
  
  console.log(`fetchVehicles: parsed ${vehicles.length} vehicles successfully from gis.ee`);
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
  
  const arrDest = (arrival.destination || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
  
  // Try to match by destination
  let destinationMatches = matching.filter(v => {
    const vDest = (v.destination || '').toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    return vDest === arrDest || vDest.includes(arrDest) || arrDest.includes(vDest);
  });
  
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
      // If still no approaching vehicles, check if there are vehicles that JUST passed.
      // If there is a vehicle that passed, return it so computeEtaToStop can mark it as departed.
      const passed = vehicleStats.filter(vs => vs.closestIdx > targetIndex && !vs.isWrongDirection);
      if (passed.length > 0) {
        // Sort by how recently it passed (closest to targetIndex)
        passed.sort((a, b) => a.closestIdx - b.closestIdx);
        console.log(`getVehicleForArrival: returning passed vehicle for line ${arrival.line}`);
        return passed[0].vehicle;
      }
      
      console.log(`getVehicleForArrival: no approaching or recently passed vehicles found for line ${arrival.line} to ${arrival.destination}`);
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
  
  console.log(`getVehicleForArrival: vehicleIndex ${index} is out of bounds (only ${destinationMatches.length} matches). Returning null.`);
  return null;
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

  const distToTarget = getDistance(vehicle.lat, vehicle.lng, stop.lat, stop.lng);

  // 4b. If the vehicle has already passed the stop (by more than 50m), 
  // mark it as departed (-1) so it gets filtered out, preventing "Double Now".
  if (vehicleClosestIdx > targetIdx) {
    if (distToTarget > 0.05) {
      return { etaMinutes: -1, source: 'gps' };
    }
    return { etaMinutes: 0, source: 'gps' };
  }

  // 4c. If the vehicle is more than 500m from its closest route stop it is
  // almost certainly parked at a depot and not currently in service.
  // Fall back to schedule so we don't produce fake GPS ETAs at night.
  if (minVehicleDist > 0.5) {
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  
  // 5. Compute path distance: vehicle -> closest stop -> ... -> target stop
  let totalDistKm = 0;
  if (vehicleClosestIdx === targetIdx) {
    totalDistKm = distToTarget;
  } else {
    // First leg: vehicle to its closest stop (partial segment)
    totalDistKm = getDistance(vehicle.lat, vehicle.lng, routeStops[vehicleClosestIdx].lat, routeStops[vehicleClosestIdx].lng);
    
    // Middle legs: stop-to-stop along the route
    for (let i = vehicleClosestIdx; i < targetIdx; i++) {
      totalDistKm += getDistance(
        routeStops[i].lat, routeStops[i].lng,
        routeStops[i + 1].lat, routeStops[i + 1].lng
      );
    }
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
  
  // 9. Blend: how many stops away is the vehicle?
  const stopsAway = targetIdx - vehicleClosestIdx;

  // 7. GPS-derived ETA
  // Add 30 seconds of dwell time for each stop in between
  const dwellTimeMinutes = stopsAway * 0.5; // ~30 seconds per stop
  const gpsEtaMinutes = ((totalDistKm / speedKmh) * 60) + dwellTimeMinutes;

  // 8. Sanity check: if the GPS ETA differs wildly from the schedule ETA the
  // matched vehicle almost certainly belongs to a different trip.
  // However, buses can easily be 15-25 minutes late in traffic. We should trust GPS if we have a match.
  const lowerBound = Math.max(0, scheduleEta - 15);
  const upperBound = scheduleEta + 30; // Allow up to 30 mins delay
  
  if (gpsEtaMinutes < lowerBound || gpsEtaMinutes > upperBound) {
    console.log(`computeEtaToStop: GPS ETA ${gpsEtaMinutes.toFixed(1)}m out of bounds [${lowerBound.toFixed(1)}, ${upperBound.toFixed(1)}] for ${arrival.line} to ${arrival.destination}. Falling back to schedule ${scheduleEta}m.`);
    return { etaMinutes: scheduleEta, source: 'schedule' };
  }
  
  // Trust GPS heavily. The schedule is often wrong when there are delays.
  let gpsWeight: number;
  if (stopsAway <= 3) {
    gpsWeight = 0.95;
  } else if (stopsAway <= 8) {
    gpsWeight = 0.80;
  } else {
    gpsWeight = 0.65;
  }
  
  const blendedEta = gpsWeight * gpsEtaMinutes + (1 - gpsWeight) * scheduleEta;
  
  // 10. Final ETA calculation with "Now" protection
  let finalEta = Math.round(blendedEta);

  if (stopsAway >= 1) {
    // If the vehicle is at least 1 stop away, it CANNOT be "Now".
    // Each stop in between adds travel time + dwell time penalty.
    const travelTime = (totalDistKm / (speedKmh / 60));
    const dwellPenalty = stopsAway * 0.6; // 36s per stop
    const minMins = Math.max(1, Math.ceil(travelTime + dwellPenalty));
    finalEta = Math.max(minMins, finalEta);
  } else {
    // stopsAway === 0 (vehicle is closest to this stop)
    
    // Check if the vehicle is approaching or leaving the stop
    let isLeaving = false;
    if (targetIdx < routeStops.length - 1) {
      const nextStop = routeStops[targetIdx + 1];
      const distToNext = getDistance(vehicle.lat, vehicle.lng, nextStop.lat, nextStop.lng);
      const stopToNext = getDistance(stop.lat, stop.lng, nextStop.lat, nextStop.lng);
      // If vehicle is closer to next stop than the current stop is, it's leaving
      if (distToNext < stopToNext) {
        isLeaving = true;
      }
    }

    if (isLeaving) {
      // If leaving, only show "Now" if very close (< 50m)
      if (distToTarget > 0.05) {
        finalEta = Math.max(1, finalEta);
      } else {
        finalEta = 0;
      }
    } else {
      // If approaching, be more generous (180m)
      if (distToTarget > 0.18) {
        finalEta = Math.max(1, finalEta);
      } else {
        finalEta = 0;
      }
    }
  }
  
  console.log(`computeEtaToStop: ${arrival.line} to ${arrival.destination}: stopsAway=${stopsAway}, dist=${totalDistKm.toFixed(2)}km, gpsEta=${gpsEtaMinutes.toFixed(1)}m, schedEta=${scheduleEta}m, blended=${blendedEta.toFixed(1)}m -> final=${finalEta}m`);
  
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
    
    const url = `${API_BASE}/api/transport/peatus/graphql?t=${Date.now()}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    const text = await response.text();

    const data = JSON.parse(text);
    const stoptimes = data?.data?.stop?.stoptimesWithoutPatterns || data?.stop?.stoptimesWithoutPatterns || [];

    const arrivals: Arrival[] = [];

    for (const st of stoptimes) {
      const modeStr = st.trip?.route?.mode?.toLowerCase() || 'bus';
      const agencyName = st.trip?.route?.agency?.name || '';
      const line = st.trip?.route?.shortName || '';
      let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
      
      if (modeStr.includes('tram')) type = 'tram';
      else if (modeStr.includes('trolley')) type = 'trolley';
      else if (modeStr.includes('rail') || modeStr.includes('train')) type = 'train';
      else if (modeStr.includes('bus')) {
        // Distinguish city buses from county/regional buses
        const isCityAgency = agencyName.toLowerCase().includes('linnatransport') || 
                            agencyName.toLowerCase().includes('linnatranspordi');
        // City buses in Estonia typically have 1-2 digit line numbers
        const isShortLine = /^\d{1,2}[A-Z]?$/.test(line);
        
        if (agencyName && !isCityAgency && !isShortLine) {
          type = 'regional';
        }
      }

      // If not allModes, ONLY return regional and train from peatus.ee to avoid duplicates with SIRI
      if (!allModes && type !== 'regional' && type !== 'train') {
        continue;
      }

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
    const cacheBuster = `_t=${Date.now()}`;
    const url = `${API_BASE}/api/transport/departures?stopId=${stopId}&siriId=${targetId}${time ? `&time=${time}` : ''}&${cacheBuster}`;
    
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
            
            const line = parts[1];
            const typeStr = parts[0].toLowerCase();
            let type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' = 'bus';
            if (typeStr === 'tram') type = 'tram';
            else if (typeStr === 'trolley') type = 'trolley';
            else if (typeStr === 'train' || typeStr === 'rail') type = 'train';
            else if (typeStr === 'regional') {
              // Re-classify short line numbers as city buses
              const isShortLine = /^\d{1,2}[A-Z]?$/.test(line);
              type = isShortLine ? 'bus' : 'regional';
            }
            
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

    // Filter out departed vehicles (etaMinutes < 0)
    arrivals = arrivals.filter(a => a.minutes >= 0);

    // Re-sort by updated minutes
    arrivals.sort((a, b) => a.minutes - b.minutes);

    return arrivals.slice(0, time === '0' ? 50 : 10);
  } catch (error) {
    console.error('Error fetching departures:', error);
    return [];
  }
}
