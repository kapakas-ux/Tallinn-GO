import { Arrival, Stop, Vehicle } from '../types';
import { CapacitorHttp, Capacitor } from '@capacitor/core';

const getApiBaseUrl = () => {
  // 1. Check for environment variable (set during build)
  const meta = import.meta as any;
  const envUrl = meta.env?.VITE_API_URL;
  
  if (envUrl && envUrl.trim() !== '' && !envUrl.includes('YOUR_COMPUTER_IP') && !envUrl.includes('10.0.2.2')) {
    console.log('Using API URL from VITE_API_URL:', envUrl);
    return envUrl;
  }
  
  // 2. Check if we are running in a native (Capacitor) environment
  const origin = window.location.origin;
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
let stopsPromise: Promise<Stop[]> | null = null;
let routesPromise: Promise<void> | null = null;

/**
 * Robust coordinate parser that handles both integers (multiplied) and floats
 */
function parseCoordinate(valStr: string, type: 'lat' | 'lng'): number {
  const val = parseFloat(valStr);
  if (isNaN(val) || val === 0) return 0;

  // Tallinn range: Lat ~59.4, Lng ~24.7
  const isLat = type === 'lat';
  const min = isLat ? 58 : 23;
  const max = isLat ? 61 : 27;

  // 1. Check if it's already a correct float
  if (val >= min && val <= max) return val;

  // 2. Check if it's multiplied by 100,000 (common in stops.txt)
  const val100k = val / 100000;
  if (val100k >= min && val100k <= max) return val100k;

  // 3. Check if it's multiplied by 1,000,000 (common in gps.txt)
  const val1M = val / 1000000;
  if (val1M >= min && val1M <= max) return val1M;

  // 4. Check if it's multiplied by 10,000
  const val10k = val / 10000;
  if (val10k >= min && val10k <= max) return val10k;

  return 0; // Invalid or out of range
}

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
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let delim = ';';
        if (line.includes(';')) delim = ';';
        else if (line.includes(',')) delim = ',';
        else if (line.includes('\t')) delim = '\t';
        
        const parts = line.split(delim).map(p => p.trim().replace(/"/g, ''));
        if (parts.length >= 5) {
          // Tallinn routes.txt: transport;operator;route_num;route_id;route_name;...
          const routeNum = parts[2];
          const routeId = parts[3];
          const routeName = parts[4];
          
          if (i === 0) console.log(`Sample route line: ${line} -> num: ${routeNum}, id: ${routeId}, name: ${routeName}`);
          
          if (routeNum && routeName) {
            routesMap[routeNum] = routeName;
            // Also store normalized
            const normNum = routeNum.replace(/^0+/, '');
            if (normNum && normNum !== routeNum) routesMap[normNum] = routeName;
          }
          if (routeId && routeName) {
            routesMap[routeId] = routeName;
            const normId = routeId.replace(/^0+/, '');
            if (normId && normId !== routeId) routesMap[normId] = routeName;
          }
        }
      }
      console.log(`Successfully parsed ${Object.keys(routesMap).length} route mappings`);
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

        // Register high-quality names in the global map
        if (highQualityName) {
          const registerName = (id: string) => {
            if (!id) return;
            const normId = id.replace(/^0+/, '');
            const baseId = id.split('-')[0];
            
            [id, normId, baseId].forEach(key => {
              if (key && (!stopsMap[key] || stopsMap[key].length < highQualityName.length)) {
                stopsMap[key] = highQualityName;
              }
            });
          };
          
          registerName(internalId);
          if (siriId && siriId !== '0') registerName(siriId);
        }

        rawStops.push({ internalId, siriId, lat, lng, initialName: highQualityName });
      }

      // Second pass: Create Stop objects
      for (const raw of rawStops) {
        let finalName = raw.initialName;
        const isBadName = (n: string | null) => !n || /^[\d\s,\-:]+$/.test(n) || (n.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(n));

        if (isBadName(finalName)) {
          const id = raw.internalId;
          const normId = id.replace(/^0+/, '');
          const baseId = id.split('-')[0];
          const siriId = raw.siriId;
          
          finalName = stopsMap[id] || stopsMap[normId] || stopsMap[baseId] || 
                      (siriId ? (stopsMap[siriId] || stopsMap[siriId.replace(/^0+/, '')]) : null);
          
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
          
          [id, normId, baseId].forEach(key => {
            if (key && !stopsMap[key]) {
              stopsMap[key] = finalName as string;
            }
          });
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

export async function fetchVehicles(): Promise<Vehicle[]> {
  try {
    if (Object.keys(stopsMap).length === 0) await fetchStops();
    if (Object.keys(routesMap).length === 0) await fetchRoutes();

    const url = Capacitor.isNativePlatform() 
      ? 'https://transport.tallinn.ee/gps.txt'
      : `${API_BASE}/api/transport/gps`;
    const text = await universalFetch(url);
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
    const vehicles: Vehicle[] = [];
    
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 10) continue;
      
      const typeRaw = parts[0];
      const lineNum = parts[1];
      const lng = parseCoordinate(parts[2], 'lng');
      const lat = parseCoordinate(parts[3], 'lat');
      
      if (lat === 0 || lng === 0) continue;
      
      const bearing = parseInt(parts[5], 10) || 0;
      const vehicleId = parts[6];
      let destination = parts[9] || '';
      
      if (destination && /^\d+$/.test(destination)) {
        const normDest = destination.replace(/^0+/, '');
        if (routesMap[destination]) destination = routesMap[destination];
        else if (routesMap[normDest]) destination = routesMap[normDest];
        else if (stopsMap[destination]) destination = stopsMap[destination];
        else if (stopsMap[normDest]) destination = stopsMap[normDest];
      }
      
      vehicles.push({
        id: vehicleId || `${lineNum}-${lat}-${lng}`,
        type: typeRaw === '2' ? 'trolley' : (typeRaw === '3' ? 'tram' : 'bus'),
        line: lineNum,
        lat,
        lng,
        bearing,
        destination
      });
    }
    
    return vehicles;
  } catch (error) {
    console.error('Error fetching vehicles:', error);
    return [];
  }
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

          // Resolve destination name if it's a stop ID or route ID
          if (destination && /^\d+$/.test(destination)) {
            const normDest = destination.replace(/^0+/, '');
            let resolvedName = stopsMap[destination] || stopsMap[normDest] || routesMap[destination] || routesMap[normDest];
            
            console.log(`Attempting to resolve destination ID: ${destination} (normalized: ${normDest}). Found in maps: ${!!resolvedName}`);
            
            if (!resolvedName) {
              // Try to find a partial match or a key that starts with this ID
              const keys = Object.keys(stopsMap);
              const match = keys.find(k => k === destination || k === normDest || k.startsWith(destination + '-') || k.startsWith(normDest + '-'));
              if (match) {
                resolvedName = stopsMap[match];
                console.log(`Found partial match for ${destination}: ${match} -> ${resolvedName}`);
              }
            }
            
            if (resolvedName) {
              destination = resolvedName;
            } else {
              console.log(`Could not resolve destination ID: ${destination}`);
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
        return arrivals.sort((a, b) => a.minutes - b.minutes).slice(0, 10);
      }
    }

    return [];
  } catch (error) {
    console.error('Error fetching departures:', error);
    return [];
  }
}
