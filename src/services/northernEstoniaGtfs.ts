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

      // Destination: try vehicle label first, then trip headsign from route
      let destination = '';
      const label = (vp.vehicle?.label || '').trim();
      // Filter out labels that are just fleet numbers or IDs
      if (label && !/^\d+$/.test(label) && label.length > 1 && !label.includes('_') && label !== vehicleId) {
        destination = label;
      }
      // Fallback: use stop_id as hint (the bus is heading to that stop)
      if (!destination && vp.stopId) {
        destination = vp.stopId;
      }

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

    console.log(`northernVehicles: parsed ${vehicles.length} vehicles from GTFS-RT feed`);
    return vehicles;
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
  if (cached.length === 1) return cached[0].headsign;
  let best = cached[0];
  let bestAngle = angleDiff(bearing, bearingTo(lat, lng, best.lastStopLat, best.lastStopLng));
  for (let i = 1; i < cached.length; i++) {
    const a = angleDiff(bearing, bearingTo(lat, lng, cached[i].lastStopLat, cached[i].lastStopLng));
    if (a < bestAngle) { bestAngle = a; best = cached[i]; }
  }
  return best.headsign;
}

/** Resolve destinations for northern vehicles using peatus.ee route patterns.
 *  Called asynchronously — vehicles update in-place as headsigns resolve. */
export async function enrichNorthernDestinations(vehicles: Vehicle[]): Promise<void> {
  const uniqueLines = [...new Set(vehicles.map(v => v.line).filter(Boolean))];
  // Fire all headsign fetches in parallel
  await Promise.all(uniqueLines.map(l => fetchHeadsigns(l).catch(() => {})));
  // Assign headsigns
  for (const v of vehicles) {
    if (!v.destination && v.line) {
      v.destination = resolveHeadsign(v.line, v.lat, v.lng, v.bearing);
    }
  }
}
