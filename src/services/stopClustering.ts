import { getDistance } from '../lib/geo';
import { Stop, Arrival } from '../types';
import { fetchDepartures } from './transportService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StopCluster {
  /** Stable cluster id — derived from the sorted, joined stop ids. */
  id: string;
  /** User-facing hub name — the most common name among member stops. */
  hubName: string;
  /** All member stops, sorted by distance from the user. */
  stops: Stop[];
  /** Single flat departure board merged from every member stop. */
  departures: Arrival[];
  /** Combined score: (1 / distance_km) * departuresPerHour */
  score: number;
  /** Total departures across all member stops in the next 60 minutes. */
  departuresPerHour: number;
  /** Whether departures data has been fetched. */
  fetched: boolean;
}

export interface ClusteringOptions {
  /** Cluster radius in metres (default 80). */
  radiusM: number;
  /** Max number of top clusters to return (default 5). */
  topN: number;
}

// ---------------------------------------------------------------------------
// Clustering
// ---------------------------------------------------------------------------

/**
 * Group stops within `radiusM` of each other using union-find on Haversine
 * distances.  Returns an array of clusters, each with 2+ stops.
 */
export function clusterStops(
  stops: Stop[],
  userLat: number,
  userLng: number,
  options: ClusteringOptions = { radiusM: 80, topN: 5 },
): StopCluster[] {
  const { radiusM } = options;
  const n = stops.length;
  const parent = new Array(n).fill(0).map((_, i) => i);
  const rank = new Array(n).fill(0);

  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };

  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    if (rank[ra] < rank[rb]) { parent[ra] = rb; }
    else if (rank[ra] > rank[rb]) { parent[rb] = ra; }
    else { parent[rb] = ra; rank[ra]++; }
  };

  // Union stops within radiusM (comparing every pair — O(n²) but n is small,
  // typically < 4000, and this runs once on the full stop list)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = getDistance(stops[i].lat, stops[i].lng, stops[j].lat, stops[j].lng) * 1000;
      if (d <= radiusM) union(i, j);
    }
  }

  // Group by root
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root) || [];
    arr.push(i);
    groups.set(root, arr);
  }

  const clusters: StopCluster[] = [];
  const rootNameCount = new Map<number, Map<string, number>>();

  // First pass: count name frequencies
  for (const [root, indices] of groups) {
    if (indices.length < 2) continue; // single stop → not a cluster
    const nameFreq = new Map<string, number>();
    for (const i of indices) {
      const name = stops[i].name;
      nameFreq.set(name, (nameFreq.get(name) || 0) + 1);
    }
    rootNameCount.set(root, nameFreq);
  }

  // Second pass: build clusters
  for (const [root, indices] of groups) {
    if (indices.length < 2) continue;

    const memberStops: Stop[] = indices.map(i => ({
      ...stops[i],
      distance: getDistance(userLat, userLng, stops[i].lat, stops[i].lng),
    })).sort((a, b) => (a.distance || 0) - (b.distance || 0));

    const nameFreq = rootNameCount.get(root)!;
    // Most frequent name, tie-broken by shortest name
    let hubName = memberStops[0].name;
    let bestFreq = 0;
    let bestLen = Infinity;
    for (const [name, freq] of nameFreq) {
      if (freq > bestFreq || (freq === bestFreq && name.length < bestLen)) {
        hubName = name;
        bestFreq = freq;
        bestLen = name.length;
      }
    }

    clusters.push({
      id: memberStops.map(s => s.id).sort().join('|'),
      hubName,
      stops: memberStops,
      departures: [],
      score: 0,
      departuresPerHour: 0,
      fetched: false,
    });
  }

  return clusters;
}

// ---------------------------------------------------------------------------
// Fetch merged departures for a cluster
// ---------------------------------------------------------------------------

export async function fetchClusterDepartures(
  cluster: StopCluster,
): Promise<{ departures: Arrival[]; departuresPerHour: number }> {
  const results = await Promise.all(
    cluster.stops.map(stop =>
      fetchDepartures(stop.id, stop.siriId)
        .then(deps => deps.slice(0, 10))
        .catch(() => [] as Arrival[]),
    ),
  );

  // Merge & dedupe by line + destination + departureTimeSeconds
  const seen = new Set<string>();
  const merged: Arrival[] = [];

  for (const deps of results) {
    for (const a of deps) {
      const key = `${a.line}|${a.destination}|${a.departureTimeSeconds ?? a.minutes}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(a);
    }
  }

  merged.sort((a, b) => {
    const ma = a.departureTimeSeconds ?? (Date.now() / 1000 + a.minutes * 60);
    const mb = b.departureTimeSeconds ?? (Date.now() / 1000 + b.minutes * 60);
    return ma - mb;
  });

  // Count departures in next 60 min
  const now = Date.now() / 1000;
  const oneHour = now + 3600;
  const dph = merged.filter(a => {
    const t = a.departureTimeSeconds ?? (now + a.minutes * 60);
    return t >= now && t <= oneHour;
  }).length;

  return { departures: merged, departuresPerHour: dph };
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Combined score: (1 / distance_meters) * departures_per_hour.
 * Higher = better stop to show first.
 */
export function scoreCluster(cluster: StopCluster, departuresPerHour: number): number {
  const nearestDist = cluster.stops[0]?.distance ?? 0.1;
  const distM = Math.max(1, nearestDist * 1000); // avoid div-by-zero
  return (1 / distM) * departuresPerHour;
}
