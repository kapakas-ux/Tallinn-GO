import { Arrival, Stop, Vehicle } from '../types';

let stopsMap: Record<string, string> = {};
let routesMap: Record<string, string> = {};
let stopsPromise: Promise<Stop[]> | null = null;
let routesPromise: Promise<void> | null = null;

export async function fetchRoutes(): Promise<void> {
  if (routesPromise) return routesPromise;
  
  routesPromise = (async () => {
    try {
      const response = await fetch('/api/transport/routes');
      if (!response.ok) return;
      const text = await response.text();
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
      const response = await fetch('/api/transport/stops');
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      const text = await response.text();
      
      console.log(`fetchStops: received text of length ${text.length}`);
      
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
      
      // First pass: Parse all rows and build a high-quality name registry
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#')) continue;
        if (i === 0 && (line.toLowerCase().includes('id') || line.toLowerCase().includes('name'))) continue;
        
        let delim = ';';
        if (line.includes(',') && !line.includes(';')) delim = ',';
        else if (line.includes('\t')) delim = '\t';
        
        const parts = line.split(delim).map(p => p.trim().replace(/"/g, ''));
        if (i < 5) console.log(`Sample stop line ${i}: ${line} -> parts:`, parts);
        if (parts.length < 5) continue; // Tallinn format: id;siriId;lat;lng;name
        
        const internalId = parts[0];
        const siriId = parts[1];
        const latRaw = parseInt(parts[2], 10);
        const lngRaw = parseInt(parts[3], 10);
        const name = parts[4];
        
        if (isNaN(latRaw) || isNaN(lngRaw)) continue;

        // Tallinn stops.txt name is at index 4
        const highQualityName = (name && name.length > 1 && !/^[\d\s,\-:]+$/.test(name)) ? name : null;
        
        // Register high-quality names in the global map
        if (highQualityName) {
          const registerName = (id: string) => {
            if (!id) return;
            const normId = id.replace(/^0+/, '');
            const baseId = id.split('-')[0];
            const normBaseId = baseId.replace(/^0+/, '');
            
            [id, normId, baseId, normBaseId].forEach(key => {
              if (key && (!stopsMap[key] || stopsMap[key].length < highQualityName.length)) {
                stopsMap[key] = highQualityName;
              }
            });
          };
          
          registerName(internalId);
          if (siriId && siriId !== '0') registerName(siriId);
        }

        rawStops.push({ internalId, siriId, latRaw, lngRaw, initialName: highQualityName });
      }

      // Second pass: Create Stop objects and resolve names from the registry or proximity
      for (const raw of rawStops) {
        let finalName = raw.initialName;
        
        const isBadName = (n: string | null) => !n || /^[\d\s,\-:]+$/.test(n) || (n.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(n));

        if (isBadName(finalName)) {
          // 1. Try to resolve from registry using various ID forms
          const id = raw.internalId;
          const normId = id.replace(/^0+/, '');
          const baseId = id.split('-')[0];
          const normBaseId = baseId.replace(/^0+/, '');
          const siriId = raw.siriId;
          
          finalName = stopsMap[id] || stopsMap[normId] || stopsMap[baseId] || stopsMap[normBaseId] || 
                      (siriId ? (stopsMap[siriId] || stopsMap[siriId.replace(/^0+/, '')]) : null);
          
          // 2. Proximity fallback: Find the nearest stop with a good name within ~150 meters
          if (isBadName(finalName)) {
            let nearestDist = 0.0015; // Approx 150m in lat/lng degrees (very rough but works for local)
            let nearestName = null;
            
            for (const other of rawStops) {
              if (other === raw || isBadName(other.initialName)) continue;
              
              const dLat = Math.abs(other.latRaw - raw.latRaw) / 100000;
              const dLng = Math.abs(other.lngRaw - raw.lngRaw) / 100000;
              const dist = Math.sqrt(dLat * dLat + dLng * dLng);
              
              if (dist < nearestDist) {
                nearestDist = dist;
                nearestName = other.initialName;
              }
            }
            
            if (nearestName) finalName = nearestName;
          }
          
          // 3. Last resort fallback
          if (isBadName(finalName)) finalName = raw.internalId;
        }

        const stop = {
          id: raw.internalId,
          siriId: raw.siriId && raw.siriId !== '' && raw.siriId !== '0' ? raw.siriId : undefined,
          name: finalName || raw.internalId,
          lat: raw.latRaw / 100000,
          lng: raw.lngRaw / 100000
        };
        stops.push(stop);
      }
      
      console.log(`Successfully parsed ${stops.length} stops. Map size: ${Object.keys(stopsMap).length}`);
      // Log a few samples to help debug
      const sampleKeys = Object.keys(stopsMap).slice(0, 10);
      console.log('Sample stopsMap keys:', sampleKeys);
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
    const response = await fetch('/api/transport/gps');
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    const text = await response.text();
    
    const lines = text.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
    const vehicles: Vehicle[] = [];
    
    for (const line of lines) {
      const parts = line.split(',');
      if (parts.length < 10) continue;
      
      const typeRaw = parts[0];
      const lineNum = parts[1];
      const lngRaw = parseInt(parts[2], 10);
      const latRaw = parseInt(parts[3], 10);
      const bearing = parseInt(parts[5], 10) || 0;
      const vehicleId = parts[6];
      const destination = parts[9];
      
      if (isNaN(latRaw) || isNaN(lngRaw)) continue;
      
      // Coordinates in gps.txt are multiplied by 1,000,000
      const lat = latRaw / 1000000;
      const lng = lngRaw / 1000000;
      
      let type: 'bus' | 'tram' | 'trolley' = 'bus';
      if (typeRaw === '2') type = 'trolley';
      if (typeRaw === '3') type = 'tram';
      
      vehicles.push({
        id: vehicleId || `${lineNum}-${lat}-${lng}`,
        type,
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

    let url = `/api/transport/departures?stopId=${stopId}`;
    if (siriId) {
      url += `&siriId=${siriId}`;
    }
    if (time) {
      url += `&time=${time}`;
    }
    const response = await fetch(url);
    const text = await response.text();
    
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
            
            // In Tallinn Siri API: type, line, destination, time_seconds, scheduled_time, [destination_name]
            // We prioritize the 6th column (index 5) for destination name if available
            destination = parts[5] || parts[2] || '';
            timeValue = parts[3] || '';
            
            // If p2 looks like a time and p3 doesn't, they might be swapped (rare but possible in some fallbacks)
            const isTime = (s: string) => s.includes(':') || (/^\d+$/.test(s) && parseInt(s) < 10000 && !s.startsWith('0'));
            if (isTime(destination) && !isTime(timeValue) && timeValue.length > 0) {
              const tmp = destination;
              destination = timeValue;
              timeValue = tmp;
            }
            
            arrivalTime = parts[4] || (timeValue.includes(':') ? timeValue : '');
          } else {
            // No type, first part is line: line, destination, time_seconds, scheduled_time
            lineNum = parts[0];
            destination = parts[1] || '';
            timeValue = parts[2] || '';
            arrivalTime = parts[3] || (timeValue.includes(':') ? timeValue : '');
            
            // Heuristic for type
            if (['1', '2', '3', '4', '5'].includes(lineNum)) type = 'tram';
            else if (['1', '3', '4', '5'].includes(lineNum) && lineNum.length === 1) type = 'trolley';
          }

          // Resolve destination name if it's a stop ID or route ID
          const isId = (s: string) => /^\d+$/.test(s) || (s.includes('-') && !/[a-zA-ZäöüõÄÖÜÕ]/.test(s));
          
          if (destination && isId(destination)) {
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
