import type { PlanItinerary } from '../types';

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

/** Share via Web Share API or clipboard fallback */
export async function shareJourney(itinerary: PlanItinerary): Promise<boolean> {
  const url = buildShareUrl(itinerary);
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];
  const title = `${first.from.name} → ${last.to.name}`;

  // navigator.share works on Android WebView, iOS Safari, and modern browsers
  // Must be called directly from a user gesture (click/tap handler)
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return true;
    } catch {
      // User cancelled — do NOT fall back to clipboard
      return false;
    }
  }

  // Clipboard fallback — show a brief visual feedback
  try {
    await navigator.clipboard.writeText(url);
    // Show a brief toast-like notification
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-primary text-white px-4 py-2 rounded-full font-headline font-bold text-sm shadow-lg animate-in fade-in slide-in-from-bottom-4';
    toast.textContent = 'Link copied!';
    document.body.appendChild(toast);
    setTimeout(() => { toast.classList.add('opacity-0', 'transition-opacity', 'duration-300'); setTimeout(() => toast.remove(), 300); }, 1500);
    return true;
  } catch {
    return false;
  }
}
