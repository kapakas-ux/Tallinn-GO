import { Stop } from '../types';

const FAVORITES_KEY = 'transport_favorites';
const FAVORITES_CHANGED_EVENT = 'favorites_changed';

export const getFavorites = (): Stop[] => {
  const stored = localStorage.getItem(FAVORITES_KEY);
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error('Error parsing favorites from localStorage', e);
    return [];
  }
};

export const saveFavorites = (favorites: Stop[]) => {
  // Strip `distance` before persisting: it is a run-time computed field
  // relative to the user's current location and would be stale/wrong when
  // restored on a future session from localStorage.
  const clean = favorites.map(({ distance: _omit, ...rest }) => rest);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(clean));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<Stop[]>(FAVORITES_CHANGED_EVENT, { detail: clean }));
  }
};

export const subscribeFavorites = (onChange: (favorites: Stop[]) => void): (() => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handleFavoritesChanged = (event: Event) => {
    const customEvent = event as CustomEvent<Stop[]>;
    if (Array.isArray(customEvent.detail)) {
      onChange(customEvent.detail);
      return;
    }
    onChange(getFavorites());
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key === FAVORITES_KEY || event.key === null) {
      onChange(getFavorites());
    }
  };

  window.addEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged as EventListener);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(FAVORITES_CHANGED_EVENT, handleFavoritesChanged as EventListener);
    window.removeEventListener('storage', handleStorage);
  };
};

export const addFavorite = (stop: Stop) => {
  const favorites = getFavorites();
  if (!favorites.find(f => f.id === stop.id)) {
    const newFavorites = [...favorites, stop];
    saveFavorites(newFavorites);
    return newFavorites;
  }
  return favorites;
};

export const removeFavorite = (stopId: string) => {
  const favorites = getFavorites();
  const newFavorites = favorites.filter(f => f.id !== stopId);
  saveFavorites(newFavorites);
  return newFavorites;
};

export const isFavorite = (stopId: string): boolean => {
  const favorites = getFavorites();
  return !!favorites.find(f => f.id === stopId);
};

export const toggleFavorite = (stop: Stop): Stop[] => {
  if (isFavorite(stop.id)) {
    return removeFavorite(stop.id);
  } else {
    return addFavorite(stop);
  }
};

export const updateFavorite = (stopId: string, updates: Partial<Pick<Stop, 'customName' | 'emoji'>>): Stop[] => {
  const favorites = getFavorites();
  const newFavorites = favorites.map(f => f.id === stopId ? { ...f, ...updates } : f);
  saveFavorites(newFavorites);
  return newFavorites;
};
