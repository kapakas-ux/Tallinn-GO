import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  MapPin, Navigation, ArrowUpDown, Bus, TrainFront as Tram, TrainFront,
  Footprints, Search, X, Loader2, AlertCircle, Clock, ChevronDown, ChevronUp, Map as MapIcon, Route as RouteIcon,
  CalendarDays
} from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchStops, planJourney } from '../services/transportService';
import { watchLocation } from '../services/locationService';
import { decodePolyline } from '../lib/geo';
import { darknessOverlapMs } from '../services/sunTimesService';
import type { Stop, PlanItinerary, LegMode } from '../types';

// ─── geocoding ──────────────────────────────────────────────────
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
        // Only keep results in/near Estonia (lat ~57-60, lon ~21-28)
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

// ─── search history ─────────────────────────────────────────────
interface SearchEntry { from: string; to: string; timestamp: number }
const HISTORY_KEY = 'planner_search_history';
const MAX_HISTORY = 6;

function getSearchHistory(): SearchEntry[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch { return []; }
}
function saveSearch(from: string, to: string) {
  const history = getSearchHistory().filter(h => !(h.from === from && h.to === to));
  history.unshift({ from, to, timestamp: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

const fmtDuration = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
};

const fmtDistance = (metres: number) =>
  metres < 1000 ? `${Math.round(metres)}m` : `${(metres / 1000).toFixed(1)}km`;

function modeColor(mode: LegMode): string {
  switch (mode) {
    case 'TRAM': return '#DC143C';
    case 'RAIL': return '#f37021';
    case 'BUS':  return '#003571';
    default:     return '#6b7280';
  }
}

function ModeIcon({ mode, className }: { mode: LegMode; className?: string }) {
  if (mode === 'WALK') return <Footprints className={className} />;
  if (mode === 'TRAM') return <Tram className={className} />;
  if (mode === 'RAIL') return <TrainFront className={className} />;
  return <Bus className={className} />;
}

// ─── scroll wheel picker ────────────────────────────────────────────────────

const ITEM_H = 40;          // px per row
const VISIBLE = 5;          // rows visible

const ScrollPicker: React.FC<{
  items: string[];
  value: string;
  onChange: (v: string) => void;
}> = ({ items, value, onChange }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const isUserScroll = useRef(true);

  // Scroll to selected value on mount / value change
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const idx = items.indexOf(value);
    if (idx < 0) return;
    isUserScroll.current = false;
    el.scrollTop = idx * ITEM_H;
    requestAnimationFrame(() => { isUserScroll.current = true; });
  }, [value, items]);

  // Snap & pick value on scroll end
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!isUserScroll.current) return;
        const idx = Math.round(el.scrollTop / ITEM_H);
        const clamped = Math.max(0, Math.min(items.length - 1, idx));
        el.scrollTo({ top: clamped * ITEM_H, behavior: 'smooth' });
        if (items[clamped] !== value) onChange(items[clamped]);
      }, 80);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(timer); el.removeEventListener('scroll', onScroll); };
  }, [items, value, onChange]);

  const pad = (VISIBLE - 1) / 2;  // blank rows above/below

  return (
    <div className="relative overflow-hidden" style={{ height: ITEM_H * VISIBLE }}>
      {/* highlight band */}
      <div
        className="absolute inset-x-1 rounded-[10px] bg-primary/10 pointer-events-none z-0"
        style={{ top: ITEM_H * pad, height: ITEM_H }}
      />
      <div
        ref={listRef}
        className="h-full overflow-y-auto no-scrollbar relative z-10"
        style={{ scrollSnapType: 'y mandatory' }}
      >
        {Array.from({ length: pad }).map((_, i) => (
          <div key={`pt-${i}`} style={{ height: ITEM_H }} />
        ))}
        {items.map(item => (
          <div
            key={item}
            className={cn(
              'flex items-center justify-center font-headline font-bold text-lg transition-colors cursor-pointer select-none',
              item === value ? 'text-primary' : 'text-secondary/40'
            )}
            style={{ height: ITEM_H, scrollSnapAlign: 'start' }}
            onClick={() => onChange(item)}
          >
            {item}
          </div>
        ))}
        {Array.from({ length: pad }).map((_, i) => (
          <div key={`pb-${i}`} style={{ height: ITEM_H }} />
        ))}
      </div>
    </div>
  );
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

// ─── mini-map ───────────────────────────────────────────────────────────────

const ItineraryMap: React.FC<{ itinerary: PlanItinerary }> = ({ itinerary }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      attributionControl: false,
      interactive: false,
    });

    map.on('load', () => {
      const allCoords: [number, number][] = [];

      itinerary.legs.forEach((leg, i) => {
        const coords = decodePolyline(leg.legGeometry.points);
        if (!coords.length) return;
        allCoords.push(...coords);

        const id = `leg-${i}`;
        map.addSource(id, {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
        });

        if (leg.mode === 'WALK') {
          map.addLayer({ id: `${id}-line`, type: 'line', source: id,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#9ca3af', 'line-width': 2, 'line-dasharray': [2, 3] } });
        } else {
          map.addLayer({ id: `${id}-bg`, type: 'line', source: id,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 6 } });
          map.addLayer({ id: `${id}-line`, type: 'line', source: id,
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: { 'line-color': modeColor(leg.mode), 'line-width': 4 } });
        }
      });

      const first = itinerary.legs[0];
      const last = itinerary.legs[itinerary.legs.length - 1];
      if (first) new maplibregl.Marker({ color: '#003571' }).setLngLat([first.from.lon, first.from.lat]).addTo(map);
      if (last)  new maplibregl.Marker({ color: '#DC143C' }).setLngLat([last.to.lon, last.to.lat]).addTo(map);

      if (allCoords.length) {
        const lngs = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 24, duration: 0 });
      }
    });

    return () => { map.remove(); };
  }, [itinerary]);

  return <div ref={containerRef} className="w-full rounded-xl overflow-hidden" style={{ height: 180 }} />;
};

// â”€â”€â”€ itinerary card â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface CardProps {
  itinerary: PlanItinerary;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  onViewOnMap: () => void;
}

const ItineraryCard: React.FC<CardProps> = ({ itinerary, index, expanded, onToggle, onViewOnMap }) => {
  const { t } = useTranslation();
  const leavesInMin = Math.round((itinerary.startTime - Date.now()) / 60000);
  const label = index === 0 ? t('planner.fastest') : index === 1 ? t('planner.alternative') : t('planner.lessWalking');

  return (
    <div
      className={cn(
        'bg-surface-container-lowest rounded-[20px] shadow-sm border border-outline-variant/10 overflow-hidden transition-all cursor-pointer',
        expanded && 'ring-2 ring-primary border-transparent'
      )}
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <span className="text-4xl font-black font-headline tracking-tighter text-primary leading-none">
              {fmtDuration(itinerary.duration)}
            </span>
            <p className="font-label text-[10px] uppercase tracking-widest text-secondary font-bold mt-0.5">
              {label} &middot; {itinerary.transfers === 0 ? t('planner.direct') : t('planner.transfer', { count: itinerary.transfers })}
            </p>
          </div>
          <div className="text-right">
            <p className="font-headline font-bold text-base text-on-surface">
              {fmtTime(itinerary.startTime)} &ndash; {fmtTime(itinerary.endTime)}
            </p>
            <p className="font-label text-[10px] text-secondary mt-0.5">
              {leavesInMin > 0 ? t('planner.leavesIn', { min: leavesInMin }) : leavesInMin === 0 ? t('planner.leavingNow') : t('planner.departed')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {itinerary.legs.map((leg, i) => (
            <React.Fragment key={i}>
              {leg.mode === 'WALK' ? (
                <div className="flex items-center gap-1 text-secondary">
                  <Footprints className="w-3 h-3" />
                  <span className="font-label text-[9px] font-bold uppercase">{fmtDistance(leg.distance)}</span>
                </div>
              ) : (
                <div
                  className="h-6 px-2 rounded-full flex items-center gap-1 text-white text-[10px] font-label font-bold"
                  style={{ backgroundColor: modeColor(leg.mode) }}
                >
                  <ModeIcon mode={leg.mode} className="w-3 h-3" />
                  {leg.routeShortName}
                </div>
              )}
              {i < itinerary.legs.length - 1 && <div className="w-2 h-px bg-outline-variant" />}
            </React.Fragment>
          ))}
          {itinerary.walkDistance > 0 && (
            <span className="ml-auto font-label text-[9px] text-secondary uppercase tracking-wide">
              {t('planner.walkTotal', { distance: fmtDistance(itinerary.walkDistance) })}
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div
          className="border-t border-outline-variant/10 animate-in fade-in slide-in-from-top-2 duration-200"
          onClick={e => e.stopPropagation()}
        >
          <div className="px-4 pt-4">
            <ItineraryMap itinerary={itinerary} />
          </div>

          <div className="px-4 pt-4 pb-2 space-y-0">
            {itinerary.legs.map((leg, i) => (
              <div key={i} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-white"
                    style={{ backgroundColor: modeColor(leg.mode) }}
                  >
                    <ModeIcon mode={leg.mode} className="w-4 h-4" />
                  </div>
                  {i < itinerary.legs.length - 1 && (
                    <div className="w-px flex-1 bg-outline-variant/30 my-1" style={{ minHeight: 16 }} />
                  )}
                </div>
                <div className="flex-1 pb-4">
                  <div className="flex items-baseline gap-2">
                    <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-wide">
                      {fmtTime(leg.startTime)}
                    </span>
                    <span className="font-headline font-bold text-sm text-on-surface">
                      {!leg.from.name || leg.from.name === 'Origin' ? t('planner.origin') : leg.from.name}
                    </span>
                  </div>
                  {leg.mode !== 'WALK' ? (
                    <p className="text-xs text-secondary mt-0.5">
                      {leg.mode === 'TRAM' ? t('planner.tram') : leg.mode === 'RAIL' ? t('planner.train') : t('planner.bus')} {leg.routeShortName}
                      {leg.headsign ? ` â†’ ${leg.headsign}` : ''}
                    </p>
                  ) : (
                    <>
                      <p className="text-xs text-secondary mt-0.5">
                        {t('planner.walkLeg', { distance: fmtDistance(leg.distance), duration: Math.ceil(leg.duration / 60) })}
                      </p>
                      {(() => {
                        // Darkness warning — show when ≥25% of the walk crosses civil twilight and leg ≥100 m
                        if (leg.distance < 100) return null;
                        const darkMs = darknessOverlapMs(leg.startTime, leg.endTime, leg.from.lat, leg.from.lon);
                        if (darkMs <= 0) return null;
                        const totalMs = Math.max(1, leg.endTime - leg.startTime);
                        if (darkMs / totalMs < 0.25) return null;
                        const darkMeters = Math.round((darkMs / totalMs) * leg.distance);
                        return (
                          <span className="inline-flex items-center gap-1 mt-1 rounded-full px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-500/20">
                            <span aria-hidden>🌙</span>
                            {t('planner.walkInDarkness', { distance: fmtDistance(darkMeters) })}
                          </span>
                        );
                      })()}
                    </>
                  )}
                </div>
              </div>
            ))}
            {itinerary.legs.length > 0 && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-error flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-white" />
                </div>
                <div className="flex-1 pb-4">
                  <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-wide">
                    {fmtTime(itinerary.endTime)}
                  </span>
                  <span className="font-headline font-bold text-sm text-on-surface ml-2">
                    {!itinerary.legs[itinerary.legs.length - 1].to.name || itinerary.legs[itinerary.legs.length - 1].to.name === 'Destination' ? t('planner.destination') : itinerary.legs[itinerary.legs.length - 1].to.name}
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 pb-4">
            <button
              onClick={onViewOnMap}
              className="w-full py-3 rounded-[16px] bg-primary text-white font-headline font-bold text-sm flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <MapIcon className="w-4 h-4" />
              {t('planner.viewOnMap')}
            </button>
          </div>
        </div>
      )}

      <div className="flex justify-center pb-2 text-secondary pointer-events-none">
        {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </div>
    </div>
  );
};

// â”€â”€â”€ main page â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export const Planner = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [from, setFrom] = useState(t('planner.currentLocation'));
  const [to, setTo] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [stops, setStops] = useState<Stop[]>([]);
  const [suggestions, setSuggestions] = useState<Stop[]>([]);
  const [activeInput, setActiveInput] = useState<'from' | 'to' | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [itineraries, setItineraries] = useState<PlanItinerary[]>([]);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [searchHistory, setSearchHistory] = useState<SearchEntry[]>(() => getSearchHistory());

  // Time chooser state
  type TimeMode = 'now' | 'leave-at' | 'arrive-at';
  const [timeMode, setTimeMode] = useState<TimeMode>('now');
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  });
  const [selectedTime, setSelectedTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [timePickerOpen, setTimePickerOpen] = useState<false | 'date' | 'time'>(false);
  const dateInputRef = useRef<HTMLInputElement>(null);

  // Track the exact selected stop objects to avoid ambiguity when names collide
  const selectedFromStop = useRef<Stop | null>(null);
  const selectedToStop = useRef<Stop | null>(null);
  // Track geocoded address selections
  const selectedFromPlace = useRef<GeocodedPlace | null>(null);
  const selectedToPlace = useRef<GeocodedPlace | null>(null);
  const [addressSuggestions, setAddressSuggestions] = useState<GeocodedPlace[]>([]);

  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    fetchStops().then(setStops);
    const cleanup = watchLocation((loc, sim) => { setUserCoords(loc); setIsSimulated(sim); });
    return cleanup;
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node))
        setActiveInput(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSearch = (query: string, type: 'from' | 'to') => {
    if (type === 'from') { setFrom(query); selectedFromStop.current = null; selectedFromPlace.current = null; }
    else { setTo(query); selectedToStop.current = null; selectedToPlace.current = null; }
    if (query.length > 1) {
      setSuggestions(stops.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6));
      setActiveInput(type);
      // Geocode addresses in parallel (debounced)
      if (geocodeTimer) clearTimeout(geocodeTimer);
      geocodeTimer = setTimeout(async () => {
        const places = await geocodeAddress(query);
        setAddressSuggestions(places);
      }, 400);
    } else {
      setSuggestions([]);
      setAddressSuggestions([]);
      setActiveInput(null);
    }
  };

  const selectSuggestion = (stop: Stop) => {
    if (activeInput === 'from') { setFrom(stop.name); selectedFromStop.current = stop; selectedFromPlace.current = null; }
    else { setTo(stop.name); selectedToStop.current = stop; selectedToPlace.current = null; }
    setActiveInput(null);
    setSuggestions([]);
    setAddressSuggestions([]);
  };

  const selectPlace = (place: GeocodedPlace) => {
    const label = place.address || place.name;
    if (activeInput === 'from') { setFrom(label); selectedFromPlace.current = place; selectedFromStop.current = null; }
    else { setTo(label); selectedToPlace.current = place; selectedToStop.current = null; }
    setActiveInput(null);
    setSuggestions([]);
    setAddressSuggestions([]);
  };

  const swapLocations = () => {
    const tmp = from; setFrom(to); setTo(tmp);
    const tmpStop = selectedFromStop.current; selectedFromStop.current = selectedToStop.current; selectedToStop.current = tmpStop;
    const tmpPlace = selectedFromPlace.current; selectedFromPlace.current = selectedToPlace.current; selectedToPlace.current = tmpPlace;
  };

  const resolveCoords = useCallback((name: string, type: 'from' | 'to'): { lat: number; lon: number } | null => {
    if (name === t('planner.currentLocation')) {
      return userCoords ? { lat: userCoords.lat, lon: userCoords.lng } : null;
    }
    // Use the exact stop that was selected from the dropdown first
    const pinned = type === 'from' ? selectedFromStop.current : selectedToStop.current;
    if (pinned) return { lat: pinned.lat, lon: pinned.lng };
    // Check if a geocoded address was selected
    const place = type === 'from' ? selectedFromPlace.current : selectedToPlace.current;
    if (place) return { lat: place.lat, lon: place.lon };
    // Fall back to first name match in stops
    const stop = stops.find(s => s.name === name);
    return stop ? { lat: stop.lat, lon: stop.lng } : null;
  }, [stops, userCoords, t]);

  const findRoutes = async (overrideFrom?: string, overrideTo?: string) => {
    const searchFrom = overrideFrom ?? from;
    const searchTo = overrideTo ?? to;
    setError(null);
    let fromCoords = resolveCoords(searchFrom, 'from');
    let toCoords = resolveCoords(searchTo, 'to');
    // Auto-geocode typed text that didn't match any stop
    if (!fromCoords && searchFrom !== t('planner.currentLocation')) {
      const places = await geocodeAddress(searchFrom);
      if (places.length) { fromCoords = { lat: places[0].lat, lon: places[0].lon }; selectedFromPlace.current = places[0]; }
    }
    if (!toCoords) {
      const places = await geocodeAddress(searchTo);
      if (places.length) { toCoords = { lat: places[0].lat, lon: places[0].lon }; selectedToPlace.current = places[0]; }
    }
    if (!fromCoords) { setError(searchFrom === t('planner.currentLocation') ? t('planner.waitingGps') : t('planner.stopNotFound', { name: searchFrom })); return; }
    if (!toCoords) { setError(t('planner.stopNotFound', { name: searchTo })); return; }
    if (fromCoords.lat === toCoords.lat && fromCoords.lon === toCoords.lon) { setError(t('planner.sameOriginDest')); return; }

    setIsLoading(true);
    setItineraries([]);
    setExpandedIndex(null);
    try {
      const timeOptions = timeMode !== 'now'
        ? { date: selectedDate, time: selectedTime, arriveBy: timeMode === 'arrive-at' }
        : undefined;
      const results = await planJourney(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon, 3, timeOptions);
      if (!results.length) setError(t('map.noRoutes'));
      else { setItineraries(results); setExpandedIndex(0); saveSearch(searchFrom, searchTo); setSearchHistory(getSearchHistory()); }
    } catch (e) {
      console.error(e);
      setError(t('map.connectionError'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewOnMap = (itinerary: PlanItinerary) => {
    sessionStorage.setItem('planner_journey', JSON.stringify(itinerary));
    navigate('/map?journey=1');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8 pt-4" ref={containerRef}>
      <h1 className="font-headline font-black text-2xl mb-6 px-2 gradient-text">{t('planner.title')}</h1>

      {/* Search inputs */}
      <section className={cn("relative bg-surface-container-low p-4 rounded-[20px] mb-6 shadow-sm", activeInput && "z-20")}>
        <div className="flex flex-col gap-3 relative">
          {/* FROM */}
          <div className={cn(
            'flex items-center gap-3 bg-surface-container-lowest p-4 rounded-[16px] shadow-sm border-2 transition-all',
            activeInput === 'from' ? 'border-primary' : 'border-transparent'
          )}>
            <Navigation className={cn('w-5 h-5 shrink-0', from === t('planner.currentLocation') ? 'text-blue-500 fill-blue-500' : 'text-secondary')} />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-label uppercase tracking-widest text-secondary mb-0.5">{t('planner.from')}</p>
              <input
                className="w-full bg-transparent border-none p-0 focus:ring-0 outline-none font-headline font-semibold text-on-surface placeholder:text-outline-variant text-sm"
                value={from}
                onChange={e => handleSearch(e.target.value, 'from')}
                onFocus={() => {
                  setActiveInput('from');
                  if (from === t('planner.currentLocation')) { setFrom(''); setSuggestions(stops.slice(0, 6)); }
                  else handleSearch(from, 'from');
                }}
                placeholder={t('planner.fromPlaceholder')}
              />
            </div>
            {from !== t('planner.currentLocation') && from !== '' && (
              <button onClick={() => setFrom('')} className="text-secondary shrink-0"><X className="w-4 h-4" /></button>
            )}
          </div>

          {/* Swap */}
          <button
            onClick={swapLocations}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-primary text-white p-2.5 rounded-full shadow-lg active:scale-90 transition-all"
          >
            <ArrowUpDown className="w-4 h-4" />
          </button>

          {/* TO */}
          <div className={cn(
            'flex items-center gap-3 bg-surface-container-lowest p-4 rounded-[16px] shadow-sm border-2 transition-all',
            activeInput === 'to' ? 'border-primary' : 'border-transparent'
          )}>
            <MapPin className="text-error w-5 h-5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-label uppercase tracking-widest text-secondary mb-0.5">{t('planner.to')}</p>
              <input
                className="w-full bg-transparent border-none p-0 focus:ring-0 outline-none font-headline font-semibold text-on-surface placeholder:text-outline-variant text-sm"
                value={to}
                onChange={e => handleSearch(e.target.value, 'to')}
                onFocus={() => { setActiveInput('to'); handleSearch(to, 'to'); }}
                placeholder={t('planner.toPlaceholder')}
              />
            </div>
            {to !== '' && (
              <button onClick={() => setTo('')} className="text-secondary shrink-0"><X className="w-4 h-4" /></button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {activeInput && (suggestions.length > 0 || addressSuggestions.length > 0 || activeInput === 'from') && (
            <div className="dropdown-popover absolute left-0 right-0 top-full mt-2 rounded-[16px] shadow-2xl z-50 overflow-hidden max-h-80 overflow-y-auto">
              {activeInput === 'from' && from !== t('planner.currentLocation') && (
                <button
                  onClick={() => { setFrom(t('planner.currentLocation')); selectedFromStop.current = null; selectedFromPlace.current = null; setActiveInput(null); setSuggestions([]); setAddressSuggestions([]); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-outline-variant/10"
                >
                  <div className="bg-blue-500/10 p-2 rounded-full shrink-0">
                    <Navigation className="w-4 h-4 text-blue-500 fill-blue-500" />
                  </div>
                  <div>
                    <p className="font-headline font-bold text-blue-400 text-sm">
                      {isSimulated ? t('planner.simulateLocation') : t('planner.useMyLocation')}
                    </p>
                    <p className="text-[9px] font-label uppercase tracking-wider text-blue-500/60">
                      {isSimulated ? t('planner.tallinnCenter') : t('planner.realtimeGps')}
                    </p>
                  </div>
                </button>
              )}
              {suggestions.map(stop => (
                <button
                  key={stop.id}
                  onClick={() => selectSuggestion(stop)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-outline-variant/10 last:border-0"
                >
                  <div className="bg-surface-container-high p-2 rounded-full shrink-0">
                    <MapPin className="w-4 h-4 text-secondary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-headline font-bold text-on-surface text-sm truncate">{stop.name}</p>
                    <p className="text-[9px] font-label text-secondary truncate mt-0.5">
                      {[stop.desc, stop.siriId ? `#${stop.siriId}` : null]
                        .filter(Boolean).join(' \u00b7 ') || t('planner.stop')}
                    </p>
                  </div>
                  {stop.modes && stop.modes.length > 0 && (
                    <div className="flex gap-1 shrink-0">
                      {stop.modes.slice(0, 2).map(m => (
                        <span key={m} className="text-[8px] font-label font-bold uppercase px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: m === 'tram' ? '#DC143C22' : '#00357122', color: m === 'tram' ? '#DC143C' : '#6BA3E0' }}>
                          {m === 'regional' ? 'reg' : m}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
              ))}
              {/* Address suggestions from geocoding */}
              {addressSuggestions.length > 0 && (
                <>
                  {suggestions.length > 0 && (
                    <div className="px-4 py-1.5 border-t border-outline-variant/10">
                      <p className="text-[8px] font-label font-bold uppercase tracking-widest text-secondary/60">{t('planner.addresses')}</p>
                    </div>
                  )}
                  {addressSuggestions.map((place, idx) => (
                    <button
                      key={`addr-${idx}`}
                      onClick={() => selectPlace(place)}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 transition-colors text-left border-b border-outline-variant/10 last:border-0"
                    >
                      <div className="bg-emerald-500/10 p-2 rounded-full shrink-0">
                        <Search className="w-4 h-4 text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-headline font-bold text-on-surface text-sm truncate">{place.name}</p>
                        <p className="text-[9px] font-label text-secondary truncate mt-0.5">{place.address}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {/* Time chooser */}
        <div className="mt-3">
          {/* Mode toggle pills */}
          <div className="flex gap-1.5 bg-surface-container-lowest rounded-[14px] p-1 shadow-sm">
            {([
              { key: 'now' as const, label: t('planner.leaveNow'), icon: '⚡' },
              { key: 'leave-at' as const, label: t('planner.leaveAt'), icon: '🕐' },
              { key: 'arrive-at' as const, label: t('planner.arriveBy'), icon: '🏁' },
            ]).map(opt => (
              <button
                key={opt.key}
                onClick={() => {
                  setTimeMode(opt.key);
                  if (opt.key !== 'now') {
                    const d = new Date();
                    setSelectedDate(d.toISOString().slice(0, 10));
                    setSelectedTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
                  } else {
                    setTimePickerOpen(false);
                  }
                }}
                className={cn(
                  'flex-1 py-2.5 rounded-[10px] font-label font-bold text-[10px] uppercase tracking-wider transition-all',
                  timeMode === opt.key
                    ? 'bg-primary text-white shadow-md'
                    : 'text-secondary hover:text-on-surface'
                )}
              >
                <span className="mr-1">{opt.icon}</span>
                {opt.label}
              </button>
            ))}
          </div>

          {/* Compact date/time display – tap to open picker */}
          {timeMode !== 'now' && (
            <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex gap-2 items-center">
                {/* Date chip – opens native date picker directly */}
                <button
                  type="button"
                  onClick={() => dateInputRef.current?.showPicker()}
                  className="flex items-center gap-2 bg-surface-container-lowest px-3.5 py-2.5 rounded-[12px] shadow-sm transition-all active:scale-[0.97] cursor-pointer relative overflow-hidden shrink-0"
                >
                  <CalendarDays className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-headline font-bold text-sm text-on-surface whitespace-nowrap">
                    {selectedDate === new Date().toISOString().slice(0, 10)
                      ? t('planner.today')
                      : new Date(selectedDate + 'T00:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}
                  </span>
                  <input
                    ref={dateInputRef}
                    type="date"
                    value={selectedDate}
                    onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}
                    min={new Date().toISOString().slice(0, 10)}
                    className="absolute inset-0 opacity-0 pointer-events-none"
                    tabIndex={-1}
                  />
                </button>
                {/* Time chip */}
                <button
                  onClick={() => setTimePickerOpen(timePickerOpen === 'time' ? false : 'time')}
                  className={cn(
                    'flex items-center gap-2 bg-surface-container-lowest px-3.5 py-2.5 rounded-[12px] shadow-sm transition-all active:scale-[0.97] shrink-0',
                    timePickerOpen === 'time' && 'ring-2 ring-primary'
                  )}
                >
                  <Clock className="w-4 h-4 text-primary shrink-0" />
                  <span className="font-headline font-bold text-sm text-on-surface">{selectedTime}</span>
                </button>
                {/* Quick pills */}
                <div className="flex gap-1.5 items-center ml-auto flex-wrap justify-end">
                  {(() => {
                    const now = new Date();
                    const pills: { label: string; date: string; time: string }[] = [];
                    for (const offset of [15, 30, 60]) {
                      const d = new Date(now.getTime() + offset * 60000);
                      pills.push({
                        label: offset < 60 ? `+${offset}m` : `+1h`,
                        date: d.toISOString().slice(0, 10),
                        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
                      });
                    }
                    const tmrw = new Date(now);
                    tmrw.setDate(tmrw.getDate() + 1);
                    pills.push({
                      label: t('planner.tmrw'),
                      date: tmrw.toISOString().slice(0, 10),
                      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                    });
                    return pills.map(p => (
                      <button
                        key={p.label}
                        onClick={() => { setSelectedDate(p.date); setSelectedTime(p.time); setTimePickerOpen(false); }}
                        className={cn(
                          'px-2.5 py-1.5 rounded-full text-[9px] font-label font-bold uppercase tracking-wider transition-all',
                          selectedDate === p.date && selectedTime === p.time
                            ? 'bg-primary/15 text-primary'
                            : 'bg-surface-container-low text-secondary hover:text-on-surface'
                        )}
                      >
                        {p.label}
                      </button>
                    ));
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Time picker popup */}
          {timePickerOpen === 'time' && (
            <div className="mt-2 bg-surface-container-lowest rounded-[14px] shadow-lg animate-in fade-in slide-in-from-top-2 duration-150 overflow-hidden">
              <div className="flex items-center">
                <div className="flex-1">
                  <ScrollPicker
                    items={HOURS}
                    value={selectedTime.split(':')[0]}
                    onChange={h => setSelectedTime(`${h}:${selectedTime.split(':')[1]}`)}
                  />
                </div>
                <span className="font-headline font-black text-2xl text-on-surface px-1 shrink-0">:</span>
                <div className="flex-1">
                  <ScrollPicker
                    items={MINUTES}
                    value={selectedTime.split(':')[1]}
                    onChange={m => setSelectedTime(`${selectedTime.split(':')[0]}:${m}`)}
                  />
                </div>
              </div>
              <button
                onClick={() => setTimePickerOpen(false)}
                className="w-full py-2.5 text-primary font-label font-bold text-xs uppercase tracking-widest border-t border-outline-variant/10"
              >
                {t('common.done')}
              </button>
            </div>
          )}
        </div>

        <button
          onClick={() => findRoutes()}
          disabled={isLoading || !from || !to}
          className="w-full mt-4 bg-primary text-white py-4 rounded-[16px] font-headline font-black text-base shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <><Loader2 className="w-5 h-5 animate-spin" />{t('planner.planningRoute')}</>
          ) : (
            <><Search className="w-5 h-5" />{t('planner.findRoutes')}</>
          )}
        </button>
      </section>

      {/* Recent searches */}
      {searchHistory.length > 0 && itineraries.length === 0 && !isLoading && (
        <section className="mb-6">
          <div className="flex items-center justify-between px-2 mb-2">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5 text-secondary" />
              <h2 className="font-label font-bold text-[10px] uppercase tracking-widest text-secondary">{t('planner.recent')}</h2>
            </div>
            <button
              onClick={() => { localStorage.removeItem(HISTORY_KEY); setSearchHistory([]); }}
              className="text-[9px] font-label text-secondary/50 uppercase tracking-wider hover:text-primary transition-colors"
            >
              {t('planner.clear')}
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {searchHistory.slice(0, 6).map((entry, i) => (
              <button
                key={i}
                onClick={() => {
                  setFrom(entry.from);
                  setTo(entry.to);
                  selectedFromStop.current = null;
                  selectedToStop.current = null;
                  findRoutes(entry.from, entry.to);
                }}
                className="flex items-center gap-3 bg-surface-container-lowest p-3 rounded-[14px] shadow-sm hover:bg-surface-container-low transition-all text-left active:scale-[0.98]"
              >
                <div className="bg-surface-container-high p-2 rounded-full shrink-0">
                  <RouteIcon className="w-4 h-4 text-secondary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-headline font-bold text-sm text-on-surface truncate">{entry.from === 'Current Location' ? `📍 ${t('planner.currentLocation')}` : entry.from}</p>
                  <p className="text-[10px] text-secondary truncate">→ {entry.to}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 bg-error/10 border border-error/20 rounded-[16px] p-4 mb-6">
          <AlertCircle className="w-5 h-5 text-error shrink-0" />
          <p className="text-sm text-error font-headline font-semibold">{error}</p>
        </div>
      )}

      {/* Itinerary results */}
      {itineraries.length > 0 && (
        <section className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex items-center gap-2 px-1 mb-2">
            <Clock className="w-4 h-4 text-secondary" />
            <h2 className="font-label font-bold text-[10px] uppercase tracking-widest text-secondary">
              {t('planner.routeFound', { count: itineraries.length })}
            </h2>
          </div>
          {itineraries.map((it, i) => (
            <ItineraryCard
              key={i}
              itinerary={it}
              index={i}
              expanded={expandedIndex === i}
              onToggle={() => setExpandedIndex(expandedIndex === i ? null : i)}
              onViewOnMap={() => handleViewOnMap(it)}
            />
          ))}
        </section>
      )}

      {/* Empty state */}
      {!isLoading && itineraries.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center pt-10 text-center text-secondary gap-3">
          <div className="w-16 h-16 rounded-full bg-surface-container-low flex items-center justify-center">
            <Search className="w-8 h-8 opacity-40" />
          </div>
          <p className="font-label font-bold text-[10px] uppercase tracking-widest opacity-60">
            {t('planner.enterOriginDest')}
          </p>
        </div>
      )}
    </div>
  );
};
