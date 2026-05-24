import type { PlanItinerary } from '../types';

/** Base URL for share links */
function getBaseUrl(): string {
  const origin = window.location.origin;
  // If running on a real domain (production web), use it directly
  if (!origin.includes('localhost') && !origin.includes('capacitor') && !origin.includes('127.0.0.1')) {
    return origin;
  }
  // Dev / Capacitor native — use the APP_URL env var (set in .env or Vercel)
  const envUrl = (import.meta as any).env?.APP_URL || '';
  if (envUrl && !envUrl.includes('MY_APP_URL')) {
    return envUrl.replace(/\/+$/, '');
  }
  return origin; // fallback
}

/** Build a shareable URL with from/to names + coordinates */
export function buildShareUrl(itinerary: PlanItinerary): string {
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];
  const from = encodeURIComponent(first.from.name || 'Start');
  const to = encodeURIComponent(last.to.name || 'Destination');
  const base = getBaseUrl();
  return `${base}/share?from=${from}&flat=${first.from.lat.toFixed(5)}&flng=${first.from.lon.toFixed(5)}&to=${to}&tlat=${last.to.lat.toFixed(5)}&tlng=${last.to.lon.toFixed(5)}`;
}

/** Share via Web Share API, clipboard fallback. Returns true if shared. */
export async function shareJourney(itinerary: PlanItinerary): Promise<boolean> {
  const url = buildShareUrl(itinerary);
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];

  if (navigator.share) {
    try {
      await navigator.share({
        title: `${first.from.name} → ${last.to.name}`,
        text: `${first.from.name} → ${last.to.name}`,
        url,
      });
      return true;
    } catch {
      return false;
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
