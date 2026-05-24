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
export function buildShareUrl(itinerary: PlanItinerary, fromName?: string, toName?: string): string {
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];
  const from = encodeURIComponent(fromName || first.from.name || 'Start');
  const to = encodeURIComponent(toName || last.to.name || 'Destination');
  const base = getBaseUrl();
  return `${base}/share?from=${from}&flat=${first.from.lat.toFixed(5)}&flng=${first.from.lon.toFixed(5)}&to=${to}&tlat=${last.to.lat.toFixed(5)}&tlng=${last.to.lon.toFixed(5)}`;
}

/** Share via native share sheet or clipboard fallback */
export async function shareJourney(itinerary: PlanItinerary, fromName?: string, toName?: string): Promise<boolean> {
  const url = buildShareUrl(itinerary, fromName, toName);
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];
  const title = `${fromName || first.from.name} → ${toName || last.to.name}`;

  // 1. Capacitor native Share (Android/iOS) — uses global plugin registry
  const cap = (window as any).Capacitor;
  if (cap?.isNativePlatform?.()) {
    try {
      const SharePlugin = cap.Plugins?.Share;
      if (SharePlugin?.share) {
        await SharePlugin.share({ title, text: title, url, dialogTitle: title });
        return true;
      }
    } catch {}
  }

  // 2. Web Share API
  if (navigator.share) {
    try {
      await navigator.share({ title, text: title, url });
      return true;
    } catch {
      return false;
    }
  }

  // 3. Clipboard fallback
  try {
    await navigator.clipboard.writeText(url);
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-24 left-1/2 -translate-x-1/2 z-[200] bg-primary text-white px-4 py-2 rounded-full font-headline font-bold text-sm shadow-lg';
    toast.textContent = 'Link copied!';
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 300ms'; setTimeout(() => toast.remove(), 300); }, 1500);
    return true;
  } catch {
    return false;
  }
}
