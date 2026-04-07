import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Vehicle } from '../types';

const WS_URL_DIRECT = 'wss://wmb-public-api-peutk.eu-prod.ridango.cloud/ws/tenant/2/vehicle/locations';
const PEATUS_GQL = 'https://api.peatus.ee/routing/v1/routers/estonia/index/graphql';

interface RidangoMessage {
  updateTime: string;
  state: string;
  position: {
    speed: number;
    bearing: number;
    latitude: number;
    longitude: number;
  };
  trip: {
    icon: string;
    routeId: string;
    routeShortName: string;
    startDateTime: string;
    tripId: string;
  };
}

// Cache: routeId → array of { headsign, lastStopLat, lastStopLng }
interface PatternInfo { headsign: string; lastStopLat: number; lastStopLng: number; }
const headsignCache = new Map<string, PatternInfo[]>();
const pendingRoutes = new Set<string>();
// Cache: tripId → resolved destination (locked once resolved to prevent flickering)
const resolvedDestinations = new Map<string, string>();

function routeIdToGtfsId(routeId: string): string {
  const hash = routeId.includes(':') ? routeId.split(':')[1] : routeId;
  return `estonia:${hash}`;
}

async function fetchRouteHeadsigns(routeShortName: string, routeId: string): Promise<void> {
  const cacheKey = routeId;
  if (headsignCache.has(cacheKey) || pendingRoutes.has(cacheKey)) return;
  pendingRoutes.add(cacheKey);

  const gtfsId = routeIdToGtfsId(routeId);
  const query = `{ routes(name: "${routeShortName}") { gtfsId patterns { headsign stops { name lat lon } } } }`;

  try {
    let text = '';
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.post({ url: PEATUS_GQL, headers: { 'Content-Type': 'application/json' }, data: { query } });
      text = typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
    } else {
      const r = await fetch(PEATUS_GQL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
      text = await r.text();
    }

    const data = JSON.parse(text);
    const routes = data?.data?.routes;
    if (!routes || routes.length === 0) return;

    const route = routes.find((r: any) => r.gtfsId === gtfsId) || routes[0];
    if (!route?.patterns) return;

    const infos: PatternInfo[] = [];
    const seenHeadsigns = new Set<string>();
    for (const p of route.patterns) {
      if (!p.headsign || seenHeadsigns.has(p.headsign)) continue;
      seenHeadsigns.add(p.headsign);
      const stops = p.stops || [];
      const lastStop = stops[stops.length - 1];
      if (lastStop) {
        infos.push({ headsign: p.headsign, lastStopLat: lastStop.lat, lastStopLng: lastStop.lon });
      }
    }
    if (infos.length > 0) headsignCache.set(cacheKey, infos);
  } catch {
    // will retry next time
  } finally {
    pendingRoutes.delete(cacheKey);
  }
}

function bearingTo(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLng = toRad(lng2 - lng1);
  const y = Math.sin(dLng) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
            Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function angleDiff(a: number, b: number): number {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function resolveDestination(routeShortName: string, routeId: string, lat: number, lng: number, bearing: number): string {
  const cacheKey = routeId;
  const cached = headsignCache.get(cacheKey);
  if (!cached) {
    fetchRouteHeadsigns(routeShortName, routeId);
    return '';
  }
  if (cached.length === 1) return cached[0].headsign;
  // Pick the pattern whose last stop is in the direction the vehicle is heading (bearing match)
  let best = cached[0];
  let bestAngle = angleDiff(bearing, bearingTo(lat, lng, best.lastStopLat, best.lastStopLng));
  for (let i = 1; i < cached.length; i++) {
    const a = angleDiff(bearing, bearingTo(lat, lng, cached[i].lastStopLat, cached[i].lastStopLng));
    if (a < bestAngle) { bestAngle = a; best = cached[i]; }
  }
  return best.headsign;
}

let ws: WebSocket | null = null;
const vehicles = new Map<string, Vehicle & { lastSeen: number }>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;
const STALE_THRESHOLD = 120_000; // 2 minutes

function getWsUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return WS_URL_DIRECT;
  }
  // Browser dev: proxy through server.ts
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/ridango`;
}

function mapVehicleType(icon: string): Vehicle['type'] {
  const i = (icon || '').toLowerCase();
  if (i === 'tram') return 'tram';
  if (i === 'trolleybus' || i === 'trolley') return 'trolley';
  if (i === 'train' || i === 'rail') return 'train';
  return 'regional';
}

function processMessage(data: RidangoMessage[]): void {
  const now = Date.now();
  const seenIds = new Set<string>();

  for (const rv of data) {
    if (!rv.position || !rv.trip) continue;
    const { latitude, longitude, bearing, speed } = rv.position;
    if (!latitude || !longitude) continue;

    const id = rv.trip.tripId || `ridango-${rv.trip.routeId}-${rv.trip.startDateTime}`;
    seenIds.add(id);

    // Use locked destination if already resolved, otherwise resolve and lock
    let destination = resolvedDestinations.get(id) || '';
    if (!destination) {
      destination = resolveDestination(rv.trip.routeShortName, rv.trip.routeId, latitude, longitude, bearing || 0);
      if (destination) resolvedDestinations.set(id, destination);
    }

    vehicles.set(id, {
      id,
      type: mapVehicleType(rv.trip.icon),
      line: rv.trip.routeShortName || '',
      lat: latitude,
      lng: longitude,
      bearing: bearing || 0,
      speed: speed || 0,
      destination,
      lastSeen: now,
    });
  }

  // If this looks like a full snapshot (10+ vehicles), prune anything not in it
  if (data.length >= 10) {
    for (const key of vehicles.keys()) {
      if (!seenIds.has(key)) { vehicles.delete(key); resolvedDestinations.delete(key); }
    }
  } else {
    // Incremental update — prune stale entries
    for (const [key, v] of vehicles) {
      if (now - v.lastSeen > STALE_THRESHOLD) { vehicles.delete(key); resolvedDestinations.delete(key); }
    }
  }
}

function connect(): void {
  if (ws) {
    ws.close();
    ws = null;
  }

  const url = getWsUrl();
  console.log(`[RidangoWS] connecting to ${url}`);

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[RidangoWS] connected');
      reconnectDelay = 1000;
    };

    ws.onmessage = (event) => {
      try {
        const parsed: RidangoMessage[] = JSON.parse(event.data as string);
        if (Array.isArray(parsed)) {
          processMessage(parsed);
          console.log(`[RidangoWS] received ${parsed.length} vehicles, total stored: ${vehicles.size}`);
        }
      } catch {
        // ignore unparseable messages
      }
    };

    ws.onclose = () => {
      ws = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror
    };
  } catch {
    scheduleReconnect();
  }
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  console.log(`[RidangoWS] reconnecting in ${reconnectDelay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }, reconnectDelay);
}

export function getRidangoVehicles(): Vehicle[] {
  const result: Vehicle[] = [];
  for (const v of vehicles.values()) {
    const { lastSeen: _, ...vehicle } = v;
    result.push(vehicle);
  }
  return result;
}

export function isRidangoConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function startRidangoWS(): void {
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (ws) { ws.close(); ws = null; }
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    } else {
      if (!ws) connect();
    }
  });

  connect();
}

export function stopRidangoWS(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
  vehicles.clear();
}
