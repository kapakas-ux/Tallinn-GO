import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Home, X, MapPin, Navigation, Loader2, Star, Trash2 } from 'lucide-react';
import { saveHome, clearHome, getHome, type HomeLocation } from '../services/homeService';
import { getFavorites } from '../services/favoritesService';
import { watchLocation } from '../services/locationService';
import type { Stop } from '../types';

interface GeocodedPlace {
  name: string;
  address: string;
  lat: number;
  lon: number;
}

let geocodeTimer: ReturnType<typeof setTimeout> | null = null;

async function geocodeAddress(query: string): Promise<GeocodedPlace[]> {
  if (query.length < 3) return [];
  try {
    const params = new URLSearchParams({
      q: query,
      lat: '59.437',
      lon: '24.745',
      zoom: '14',
      limit: '5',
    });
    const res = await fetch(`https://photon.komoot.io/api/?${params}`);
    const data = await res.json();
    if (!data.features) return [];
    return data.features
      .filter((f: any) => {
        const [lon, lat] = f.geometry.coordinates;
        return lat >= 57 && lat <= 60.5 && lon >= 21 && lon <= 28.5;
      })
      .map((f: any) => {
        const p = f.properties;
        const name = p.name || p.street || query;
        const parts = [p.housenumber, p.street, p.city || p.county].filter(Boolean);
        return {
          name,
          address: parts.join(', ') || p.label || '',
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        };
      });
  } catch {
    return [];
  }
}

interface Props {
  onClose: () => void;
  /** Called once a home is successfully saved. */
  onSaved?: (home: HomeLocation) => void;
}

export const HomeAddressPicker = ({ onClose, onSaved }: Props) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<GeocodedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [favorites] = useState<Stop[]>(() => getFavorites());
  const existingHome = getHome();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const cleanup = watchLocation((loc) => setUserCoords(loc));
    return cleanup;
  }, []);

  const onChange = (q: string) => {
    setQuery(q);
    if (geocodeTimer) clearTimeout(geocodeTimer);
    if (q.length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    geocodeTimer = setTimeout(async () => {
      const results = await geocodeAddress(q);
      setSuggestions(results);
      setSearching(false);
    }, 350);
  };

  const commit = (home: HomeLocation) => {
    saveHome(home);
    onSaved?.(home);
    onClose();
  };

  const useCurrentLocation = () => {
    if (!userCoords) return;
    commit({
      lat: userCoords.lat,
      lon: userCoords.lng,
      label: t('home.currentLocation'),
    });
  };

  const useFavorite = (stop: Stop) => {
    commit({
      lat: stop.lat,
      lon: stop.lng,
      label: stop.customName || stop.name,
    });
  };

  const usePlace = (place: GeocodedPlace) => {
    commit({
      lat: place.lat,
      lon: place.lon,
      label: place.address || place.name,
    });
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="settings-panel w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] border border-outline-variant/10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Home className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-headline font-black text-lg text-primary">{t('home.pickerTitle')}</h2>
              <p className="font-label text-[10px] text-secondary uppercase tracking-widest">{t('home.pickerSubtitle')}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-surface-container-low transition-colors text-secondary">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-5 border-b border-outline-variant/10">
          <div className="flex items-center gap-2 px-4 py-3 rounded-2xl bg-surface-container-high">
            <MapPin className="w-4 h-4 text-secondary shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => onChange(e.target.value)}
              placeholder={t('home.searchPlaceholder')}
              className="flex-1 bg-transparent outline-none font-headline text-sm text-primary placeholder:text-secondary"
            />
            {searching && <Loader2 className="w-4 h-4 text-secondary animate-spin" />}
            {query && !searching && (
              <button onClick={() => onChange('')} className="text-secondary"><X className="w-4 h-4" /></button>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-5 space-y-5">
          {/* Address suggestions */}
          {suggestions.length > 0 && (
            <div className="space-y-2">
              {suggestions.map((p, i) => (
                <button
                  key={i}
                  onClick={() => usePlace(p)}
                  className="w-full flex items-start gap-3 px-4 py-3 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left"
                >
                  <MapPin className="w-4 h-4 text-secondary mt-0.5 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-headline font-bold text-sm text-primary truncate">{p.name}</p>
                    {p.address && p.address !== p.name && (
                      <p className="font-label text-[11px] text-secondary truncate">{p.address}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Quick pick: current location */}
          {!query && (
            <div>
              <h3 className="font-headline font-bold text-[10px] text-secondary uppercase tracking-widest mb-2">
                {t('home.quickPicks')}
              </h3>
              <button
                onClick={useCurrentLocation}
                disabled={!userCoords}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left disabled:opacity-50"
              >
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                  <Navigation className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-headline font-bold text-sm text-primary">{t('home.useCurrent')}</p>
                  <p className="font-label text-[11px] text-secondary">{userCoords ? t('home.useCurrentDesc') : t('home.waitingForGps')}</p>
                </div>
              </button>
            </div>
          )}

          {/* Favorites */}
          {!query && favorites.length > 0 && (
            <div>
              <h3 className="font-headline font-bold text-[10px] text-secondary uppercase tracking-widest mb-2">
                {t('home.fromFavorites')}
              </h3>
              <div className="space-y-2">
                {favorites.map((fav) => (
                  <button
                    key={fav.id}
                    onClick={() => useFavorite(fav)}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low transition-colors text-left"
                  >
                    <div className="w-8 h-8 rounded-full bg-amber-400/10 flex items-center justify-center text-amber-500 shrink-0">
                      {fav.emoji ? <span className="text-base">{fav.emoji}</span> : <Star className="w-4 h-4 fill-current" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-headline font-bold text-sm text-primary truncate">{fav.customName || fav.name}</p>
                      {fav.desc && <p className="font-label text-[11px] text-secondary truncate">{fav.desc}</p>}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Existing home — clear option */}
          {existingHome && !query && (
            <div className="pt-2 border-t border-outline-variant/10">
              <p className="font-label text-[10px] text-secondary uppercase tracking-widest mb-2">
                {t('home.currentHome')}
              </p>
              <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-xl bg-primary/5 border border-primary/15">
                <div className="flex items-center gap-3 min-w-0">
                  <Home className="w-4 h-4 text-primary shrink-0" />
                  <p className="font-headline font-bold text-sm text-primary truncate">{existingHome.label}</p>
                </div>
                <button
                  onClick={() => { clearHome(); onClose(); }}
                  className="p-2 rounded-full text-error hover:bg-error/10 transition-colors shrink-0"
                  aria-label={t('home.clear')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
