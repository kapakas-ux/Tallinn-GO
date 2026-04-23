// Lightweight cache that augments arrival lists with "last of day" flags.
//
// Strategy:
//   - For a given stop, fetch the entire remaining service day once every
//     15 minutes (via fetchDepartures with time="0").
//   - For each (type|line|destination) key, remember the departure time of
//     the latest today.
//   - Callers use `annotateLastOfDay` to mark any arrival whose
//     `departureTimeSeconds` matches the latest entry.

import type { Arrival } from '../types';

type LastMap = Map<string, number>;

interface CacheEntry {
  expiresAt: number;
  data: LastMap;
}

const cache = new Map<string, CacheEntry>();
const TTL_MS = 15 * 60 * 1000; // 15 min

function keyFor(arrival: Pick<Arrival, 'type' | 'line' | 'destination'>): string {
  return `${arrival.type}|${arrival.line}|${arrival.destination}`;
}

/**
 * Get or rebuild the "latest departure per line/destination" map for a stop.
 * `fetchAllDay` is provided by the caller so this module stays free of
 * circular transportService imports.
 */
export async function getLastOfDayMap(
  stopId: string,
  siriId: string | undefined,
  fetchAllDay: () => Promise<Arrival[]>,
): Promise<LastMap> {
  const key = `${stopId}:${siriId || ''}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const all = await fetchAllDay();
    const map: LastMap = new Map();
    for (const a of all) {
      const dep = a.departureTimeSeconds || 0;
      if (!dep) continue;
      const k = keyFor(a);
      const prev = map.get(k);
      if (!prev || dep > prev) map.set(k, dep);
    }
    cache.set(key, { expiresAt: Date.now() + TTL_MS, data: map });
    return map;
  } catch {
    // Keep any stale cache around; otherwise return empty
    return cached?.data ?? new Map();
  }
}

/**
 * Return a new arrivals list where any arrival that is the latest of its line today
 * carries `isLastOfDay = true`.
 */
export function annotateLastOfDay(arrivals: Arrival[], lastMap: LastMap): Arrival[] {
  if (!lastMap.size) return arrivals;
  return arrivals.map((a) => {
    const k = keyFor(a);
    const last = lastMap.get(k);
    if (last && a.departureTimeSeconds && Math.abs(a.departureTimeSeconds - last) < 60) {
      return { ...a, isLastOfDay: true };
    }
    return a;
  });
}
