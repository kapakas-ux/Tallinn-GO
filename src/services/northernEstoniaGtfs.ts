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

      // Destination: GTFS-RT VehiclePosition doesn't carry headsign directly.
      // Use vehicle.label if it looks like a destination (not just a fleet number).
      let destination = '';
      const label = vp.vehicle?.label || '';
      if (label && !/^\d+$/.test(label) && label.length > 1 && label !== vehicleId) {
        destination = label;
      }

      // Trip ID for deduplication
      const tripId = vp.trip?.tripId || '';

      vehicles.push({
        id: vehicleId,
        type: 'bus',
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
