import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import {
  MapPin, Navigation, ArrowUpDown, Bus, TrainFront as Tram,
  Footprints, Search, X, Loader2, AlertCircle, Clock, ChevronDown, ChevronUp, Map as MapIcon
} from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchStops, planJourney } from '../services/transportService';
import { watchLocation } from '../services/locationService';
import { decodePolyline } from '../lib/geo';
import type { Stop, PlanItinerary, LegMode } from '../types';

// â”€â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

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
  return <Bus className={className} />;
}

// â”€â”€â”€ mini-map â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const leavesInMin = Math.round((itinerary.startTime - Date.now()) / 60000);
  const label = index === 0 ? 'Fastest' : index === 1 ? 'Alternative' : 'Less walking';

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
              {label} Â· {itinerary.transfers === 0 ? 'Direct' : `${itinerary.transfers} transfer${itinerary.transfers > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="text-right">
            <p className="font-headline font-bold text-base text-on-surface">
              {fmtTime(itinerary.startTime)} â€” {fmtTime(itinerary.endTime)}
            </p>
            <p className="font-label text-[10px] text-secondary mt-0.5">
              {leavesInMin > 0 ? `Leaves in ${leavesInMin} min` : leavesInMin === 0 ? 'Leaving now' : 'Departed'}
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
              ðŸš¶ {fmtDistance(itinerary.walkDistance)} walk
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
                      {leg.from.name || 'Departure'}
                    </span>
                  </div>
                  {leg.mode !== 'WALK' ? (
                    <p className="text-xs text-secondary mt-0.5">
                      {leg.mode === 'TRAM' ? 'Tram' : leg.mode === 'RAIL' ? 'Train' : 'Bus'} {leg.routeShortName}
                      {leg.headsign ? ` â†’ ${leg.headsign}` : ''}
                    </p>
                  ) : (
                    <p className="text-xs text-secondary mt-0.5">
                      Walk {fmtDistance(leg.distance)} Â· {Math.ceil(leg.duration / 60)} min
                    </p>
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
                    {itinerary.legs[itinerary.legs.length - 1].to.name || 'Destination'}
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
              View on Map
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
  const navigate = useNavigate();
  const [from, setFrom] = useState('Current Location');
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
    if (type === 'from') setFrom(query);
    else setTo(query);
    if (query.length > 1) {
      setSuggestions(stops.filter(s => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6));
      setActiveInput(type);
    } else {
      setSuggestions([]);
      setActiveInput(null);
    }
  };

  const selectSuggestion = (stop: Stop) => {
    if (activeInput === 'from') setFrom(stop.name);
    else setTo(stop.name);
    setActiveInput(null);
    setSuggestions([]);
  };

  const swapLocations = () => { const t = from; setFrom(to); setTo(t); };

  const resolveCoords = useCallback((name: string): { lat: number; lon: number } | null => {
    if (name === 'Current Location') {
      return userCoords ? { lat: userCoords.lat, lon: userCoords.lng } : null;
    }
    const stop = stops.find(s => s.name === name);
    return stop ? { lat: stop.lat, lon: stop.lng } : null;
  }, [stops, userCoords]);

  const findRoutes = async () => {
    setError(null);
    const fromCoords = resolveCoords(from);
    const toCoords = resolveCoords(to);
    if (!fromCoords) { setError(from === 'Current Location' ? 'Waiting for GPS...' : `Stop not found: "${from}"`); return; }
    if (!toCoords) { setError(`Stop not found: "${to}"`); return; }
    if (fromCoords.lat === toCoords.lat && fromCoords.lon === toCoords.lon) { setError('Origin and destination are the same.'); return; }

    setIsLoading(true);
    setItineraries([]);
    setExpandedIndex(null);
    try {
      const results = await planJourney(fromCoords.lat, fromCoords.lon, toCoords.lat, toCoords.lon);
      if (!results.length) setError('No routes found between these stops.');
      else { setItineraries(results); setExpandedIndex(0); }
    } catch (e) {
      console.error(e);
      setError('Could not fetch routes. Check your connection.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewOnMap = (itinerary: PlanItinerary) => {
    const last = itinerary.legs[itinerary.legs.length - 1];
    navigate(last ? `/map?lat=${last.to.lat}&lng=${last.to.lon}&zoom=14` : '/map');
  };

  return (
    <div className="max-w-2xl mx-auto px-4 pb-8 pt-4" ref={containerRef}>
      <h1 className="font-headline font-black text-on-surface text-2xl mb-6 px-2">Plan a Journey</h1>

      {/* Search inputs */}
      <section className="relative bg-surface-container-low p-4 rounded-[20px] mb-6 shadow-sm">
        <div className="flex flex-col gap-3 relative">
          {/* FROM */}
          <div className={cn(
            'flex items-center gap-3 bg-surface-container-lowest p-4 rounded-[16px] shadow-sm border-2 transition-all',
            activeInput === 'from' ? 'border-primary' : 'border-transparent'
          )}>
            <Navigation className={cn('w-5 h-5 shrink-0', from === 'Current Location' ? 'text-blue-500 fill-blue-500' : 'text-secondary')} />
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-label uppercase tracking-widest text-secondary mb-0.5">From</p>
              <input
                className="w-full bg-transparent border-none p-0 focus:ring-0 font-headline font-semibold text-on-surface placeholder:text-outline-variant text-sm"
                value={from}
                onChange={e => handleSearch(e.target.value, 'from')}
                onFocus={() => {
                  setActiveInput('from');
                  if (from === 'Current Location') { setFrom(''); setSuggestions(stops.slice(0, 6)); }
                  else handleSearch(from, 'from');
                }}
                placeholder="Starting point..."
              />
            </div>
            {from !== 'Current Location' && from !== '' && (
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
              <p className="text-[9px] font-label uppercase tracking-widest text-secondary mb-0.5">To</p>
              <input
                className="w-full bg-transparent border-none p-0 focus:ring-0 font-headline font-semibold text-on-surface placeholder:text-outline-variant text-sm"
                value={to}
                onChange={e => handleSearch(e.target.value, 'to')}
                onFocus={() => { setActiveInput('to'); handleSearch(to, 'to'); }}
                placeholder="Where to?"
              />
            </div>
            {to !== '' && (
              <button onClick={() => setTo('')} className="text-secondary shrink-0"><X className="w-4 h-4" /></button>
            )}
          </div>

          {/* Autocomplete dropdown */}
          {activeInput && (suggestions.length > 0 || activeInput === 'from') && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-surface-container-lowest rounded-[16px] shadow-xl border border-outline-variant/20 z-50 overflow-hidden">
              {activeInput === 'from' && from !== 'Current Location' && (
                <button
                  onClick={() => { setFrom('Current Location'); setActiveInput(null); setSuggestions([]); }}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/10"
                >
                  <div className="bg-blue-50 p-2 rounded-full shrink-0">
                    <Navigation className="w-4 h-4 text-blue-500 fill-blue-500" />
                  </div>
                  <div>
                    <p className="font-headline font-bold text-blue-600 text-sm">
                      {isSimulated ? 'Simulate My Location' : 'Use My Location'}
                    </p>
                    <p className="text-[9px] font-label uppercase tracking-wider text-blue-400">
                      {isSimulated ? 'Tallinn Center' : 'Real-time GPS'}
                    </p>
                  </div>
                </button>
              )}
              {suggestions.map(stop => (
                <button
                  key={stop.id}
                  onClick={() => selectSuggestion(stop)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/10 last:border-0"
                >
                  <div className="bg-surface-container-high p-2 rounded-full shrink-0">
                    <MapPin className="w-4 h-4 text-secondary" />
                  </div>
                  <p className="font-headline font-bold text-on-surface text-sm truncate">{stop.name}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={findRoutes}
          disabled={isLoading || !from || !to}
          className="w-full mt-4 bg-primary text-white py-4 rounded-[16px] font-headline font-black text-base shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <><Loader2 className="w-5 h-5 animate-spin" />Planning route...</>
          ) : (
            <><Search className="w-5 h-5" />Find Routes</>
          )}
        </button>
      </section>

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
              {itineraries.length} route{itineraries.length > 1 ? 's' : ''} found
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
            Enter origin &amp; destination above
          </p>
        </div>
      )}
    </div>
  );
};
