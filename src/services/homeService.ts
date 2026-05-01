/**
 * Persistent "home" location used by the "Take me home" feature.
 * Stored in localStorage; emits a custom event so multiple components stay
 * in sync without having to lift state to a global provider.
 */

const HOME_KEY = 'tallinn_go_home_location';
const HOME_CHANGED_EVENT = 'home_location_changed';

export interface HomeLocation {
  lat: number;
  lon: number;
  /** Human-readable label shown on the chip, e.g. "Maakri 3, Tallinn". */
  label: string;
}

export function getHome(): HomeLocation | null {
  try {
    const raw = localStorage.getItem(HOME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.lat === 'number' &&
      typeof parsed?.lon === 'number' &&
      typeof parsed?.label === 'string'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveHome(home: HomeLocation): void {
  localStorage.setItem(HOME_KEY, JSON.stringify(home));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<HomeLocation>(HOME_CHANGED_EVENT, { detail: home }));
  }
}

export function clearHome(): void {
  localStorage.removeItem(HOME_KEY);
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<HomeLocation | null>(HOME_CHANGED_EVENT, { detail: null }));
  }
}

export function subscribeHome(onChange: (home: HomeLocation | null) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => onChange(getHome());
  window.addEventListener(HOME_CHANGED_EVENT, handler);
  window.addEventListener('storage', (e) => {
    if (e.key === HOME_KEY || e.key === null) handler();
  });
  return () => {
    window.removeEventListener(HOME_CHANGED_EVENT, handler);
    window.removeEventListener('storage', handler as EventListener);
  };
}
