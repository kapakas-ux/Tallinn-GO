/**
 * Northern Estonia GTFS-Realtime Vehicle Positions fetcher.
 *
 * Endpoint: https://ytkpohja-avl-prod.ridango.cloud/data/gtfs/vehicle-positions.pb
 *
 * This is a standard GTFS-Realtime VehiclePositions feed in Protocol Buffer format.
 * We parse it with gtfs-realtime-bindings and map to our app's Vehicle[] type.
 */
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { getDistance } from '../lib/geo';
import type { Vehicle } from '../types';

const GTFS_RT_URL = 'https://ytkpohja-avl-prod.ridango.cloud/data/gtfs/vehicle-positions.pb';

/**
 * Fetch and parse the northern Estonia GTFS-RT vehicle positions feed.
 * Uses CapacitorHttp on native to bypass CORS; on web hits the /api proxy.
 */
export async function fetchNorthernVehicles(): Promise<Vehicle[]> {
  let buffer: ArrayBuffer;

  try {
    if (Capacitor.isNativePlatform()) {
      // Native: fetch binary directly via CapacitorHttp
      const resp = await CapacitorHttp.get({
        url: GTFS_RT_URL,
        responseType: 'arraybuffer',
        headers: { 'Accept': 'application/octet-stream' },
        connectTimeout: 15000,
        readTimeout: 15000,
      });

      if (resp.status !== 200) {
        console.warn(`northernVehicles: HTTP ${resp.status} from GTFS-RT endpoint`);
        return [];
      }

      // CapacitorHttp arraybuffer comes as base64 string or raw
      if (typeof resp.data === 'string') {
        // Decode base64 to ArrayBuffer
        const binary = atob(resp.data);
        buffer = new ArrayBuffer(binary.length);
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
      } else if (resp.data instanceof ArrayBuffer) {
        buffer = resp.data;
      } else {
        console.warn('northernVehicles: unexpected response type from CapacitorHttp', typeof resp.data);
        return [];
      }
    } else {
      // Web: use fetch to hit our proxy (or direct if CORS allows)
      const proxyUrl = `/api/transport/northern-vehicles`;
      const resp = await fetch(proxyUrl, { cache: 'no-cache' });

      if (!resp.ok) {
        console.warn(`northernVehicles: HTTP ${resp.status} from proxy`);
        return [];
      }

      buffer = await resp.arrayBuffer();
    }

    if (!buffer || buffer.byteLength === 0) {
      console.warn('northernVehicles: empty response body');
      return [];
    }

    // Parse the GTFS-Realtime protobuf FeedMessage
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(buffer),
    );

    const vehicles: Vehicle[] = [];

    for (const entity of feed.entity) {
      const vp = entity.vehicle;
      if (!vp) continue;

      // Skip entities without a position
      if (!vp.position || vp.position.latitude == null || vp.position.longitude == null) continue;
      if (vp.position.latitude === 0 && vp.position.longitude === 0) continue;

      // Use vehicle descriptor ID, fall back to entity ID
      const vehicleId = vp.vehicle?.id || entity.id || 'unknown';

      // Line from route_id (e.g. "177_2842_2_3" → extract "177")
      const rawRouteId = vp.trip?.routeId || '';
      // Route IDs in this feed use format: ROUTENUM_TRIPID_DIRECTION_VARIANT
      // Extract just the route number (first underscore-delimited segment)
      const line = rawRouteId.includes('_') ? rawRouteId.split('_')[0] : rawRouteId;

      // Destination: resolved by enrichNorthernDestinations via peatus.ee patterns
      let destination = '';

      vehicles.push({
        id: vehicleId,
        type: 'regional',
        line,
        lat: vp.position.latitude,
        lng: vp.position.longitude,
        bearing: vp.position.bearing ?? 0,
        speed: vp.position.speed ?? 0,
        destination,
        source: 'northern-gtfs' as const,
      } as Vehicle);
    }

    // Dedup: same vehicle ID → keep; same line within 1km → keep first only
    const seen = new Map<string, Vehicle>();
    for (const v of vehicles) seen.set(v.id, v);
    let deduped = [...seen.values()];
    const final: Vehicle[] = [];
    for (const v of deduped) {
      const isDup = final.some(f => f.line === v.line && getDistance(f.lat, f.lng, v.lat, v.lng) < 1.0);
      if (!isDup) final.push(v);
    }

    if (final.length < vehicles.length) {
      console.log(`northernVehicles: deduped ${vehicles.length} → ${final.length}`);
    }
    console.log(`northernVehicles: parsed ${final.length} vehicles from GTFS-RT feed`);
    return final;
  } catch (err) {
    console.warn('northernVehicles: GTFS-RT fetch/parse failed', err);
    return [];
  }
}

// ── Headsign resolution ────────────────────────────────────────────────

const PEATUS_GQL = 'https://api.peatus.ee/routing/v1/routers/estonia/index/graphql';
interface PatternInfo { headsign: string; lastStopLat: number; lastStopLng: number; }
const headsignCache = new Map<string, PatternInfo[]>();
const pendingLines = new Set<string>();

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

async function fetchHeadsigns(line: string): Promise<void> {
  if (headsignCache.has(line) || pendingLines.has(line)) return;
  pendingLines.add(line);

  const query = `{ routes(name: "${line}") { patterns { headsign stops { lat lon } } } }`;
  try {
    let text = '';
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.post({ url: PEATUS_GQL, headers: { 'Content-Type': 'application/json' }, data: { query }, connectTimeout: 5000, readTimeout: 5000 });
      text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    } else {
      const r = await fetch(PEATUS_GQL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      text = await r.text();
    }
    const data = JSON.parse(text);
    const routes = data?.data?.routes;
    if (!routes?.length) return;

    const seen = new Set<string>();
    const infos: PatternInfo[] = [];
    for (const route of routes) {
      for (const p of route.patterns || []) {
        if (!p.headsign || seen.has(p.headsign)) continue;
        seen.add(p.headsign);
        const stops = p.stops || [];
        const last = stops[stops.length - 1];
        if (last) infos.push({ headsign: p.headsign, lastStopLat: last.lat, lastStopLng: last.lon });
      }
    }
    if (infos.length > 0) headsignCache.set(line, infos);
  } catch { /* retry next fetch */ }
  finally { pendingLines.delete(line); }
}

function resolveHeadsign(line: string, lat: number, lng: number, bearing: number): string {
  const cached = headsignCache.get(line);
  if (!cached) {
    fetchHeadsigns(line);
    return '';
  }
  if (cached.length === 1) return cleanHeadsign(cached[0].headsign, line);

  // Pick the pattern whose last stop is closest to the vehicle AND in the right direction.
  // Closer last stop = more likely to be the correct regional route (filters out same-line-number
  // routes in other counties, e.g., line 145 in Tallinn vs Jõgeva).
  let best = cached[0];
  let bestScore = Infinity;
  for (const p of cached) {
    const dist = getDistance(lat, lng, p.lastStopLat, p.lastStopLng);
    const angle = angleDiff(bearing, bearingTo(lat, lng, p.lastStopLat, p.lastStopLng));
    // Score: distance weighted heavily (closer is better), angle breaks ties
    const score = dist * 1000 + angle;
    if (score < bestScore) { bestScore = score; best = p; }
  }
  return cleanHeadsign(best.headsign, line);
}

/** Strip leading line number and clean up formatting */
function cleanHeadsign(headsign: string, line: string): string {
  let h = headsign.trim();
  // Remove leading line number and optional separator
  const prefix = line.replace(/^0+/, '');
  const re = new RegExp(`^${prefix}[\\s\\-–—]+`, 'i');
  h = h.replace(re, '');
  // Take only first part if pipe-separated (e.g., "Balti jaam | Vinterpalu")
  if (h.includes('|')) h = h.split('|')[0].trim();
  // Truncate if absurdly long
  if (h.length > 40) h = h.substring(0, 40);
  return h;
}

/** Resolve destinations for northern vehicles using peatus.ee route patterns.
 *  Called asynchronously — vehicles update in-place as headsigns resolve. */
export async function enrichNorthernDestinations(vehicles: Vehicle[]): Promise<void> {
  const uniqueLines = [...new Set(vehicles.map(v => v.line).filter(Boolean))];
  // Fire all headsign fetches in parallel
  await Promise.all(uniqueLines.map(l => fetchHeadsigns(l).catch(() => {})));
  // Assign headsigns — skip if result looks like an ID (digits, dashes, underscores)
  const isIdLike = (s: string) => /^[\d\-_]+$/.test(s.trim());
  for (const v of vehicles) {
    if (!v.destination && v.line) {
      const h = resolveHeadsign(v.line, v.lat, v.lng, v.bearing);
      if (h && !isIdLike(h)) {
        v.destination = h;
      }
    }
  }
}
