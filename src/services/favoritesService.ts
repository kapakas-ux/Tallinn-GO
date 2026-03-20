import { Stop } from '../types';

const FAVORITES_KEY = 'transport_favorites';

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
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites));
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
