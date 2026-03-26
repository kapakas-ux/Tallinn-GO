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
      const url = Capacitor.isNativePlatform() 
        ? 'https://transport.tallinn.ee/data/stops.txt'
        : `${API_BASE}/api/transport/stops`;
      const text = await universalFetch(url);
      
      console.log(`fetchStops: received text of length ${text.length}`);
      
      if (text.trim().startsWith('{') && text.includes('"error"')) {
        console.error('fetchStops: Received error JSON instead of stops data:', text);
        return [];
      }

      // Remove potential BOM and trim
      const cleanText = text.replace(/^\uFEFF/, '').trim();
      if (!cleanText) {
        console.log('fetchStops: cleanText is empty');
        return [];
      }
      
      const lines = cleanText.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
      console.log(`fetchStops: found ${lines.length} lines`);
      if (lines.length === 0) return [];

      const stops: Stop[] = [];
      const rawStops: any[] = [];
      const internalMap: { [key: string]: string } = {};
      const siriMap: { [key: string]: string } = {};
      
      // Detect columns once
      let detectedLatIdx = -1;
      let detectedLngIdx = -1;
      let nameIdx = 5; // Default to 5 based on standard format

      // First pass: Parse all rows and build a high-quality name registry
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        
        let delim = ';';
        if (line.includes(',') && !line.includes(';')) delim = ',';
        else if (line.includes('\t')) delim = '\t';
        
        const parts = line.split(delim).map(p => p.trim().replace(/"/g, ''));
        
        // Parse header to find Name index if present
        if (line.toLowerCase().includes('id') && line.toLowerCase().includes('name')) {
          const headerLower = parts.map(p => p.toLowerCase());
          const foundNameIdx = headerLower.indexOf('name');
          if (foundNameIdx !== -1) nameIdx = foundNameIdx;
          continue;
        }
        
        // Skip other header-like lines
        if (line.toLowerCase().includes('id') || line.includes('version')) continue;
        
        if (parts.length < 4) continue;
        
        // Detect coordinate columns if not already done
        if (detectedLatIdx === -1) {
          for (let j = 0; j < Math.min(parts.length, 6); j++) {
            const lat = parseCoordinate(parts[j], 'lat');
            if (lat !== 0) { 
              // Verify it's not just a lucky ID by checking if another column looks like Lng
              for (let k = 0; k < Math.min(parts.length, 6); k++) {
                if (j === k) continue;
                const lng = parseCoordinate(parts[k], 'lng');
                if (lng !== 0) {
                  detectedLatIdx = j;
                  detectedLngIdx = k;
                  console.log(`fetchStops: Detected columns - Lat: ${j}, Lng: ${k} from line: ${line}`);
                  break;
                }
              }
              if (detectedLatIdx !== -1) break;
            }
          }
        }

        const latIdx = detectedLatIdx !== -1 ? detectedLatIdx : 2;
        const lngIdx = detectedLngIdx !== -1 ? detectedLngIdx : 3;

        const lat = parseCoordinate(parts[latIdx], 'lat');
        const lng = parseCoordinate(parts[lngIdx], 'lng');
        
        if (lat === 0 || lng === 0) {
          if (i < 10) console.log(`fetchStops: Skipping line ${i} due to invalid coords: ${parts[latIdx]}, ${parts[lngIdx]}`);
          continue;
        }

        const internalId = parts[0];
        const siriId = parts[1];

        // Use the exact Name column
        let highQualityName = null;
        if (parts.length > nameIdx && parts[nameIdx] && parts[nameIdx].length > 0) {
          highQualityName = parts[nameIdx];
        }

        // Register high-quality names in the global maps
        if (highQualityName) {
          const registerName = (id: string, isSiri: boolean = false) => {
            if (!id) return;
            const normId = id.replace(/^0+/, '');
            
            if (!isSiri) {
              const baseId = id.split('-')[0];
              [id, normId, baseId].forEach(key => {
                if (key && (!internalMap[key] || internalMap[key].length < highQualityName.length)) {
                  internalMap[key] = highQualityName;
                  stopsMap[key] = highQualityName;
                }
              });
            } else {
              [id, normId].forEach(key => {
                if (key && (!siriMap[key] || siriMap[key].length < highQualityName.length)) {
                  siriMap[key] = highQualityName;
                  // Only put in stopsMap if it doesn't overwrite an internal ID
                  if (!stopsMap[key]) {
                    stopsMap[key] = highQualityName;
                  }
                }
              });
            }
          };
          
          registerName(internalId, false);
          if (siriId && siriId !== '0') registerName(siriId, true);
        }

        rawStops.push({ internalId, siriId, lat, lng, initialName: highQualityName });
      }

      // Second pass: Create Stop objects
      for (const raw of rawStops) {
        if (usedStopsSet.size > 0 && !usedStopsSet.has(raw.internalId)) {
          continue; // Skip unused stops
        }
        
        let finalName = raw.initialName;
        const isBadName = (n: string | null) => !n || /^[\d\s,\-:]+$/.test(n) || (n.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(n));

        if (isBadName(finalName)) {
          const id = raw.internalId;
          const normId = id.replace(/^0+/, '');
          const baseId = id.split('-')[0];
          const siriId = raw.siriId;
          
          finalName = internalMap[id] || internalMap[normId] || internalMap[baseId] || 
                      (siriId ? (siriMap[siriId] || siriMap[siriId.replace(/^0+/, '')]) : null);
          
          if (isBadName(finalName)) {
            let nearestDist = 0.0025; // Increased threshold to catch opposite stops on wide roads
            let nearestName = null;
            
            const rawBaseId = raw.internalId.split('-')[0];
            const rawPrefix = rawBaseId.length >= 4 ? rawBaseId.substring(0, rawBaseId.length - 1) : null;

            for (const other of rawStops) {
              if (other === raw || isBadName(other.initialName)) continue;
              const dLat = Math.abs(other.lat - raw.lat);
              // Adjust longitude distance for Tallinn's latitude (cos(59.4°) ≈ 0.5)
              const dLng = Math.abs(other.lng - raw.lng) * 0.5;
              let dist = Math.sqrt(dLat * dLat + dLng * dLng);
              
              // Give a gentle bonus (20% distance discount) to stops that share the same base ID prefix.
              // This helps tie-break between an opposite stop and a stop on an intersecting street,
              // without overriding actual physical proximity for stops that are further away.
              const otherBaseId = other.internalId.split('-')[0];
              const otherPrefix = otherBaseId.length >= 4 ? otherBaseId.substring(0, otherBaseId.length - 1) : null;
              
              if (rawPrefix && otherPrefix && rawPrefix === otherPrefix) {
                dist = dist * 0.8;
              }

              if (dist < nearestDist) {
                nearestDist = dist;
                nearestName = other.initialName;
              }
            }
            if (nearestName) finalName = nearestName;
          }
          if (isBadName(finalName)) finalName = raw.internalId;
        }

        // Add the resolved name back to stopsMap so vehicles can resolve their destinations correctly
        if (finalName && !isBadName(finalName)) {
          const id = raw.internalId;
          const normId = id.replace(/^0+/, '');
          const baseId = id.split('-')[0];
          const siriId = raw.siriId;
          
          [id, normId, baseId].forEach(key => {
            if (key && !stopsMap[key]) {
              stopsMap[key] = finalName as string;
            }
          });
          
          if (siriId && siriId !== '0') {
            const normSiri = siriId.replace(/^0+/, '');
            [siriId, normSiri].forEach(key => {
              if (key && !stopsMap[key]) {
                stopsMap[key] = finalName as string;
              }
            });
          }
        }

        stops.push({
          id: raw.internalId,
          siriId: raw.siriId && raw.siriId !== '' && raw.siriId !== '0' ? raw.siriId : undefined,
          name: finalName || raw.internalId,
          lat: raw.lat,
          lng: raw.lng
        });
      }
      
      console.log(`Successfully parsed ${stops.length} stops.`);
      return stops;
    } catch (error) {
      console.error('Error fetching/parsing stops:', error);
      stopsPromise = null;
      return [];
    }
  })();
  
  return stopsPromise;
}

let cachedVehicles: Vehicle[] = [];
let lastVehiclesFetch = 0;

export async function fetchVehicles(): Promise<Vehicle[]> {
  try {
    const now = Date.now();
    if (cachedVehicles.length > 0 && now - lastVehiclesFetch < 2000) {
      return cachedVehicles;
    }

    if (Object.keys(stopsMap).length === 0) await fetchStops();
    if (Object.keys(routesMap).length === 0) await fetchRoutes();

    const url = Capacitor.isNativePlatform() 
      ? 'https://transport.tallinn.ee/gps.txt'
      : `${API_BASE}/api/transport/gps`;
    const text = await universalFetch(url);
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
    console.log(`fetchVehicles: received ${lines.length} lines from gps.txt`);
    const vehicles: Vehicle[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',').map(p => p.trim());
      if (parts.length < 4) continue;

      const typeRaw = parts[0];
      const lineNum = parts[1];

      // Try to find Lng/Lat in columns 2,3 or 3,2 (standard for Tallinn)
      let lng = 0;
      let lat = 0;

      // Check standard Lng,Lat (2,3)
      const p2Lng = parseCoordinate(parts[2], 'lng');
      const p3Lat = parseCoordinate(parts[3], 'lat');
      
      if (p2Lng !== 0 && p3Lat !== 0) {
        lng = p2Lng;
        lat = p3Lat;
      } else {
        // Check swapped Lat,Lng (2,3)
        const p2Lat = parseCoordinate(parts[2], 'lat');
        const p3Lng = parseCoordinate(parts[3], 'lng');
        if (p2Lat !== 0 && p3Lng !== 0) {
          lat = p2Lat;
          lng = p3Lng;
        }
      }

      // If still not found, search other columns (fallback)
      if (lng === 0 || lat === 0) {
        for (let j = 2; j < Math.min(parts.length, 6); j++) {
          const foundLat = parseCoordinate(parts[j], 'lat');
          if (foundLat !== 0) {
            for (let k = 2; k < Math.min(parts.length, 6); k++) {
              if (j === k) continue;
              const foundLng = parseCoordinate(parts[k], 'lng');
              if (foundLng !== 0) {
                lat = foundLat;
                lng = foundLng;
                break;
              }
            }
            if (lat !== 0) break;
          }
        }
      }

      if (lng === 0 || lat === 0) continue;

      const type: 'bus' | 'tram' | 'trolley' = 
        typeRaw === '1' ? 'trolley' : 
        typeRaw === '3' ? 'tram' : 'bus';

      const bearingStr = parts[5];
      const bearing = bearingStr ? parseInt(bearingStr, 10) : 0;
      const speedStr = parts[4];
      const speed = speedStr ? parseFloat(speedStr) : 0;
      const vehicleId = parts[6] || `${type}-${lineNum}-${i}`;
      let destination = parts[9] || '';
      
      const isBadName = (n: string | null | undefined) => !n || /^[\d\s,\-:]+$/.test(n) || (n.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(n));
      
      if (!destination || isBadName(destination)) {
        const normDest = destination.replace(/^0+/, '');
        if (destination && routesMap[destination] && !isBadName(routesMap[destination])) destination = routesMap[destination];
        else if (normDest && routesMap[normDest] && !isBadName(routesMap[normDest])) destination = routesMap[normDest];
        else if (destination && stopsMap[destination] && !isBadName(stopsMap[destination])) destination = stopsMap[destination];
        else if (normDest && stopsMap[normDest] && !isBadName(stopsMap[normDest])) destination = stopsMap[normDest];
        else if (typeRaw === '3') { // tram
          const tramRoutes: Record<string, string> = {
            '1': 'Kopli - Kadriorg',
            '2': 'Kopli - Suur-Paala',
            '3': 'Tondi - Kadriorg',
            '4': 'Tondi - Suur-Paala',
            '5': 'Kopli - Vana-Lõuna'
          };
          if (tramRoutes[lineNum]) destination = tramRoutes[lineNum];
          else if (routesMap[lineNum] && !isBadName(routesMap[lineNum])) destination = routesMap[lineNum];
        }
        else if (routesMap[lineNum] && !isBadName(routesMap[lineNum])) destination = routesMap[lineNum];
      }
      
      // Add a tiny bit of jitter to prevent overlapping markers if they have same coords
      const jitter = (Math.random() - 0.5) * 0.000001;
      
      vehicles.push({
        id: vehicleId,
        type,
        line: lineNum,
        lng: lng + jitter,
        lat: lat + jitter,
        bearing: bearing || 0,
        speed: speed || 0,
        destination
      });
    }
    
    console.log(`fetchVehicles: parsed ${vehicles.length} vehicles successfully`);
    cachedVehicles = vehicles;
    lastVehiclesFetch = now;
    return vehicles;
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return cachedVehicles; // Return cached if fetch fails
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
    // Ensure stopsMap and routesMap are populated
    if (Object.keys(stopsMap).length === 0) {
      await fetchStops();
    }
    if (Object.keys(routesMap).length === 0) {
      await fetchRoutes();
    }

    let url = '';
    if (Capacitor.isNativePlatform()) {
      const targetId = siriId && siriId !== '0' ? siriId : stopId;
      url = `https://transport.tallinn.ee/siri-stop-departures.php?stopid=${targetId}`;
      if (time) url += `&time=${time}`;
    } else {
      url = `${API_BASE}/api/transport/departures?stopId=${stopId}`;
      if (siriId) url += `&siriId=${siriId}`;
      if (time) url += `&time=${time}`;
    }
    
    const text = await universalFetch(url);
    
    console.log(`fetchDepartures raw response for ${stopId}/${siriId}:`, text.substring(0, 500));
    
    const arrivals: Arrival[] = [];
    if (text.length > 0 && !text.includes('error') && !text.includes('<!DOCTYPE html>')) {
      const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        console.log(`Processing line ${i}: ${line}`);
        let delim = ',';
        if (line.includes(';')) delim = ';';
        else if (line.includes('\t')) delim = '\t';

        const parts = line.split(delim).map(p => p.trim().replace(/"/g, ''));
        
        // Skip the stop info line (usually first line)
        // A stop info line usually has the stop name as the first part and stopId as second
        // A departure line usually starts with a known type or a line number
        const isDepartureLine = (p: string[]) => {
          if (p.length < 3) return false;
          const first = p[0].toLowerCase();
          // If first part is a known type, it's a departure
          if (['bus', 'tram', 'trolley'].includes(first)) return true;
          // If first part is a line number (short number), it's likely a departure
          if (first.length <= 4 && /^\d+[A-Z]?$/.test(first.toUpperCase())) return true;
          return false;
        };

        if (i === 0 && !isDepartureLine(parts)) {
          console.log('Skipping header line:', line);
          continue;
        }

        if (parts.length >= 3) {
          // Possible formats:
          // 1. type, line, destination, minutes, [time]
          // 2. line, destination, minutes, [time]
          
          let type: 'bus' | 'tram' | 'trolley' = 'bus';
          let lineNum = '';
          let destination = '';
          let timeValue = '';
          let arrivalTime = '';

          const firstPart = parts[0].toLowerCase();
          if (['bus', 'tram', 'trolley'].includes(firstPart)) {
            type = firstPart as any;
            lineNum = parts[1];
            
            const isLargeNumber = (s: string) => /^\d+$/.test(s) && parseInt(s) > 10000;
            
            if (parts.length >= 5 && isLargeNumber(parts[2]) && isLargeNumber(parts[3])) {
              // Siri API format: type, line, expected_time, scheduled_time, destination, seconds_from_now, ...
              destination = parts[4];
              timeValue = parts[2];
              arrivalTime = '';
            } else {
              // Fallback format: type, line, destination, time_seconds, scheduled_time
              destination = parts[2] || '';
              timeValue = parts[3] || '';
              arrivalTime = parts[4] || (timeValue.includes(':') ? timeValue : '');
            }
            
            // If p2 looks like a time and p3 doesn't, they might be swapped (rare but possible in some fallbacks)
            const isTime = (s: string) => s.includes(':') || (/^\d+$/.test(s) && parseInt(s) < 10000 && !s.startsWith('0'));
            if (isTime(destination) && !isTime(timeValue) && timeValue.length > 0) {
              const tmp = destination;
              destination = timeValue;
              timeValue = tmp;
            }
            
          } else {
            // No type, first part is line: line, destination, time_seconds, scheduled_time
            lineNum = parts[0];
            
            const isLargeNumber = (s: string) => /^\d+$/.test(s) && parseInt(s) > 10000;
            
            if (parts.length >= 4 && isLargeNumber(parts[1]) && isLargeNumber(parts[2])) {
              // Siri API format: line, expected_time, scheduled_time, destination, seconds_from_now, ...
              destination = parts[3];
              timeValue = parts[1];
              arrivalTime = '';
            } else {
              destination = parts[1] || '';
              timeValue = parts[2] || '';
              arrivalTime = parts[3] || (timeValue.includes(':') ? timeValue : '');
            }
            
            // Heuristic for type
            if (['1', '2', '3', '4', '5'].includes(lineNum)) type = 'tram';
            else if (['1', '3', '4', '5'].includes(lineNum) && lineNum.length === 1) type = 'trolley';
          }

          const isBadName = (n: string | null | undefined) => !n || /^[\d\s,\-:]+$/.test(n) || (n.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(n));

          // Resolve destination name if it's a stop ID or route ID or a bad name
          if (!destination || isBadName(destination)) {
            const normDest = destination ? destination.replace(/^0+/, '') : '';
            let resolvedName = destination ? (stopsMap[destination] || stopsMap[normDest] || routesMap[destination] || routesMap[normDest]) : '';
            
            console.log(`Attempting to resolve destination ID: ${destination} (normalized: ${normDest}). Found in maps: ${!!resolvedName}`);
            
            if (destination && (!resolvedName || isBadName(resolvedName))) {
              // Try to find a partial match or a key that starts with this ID
              const keys = Object.keys(stopsMap);
              const match = keys.find(k => k === destination || k === normDest || k.startsWith(destination + '-') || k.startsWith(normDest + '-'));
              if (match) {
                resolvedName = stopsMap[match];
                console.log(`Found partial match for ${destination}: ${match} -> ${resolvedName}`);
              }
            }
            
            if (resolvedName && !isBadName(resolvedName)) {
              destination = resolvedName;
            } else {
              console.log(`Could not resolve destination ID: ${destination}`);
              // Fallback: try to get the route name by line number
              if (type === 'tram') {
                const tramRoutes: Record<string, string> = {
                  '1': 'Kopli - Kadriorg',
                  '2': 'Kopli - Suur-Paala',
                  '3': 'Tondi - Kadriorg',
                  '4': 'Tondi - Suur-Paala',
                  '5': 'Kopli - Vana-Lõuna'
                };
                if (tramRoutes[lineNum]) {
                  destination = tramRoutes[lineNum];
                } else if (routesMap[lineNum] && !isBadName(routesMap[lineNum])) {
                  destination = routesMap[lineNum];
                }
              } else if (routesMap[lineNum] && !isBadName(routesMap[lineNum])) {
                destination = routesMap[lineNum];
              }
            }
          }

          // Heuristic to skip non-departure lines or headers
          if (lineNum.length > 10 || !destination || destination.length < 1) {
            console.log(`Skipping line: ${lineNum}, ${destination}`);
            continue;
          }

          console.log(`Parsing departure: ${lineNum} to ${destination}, timeValue: ${timeValue}, arrivalTime: ${arrivalTime}`);

          let minutes: number = NaN;
          let displayTime: string | undefined = arrivalTime;

          // Get current time in Tallinn (UTC+2 or UTC+3)
          // For simplicity and reliability in this environment, we'll use a 2-hour offset
          // as Tallinn is EET (UTC+2) in winter.
          const now = new Date();
          const tallinnOffset = 2 * 60 * 60000; 
          const nowTallinn = new Date(now.getTime() + tallinnOffset);
          
          const timeToUse = timeValue.includes(':') ? timeValue : (arrivalTime.includes(':') ? arrivalTime : '');
          let minutesFromTime: number | undefined = undefined;

          if (timeToUse) {
            displayTime = timeToUse;
            const [h, m] = timeToUse.split(':').map(Number);
            if (!isNaN(h) && !isNaN(m)) {
              const dep = new Date(nowTallinn.getTime());
              // Use UTC methods because nowTallinn is an offset UTC date
              dep.setUTCHours(h, m, 0, 0);
              
              // Handle day rollover
              if (dep.getTime() < nowTallinn.getTime() - 12 * 60 * 60000) {
                dep.setDate(dep.getDate() + 1);
              } else if (dep.getTime() > nowTallinn.getTime() + 12 * 60 * 60000) {
                dep.setDate(dep.getDate() - 1);
              }
              minutesFromTime = Math.round((dep.getTime() - nowTallinn.getTime()) / 60000);
            }
          }

          const val = parseInt(timeValue);
          if (!isNaN(val)) {
            // If val is large (> 1000), it's likely seconds from midnight
            // If it's small, it's likely seconds until departure
            if (val > 1000) {
              const secondsFromMidnight = val;
              // Use UTC methods because nowTallinn is an offset UTC date
              const currentSecondsFromMidnight = nowTallinn.getUTCHours() * 3600 + nowTallinn.getUTCMinutes() * 60 + nowTallinn.getUTCSeconds();
              let diffSeconds = secondsFromMidnight - currentSecondsFromMidnight;
              
              // Handle day rollover for seconds from midnight
              if (diffSeconds < -12 * 3600) diffSeconds += 24 * 3600;
              else if (diffSeconds > 12 * 3600) diffSeconds -= 24 * 3600;
              
              minutes = Math.round(diffSeconds / 60);
            } else {
              // Small value, assume seconds until departure
              minutes = Math.round(val / 60);
            }
            
            // If we have a time string, prefer that calculation if it's close
            if (minutesFromTime !== undefined && Math.abs(minutes - minutesFromTime) > 30) {
              // If they differ wildly, the time string is usually more reliable for "daily schedule"
              // while the seconds value is more reliable for "real-time"
              // But if the seconds value was interpreted as "from midnight" and it's still far,
              // use the time string.
              minutes = minutesFromTime;
            }
          } else if (minutesFromTime !== undefined) {
            minutes = minutesFromTime;
          }

          if (!isNaN(minutes)) {
            arrivals.push({
              line: lineNum,
              destination: destination,
              type: type,
              minutes: minutes,
              time: displayTime && displayTime.includes(':') ? displayTime.substring(0, 5) : undefined,
              status: 'on-time'
            });
          }
        }
      }
      
      if (arrivals.length > 0) {
        const sortedArrivals = arrivals
          .filter(a => a.minutes >= -2) // Allow up to 2 minutes in the past
          .sort((a, b) => a.minutes - b.minutes);
          
        // Assign vehicleIndex based on order of arrival for the same line and destination
        const counts: Record<string, number> = {};
        sortedArrivals.forEach(a => {
          const key = `${a.type}-${a.line}-${a.destination}`;
          if (counts[key] === undefined) {
            counts[key] = 0;
          } else {
            counts[key]++;
          }
          a.vehicleIndex = counts[key];
        });
        
        return sortedArrivals.slice(0, 10);
      }
    }

    return [];
  } catch (error) {
    console.error('Error fetching departures:', error);
    return [];
  }
}
