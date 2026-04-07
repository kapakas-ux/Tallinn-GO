import { Capacitor } from '@capacitor/core';
import type { Vehicle } from '../types';

const WS_URL = 'wss://api.ridango.com/rt-ws/vehicle-status';
const TARTU_ROUTES_API = 'https://wmb-public-api-tartu.eu-prod.ridango.cloud/tenant/7/v1/routes';
const TARTU_REGION_ID = 32;

interface TartuWsMessage {
  deviceId: string;
  regionId: number;
  updateTime: string;
  trip: {
    tripId: string;
    directionId: number;
    routeShortName: string;
    startTime: string;
    startDate: string;
  };
  position: {
    speed: number;
    bearing: number;
    latitude: number;
    longitude: number;
    occupancyStatus: string | null;
  };
}

interface TartuRoute {
  id: string;
  shortName: string;
  longName: string;
  mode: string;
}

// Route metadata cache
let routesCache: TartuRoute[] = [];
let routesFetched = false;

// Destination cache: tripId → resolved destination (locked once resolved)
const resolvedDestinations = new Map<string, string>();

async function fetchTartuRoutes(): Promise<void> {
  if (routesFetched) return;
  try {
    const resp = await fetch(TARTU_ROUTES_API);
    const routes: TartuRoute[] = await resp.json();
    routesCache = routes;
    routesFetched = true;
    console.log(`[TartuWS] fetched ${routes.length} routes`);
  } catch (e) {
    console.warn('[TartuWS] failed to fetch routes:', e);
  }
}

/**
 * Extract destination from tripId and route metadata.
 * tripId format: "302_4_Ringtee - Kummeli_A>B_hash|number"
 * The route longName contains e.g. "Ringtee - Kummeli" — the last part after " - " is the destination.
 * We match by finding the route whose longName appears in the tripId.
 */
function resolveDestination(tripId: string, routeShortName: string): string {
  // Try cached destination first
  const cached = resolvedDestinations.get(tripId);
  if (cached) return cached;

  // Try to extract from route metadata
  // Find routes matching this shortName
  const matching = routesCache.filter(r => r.shortName === routeShortName);
  if (matching.length > 0) {
    // Find the route whose longName appears in the tripId
    const routeMatch = matching.find(r => tripId.includes(r.longName));
    if (routeMatch) {
      // longName is "A - B", destination is the last part
      const parts = routeMatch.longName.split(' - ');
      const dest = parts[parts.length - 1].trim();
      if (dest) {
        resolvedDestinations.set(tripId, dest);
        return dest;
      }
    }
    // Fallback: try extracting from tripId directly
    // tripId: "302_4_Ringtee - Kummeli_A>B_hash|number"
    // After the line number, there's the route description
    const tripParts = tripId.split('_');
    if (tripParts.length >= 3) {
      const routeDesc = tripParts[2]; // "Ringtee - Kummeli"
      const descParts = routeDesc.split(' - ');
      const dest = descParts[descParts.length - 1].trim();
      if (dest) {
        resolvedDestinations.set(tripId, dest);
        return dest;
      }
    }
  }

  // Last resort: parse tripId directly
  const tripParts = tripId.split('_');
  if (tripParts.length >= 3) {
    const routeDesc = tripParts[2];
    const descParts = routeDesc.split(' - ');
    const dest = descParts[descParts.length - 1].trim();
    if (dest) {
      resolvedDestinations.set(tripId, dest);
      return dest;
    }
  }

  return '';
}

let ws: WebSocket | null = null;
const vehicles = new Map<string, Vehicle & { lastSeen: number }>();
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
const MAX_RECONNECT_DELAY = 30000;
const STALE_THRESHOLD = 120_000; // 2 minutes

function getWsUrl(): string {
  if (Capacitor.isNativePlatform()) {
    return WS_URL;
  }
  // Browser dev: proxy through server.ts
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/tartu`;
}

function processMessage(data: TartuWsMessage[]): void {
  const now = Date.now();
  const seenIds = new Set<string>();

  for (const rv of data) {
    if (!rv.position || !rv.trip) continue;
    const { latitude, longitude, bearing, speed } = rv.position;
    if (!latitude || !longitude) continue;

    const id = `tartu-${rv.trip.tripId}`;
    seenIds.add(id);

    const destination = resolveDestination(rv.trip.tripId, rv.trip.routeShortName);

    vehicles.set(id, {
      id,
      type: 'bus',
      line: rv.trip.routeShortName || '',
      lat: latitude,
      lng: longitude,
      bearing: bearing || 0,
      speed: speed || 0,
      destination,
      lastSeen: now,
    });
  }

  // Full snapshot: prune vehicles not in message
  if (data.length >= 5) {
    for (const key of vehicles.keys()) {
      if (!seenIds.has(key)) { vehicles.delete(key); resolvedDestinations.delete(key); }
    }
  } else {
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
  console.log(`[TartuWS] connecting to ${url}`);

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      console.log('[TartuWS] connected, sending subscription');
      reconnectDelay = 1000;
      // Subscribe to all vehicles in region 32 (Tartu)
      ws!.send(JSON.stringify({
        regionId: TARTU_REGION_ID,
        topLeftCoordinates: { longitude: 0, latitude: 180 },
        bottomRightCoordinates: { longitude: 180, latitude: -180 },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const text = typeof event.data === 'string' ? event.data : event.data.toString();
        const parsed = JSON.parse(text);
        // Skip connection confirmation message
        if (parsed && parsed.connectionEstablished !== undefined) {
          console.log('[TartuWS] subscription confirmed');
          return;
        }
        if (Array.isArray(parsed)) {
          processMessage(parsed as TartuWsMessage[]);
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
  console.log(`[TartuWS] reconnecting in ${reconnectDelay}ms`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
    reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
  }, reconnectDelay);
}

export function getTartuVehicles(): Vehicle[] {
  const result: Vehicle[] = [];
  for (const v of vehicles.values()) {
    const { lastSeen: _, ...vehicle } = v;
    result.push(vehicle);
  }
  return result;
}

export function isTartuConnected(): boolean {
  return ws !== null && ws.readyState === WebSocket.OPEN;
}

export function startTartuWS(): void {
  // Fetch routes metadata first
  fetchTartuRoutes();

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

export function stopTartuWS(): void {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (ws) { ws.close(); ws = null; }
  vehicles.clear();
  resolvedDestinations.clear();
}
