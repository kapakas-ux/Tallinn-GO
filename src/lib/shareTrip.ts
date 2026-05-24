import type { PlanItinerary } from '../types';
import { Capacitor } from '@capacitor/core';

/** Base URL for share links */
function getBaseUrl(): string {
  const origin = window.location.origin;
  if (origin.includes('gonow.ee')) return 'https://gonow.ee';
  if (!origin.includes('localhost') && !origin.includes('capacitor') && !origin.includes('127.0.0.1')) {
    return origin;
  }
  return 'https://gonow.ee';
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

/** Share via native share sheet (Capacitor), Web Share API, or clipboard */
export async function shareJourney(itinerary: PlanItinerary): Promise<boolean> {
  const url = buildShareUrl(itinerary);
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];
  const title = `${first.from.name} → ${last.to.name}`;

  // 1. Capacitor native Share (iOS/Android)
  if (Capacitor.isNativePlatform()) {
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title, text: title, url, dialogTitle: 'Share trip' });
      return true;
    } catch {}
  }

  // 2. Web Share API (PWA / modern browser)
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return true;
    } catch {}
  }

  // 3. Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
