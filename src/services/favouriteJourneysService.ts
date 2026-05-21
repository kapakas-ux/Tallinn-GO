import type { PlanItinerary } from '../types';

// ─── Types ────────────────────────────────────────────────────────
export interface FavouriteJourney {
  id: string;
  fromName: string;
  toName: string;
  fromLat?: number;
  fromLon?: number;
  toLat?: number;
  toLon?: number;
  createdAt: number; // ms epoch
}

// ─── Storage ──────────────────────────────────────────────────────
const KEY = 'favourite_journeys';
const CHANGED_EVENT = 'favourite_journeys_changed';

export const getFavouriteJourneys = (): FavouriteJourney[] => {
  try {
    const s = localStorage.getItem(KEY);
    return s ? JSON.parse(s) : [];
  } catch { return []; }
};

const save = (list: FavouriteJourney[]) => {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: list }));
};

export const subscribeJourneys = (cb: (list: FavouriteJourney[]) => void) => {
  const h = (e: Event) => cb((e as CustomEvent<FavouriteJourney[]>).detail);
  window.addEventListener(CHANGED_EVENT, h);
  return () => window.removeEventListener(CHANGED_EVENT, h);
};

export const addFavouriteJourney = (from: string, to: string, fromLat?: number, fromLon?: number, toLat?: number, toLon?: number) => {
  const list = getFavouriteJourneys();
  const exists = list.find(j => j.fromName === from && j.toName === to);
  if (exists) return list;
  const item: FavouriteJourney = {
    id: Math.random().toString(36).slice(2),
    fromName: from,
    toName: to,
    fromLat, fromLon,
    toLat, toLon,
    createdAt: Date.now(),
  };
  const next = [item, ...list].slice(0, 10); // max 10
  save(next);
  return next;
};

export const removeFavouriteJourney = (id: string) => {
  const list = getFavouriteJourneys().filter(j => j.id !== id);
  save(list);
  return list;
};

export const isJourneyFavourited = (from: string, to: string) =>
  getFavouriteJourneys().some(j => j.fromName === from && j.toName === to);

export const toggleFavouriteJourney = (from: string, to: string, fromLat?: number, fromLon?: number, toLat?: number, toLon?: number) => {
  const existing = getFavouriteJourneys().find(j => j.fromName === from && j.toName === to);
  if (existing) return removeFavouriteJourney(existing.id);
  return addFavouriteJourney(from, to, fromLat, fromLon, toLat, toLon);
};
