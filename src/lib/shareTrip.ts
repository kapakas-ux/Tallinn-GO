import type { PlanItinerary } from '../types';

/** Build a shareable URL with from/to names + coordinates */
export function buildShareUrl(itinerary: PlanItinerary): string {
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];
  const from = encodeURIComponent(first.from.name || 'Start');
  const to = encodeURIComponent(last.to.name || 'Destination');
  return `${window.location.origin}/share?from=${from}&flat=${first.from.lat.toFixed(5)}&flng=${first.from.lon.toFixed(5)}&to=${to}&tlat=${last.to.lat.toFixed(5)}&tlng=${last.to.lon.toFixed(5)}`;
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
