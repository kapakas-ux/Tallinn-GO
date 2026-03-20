import React, { useState, useEffect } from 'react';
import { Star, CheckCircle2, Loader2, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { fetchStops, fetchDepartures, fetchRoutes } from '../services/transportService';
import { getFavorites, isFavorite, toggleFavorite as toggleFavService } from '../services/favoritesService';
import { Stop, Arrival } from '../types';

// Haversine formula to calculate distance between two coordinates
function getDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in km
}

// Mock favourites for demonstration
const MOCK_FAVOURITES = [
  { id: '11101-1', name: 'Hobujaama', zone: 'Zone A' },
  { id: '11301-1', name: 'Balti jaam', zone: 'Zone A' },
  { id: '11701-1', name: 'Telliskivi', zone: 'Zone A' },
  { id: '19701-1', name: 'Mustamäe', zone: 'Zone B' },
  { id: '13701-1', name: 'Ülemiste jaam', zone: 'Zone B' },
];

export const Dashboard = () => {
  const [closestStop, setClosestStop] = useState<Stop | null>(null);
  const [departures, setDepartures] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllFavs, setShowAllFavs] = useState(false);
  
  const [expandedFav, setExpandedFav] = useState<string | null>(null);
  const [favDepartures, setFavDepartures] = useState<Record<string, Arrival[]>>({});
  const [favLoading, setFavLoading] = useState<Record<string, boolean>>({});
  const [favorites, setFavorites] = useState<Stop[]>([]);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        setLoading(true);
        const [stops] = await Promise.all([
          fetchStops(),
          fetchRoutes().catch(err => console.error('Error fetching routes:', err))
        ]);
        
        if (!mounted) return;

        if (stops.length === 0) {
          setError("Failed to load stops.");
          setLoading(false);
          return;
        }

        const fallbackStop = stops.find(s => s.name.includes('Vabaduse väljak')) || stops[0];

        // Get user location
        if ('geolocation' in navigator) {
          navigator.geolocation.getCurrentPosition(
            async (position) => {
              if (!mounted) return;
              const { latitude, longitude } = position.coords;
              
              // Find closest stop
              let minDistance = Infinity;
              let nearest: Stop | null = null;
              
              for (const stop of stops) {
                const dist = getDistance(latitude, longitude, stop.lat, stop.lng);
                if (dist < minDistance) {
                  minDistance = dist;
                  nearest = stop;
                }
              }
              
              const targetStop = nearest || fallbackStop;
              setClosestStop(targetStop);
              
              const deps = await fetchDepartures(targetStop.id, targetStop.siriId);
              if (mounted) {
                setDepartures(deps.slice(0, 6)); // Get next 6 departures
                setLoading(false);
              }
            },
            async (err) => {
              console.warn("Geolocation error:", err);
              if (!mounted) return;
              // Fallback to a default stop if geolocation fails
              setClosestStop(fallbackStop);
              const deps = await fetchDepartures(fallbackStop.id, fallbackStop.siriId);
              if (mounted) {
                setDepartures(deps.slice(0, 6));
                setLoading(false);
              }
            },
            { timeout: 10000 }
          );
        } else {
          // Fallback if no geolocation
          setClosestStop(fallbackStop);
          const deps = await fetchDepartures(fallbackStop.id, fallbackStop.siriId);
          if (mounted) {
            setDepartures(deps.slice(0, 6));
            setLoading(false);
          }
        }
      } catch (err) {
        console.error(err);
        if (mounted) {
          setError("An error occurred.");
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      mounted = false;
    };
  }, []);

  const handleFavClick = async (fav: Stop) => {
    const favId = fav.id;
    if (expandedFav === favId) {
      setExpandedFav(null);
      return;
    }
    
    setExpandedFav(favId);
    
    if (!favDepartures[favId]) {
      setFavLoading(prev => ({ ...prev, [favId]: true }));
      try {
        const deps = await fetchDepartures(favId, fav.siriId);
        setFavDepartures(prev => ({ ...prev, [favId]: deps.slice(0, 3) }));
      } catch (err) {
        console.error("Failed to load fav departures", err);
      } finally {
        setFavLoading(prev => ({ ...prev, [favId]: false }));
      }
    }
  };

  const toggleFavorite = (stop: Stop) => {
    const newFavs = toggleFavService(stop);
    setFavorites(newFavs);
  };

  const visibleFavs = showAllFavs ? favorites : favorites.slice(0, 3);

  return (
    <div className="max-w-screen-md mx-auto px-6 mt-8 pb-24">
      {/* Hero Section: Stop Identity */}
      <section className="mb-10">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <span className="font-label text-secondary text-xs uppercase tracking-widest font-bold">
              {loading ? "Locating..." : "Closest Station"}
            </span>
            <h2 className="font-headline font-black text-primary text-5xl md:text-6xl tracking-tighter leading-none">
              {closestStop ? closestStop.name : "Loading..."}
            </h2>
          </div>
          {closestStop && (
            <button 
              onClick={() => toggleFavorite(closestStop)}
              className={cn(
                "bg-surface-container-lowest editorial-shadow h-14 w-14 rounded-full flex items-center justify-center active:scale-90 transition-all",
                isFavorite(closestStop.id) ? "text-amber-400" : "text-secondary hover:text-amber-400"
              )}
            >
              <Star className={cn("w-6 h-6", isFavorite(closestStop.id) && "fill-current")} />
            </button>
          )}
        </div>
      </section>

      {/* Real-Time Arrivals Section */}
      <section className="mb-12 space-y-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-headline font-bold text-2xl text-primary">Live Arrivals</h3>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-error rounded-full animate-pulse"></div>
            <span className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
              Live Update
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-secondary">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>Finding closest stop and departures...</p>
          </div>
        ) : error ? (
          <div className="p-6 bg-error/10 text-error rounded-2xl text-center">
            {error}
          </div>
        ) : departures.length === 0 ? (
          <div className="p-6 bg-surface-container-high rounded-2xl text-center text-secondary">
            No upcoming departures found for this stop.
          </div>
        ) : (
          <div className="space-y-4">
            {departures.map((arrival, idx) => (
              <div
                key={idx}
                className={cn(
                  "group flex items-center justify-between p-6 rounded-full transition-all",
                  arrival.status === 'departed' 
                    ? "bg-surface-container-high/30 opacity-60" 
                    : "bg-surface-container-lowest editorial-shadow hover:translate-x-2"
                )}
              >
                <div className="flex items-center gap-6">
                  <div className={cn(
                    "h-14 w-14 rounded-full flex items-center justify-center font-label font-bold text-xl",
                    arrival.type === 'tram' ? "bg-primary text-white" : "bg-tertiary text-on-tertiary"
                  )}>
                    {arrival.line}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "font-headline font-extrabold text-primary text-lg",
                      arrival.status === 'departed' && "line-through text-on-surface-variant"
                    )}>
                      {arrival.destination}
                    </span>
                    <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">
                      {arrival.type} • {arrival.info || 'Local'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  {arrival.status === 'departed' ? (
                    <CheckCircle2 className="text-on-surface-variant w-6 h-6" />
                  ) : (
                    <>
                      <span className="font-headline font-black text-3xl text-primary">
                        {arrival.minutes}<span className="text-sm ml-1 font-bold">MIN</span>
                      </span>
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-widest",
                        arrival.status === 'on-time' ? "text-error" : "text-secondary"
                      )}>
                        {arrival.status.replace('-', ' ')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Favourites Section */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-headline font-bold text-2xl text-primary">Favourites</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          {visibleFavs.map((fav) => (
            <div key={fav.id} className="bg-surface-container-lowest editorial-shadow rounded-2xl overflow-hidden transition-all">
              <div 
                onClick={() => handleFavClick(fav)}
                className="p-4 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors active:scale-[0.98]"
              >
                <div className="flex items-center gap-4">
                  <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-500 flex items-center justify-center">
                    <Star className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <h4 className="font-headline font-bold text-lg text-primary">{fav.name}</h4>
                    <div className="flex items-center gap-1 text-secondary">
                      <MapPin className="w-3 h-3" />
                      <span className="font-label text-[10px] uppercase tracking-widest font-bold">Stop ID: {fav.id}</span>
                    </div>
                  </div>
                </div>
                <div className="text-secondary">
                  {expandedFav === fav.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
              
              {/* Expanded Departures */}
              {expandedFav === fav.id && (
                <div className="px-4 pb-4 pt-2 border-t border-outline-variant/20 bg-surface-container-lowest/50">
                  {favLoading[fav.id] ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-secondary" />
                    </div>
                  ) : favDepartures[fav.id]?.length > 0 ? (
                    <div className="space-y-2">
                      {favDepartures[fav.id].map((arr, i) => (
                        <div key={i} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center font-label font-bold text-xs",
                              arr.type === 'tram' ? "bg-primary text-white" : "bg-tertiary text-on-tertiary"
                            )}>
                              {arr.line}
                            </div>
                            <span className="font-headline font-bold text-primary text-sm">{arr.destination}</span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="font-headline font-black text-lg text-primary">{arr.minutes}</span>
                            <span className="text-[10px] font-bold text-secondary uppercase">min</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-secondary">
                      No upcoming departures
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        
        {favorites.length > 3 && (
          <button 
            onClick={() => setShowAllFavs(!showAllFavs)}
            className="w-full py-3 flex items-center justify-center gap-2 text-primary font-bold text-sm uppercase tracking-widest hover:bg-surface-container-low rounded-xl transition-colors"
          >
            {showAllFavs ? (
              <>Show Less <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>Show All {favorites.length} Favourites <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
        )}
        
        {favorites.length === 0 && (
          <div className="p-10 bg-surface-container-lowest editorial-shadow rounded-3xl text-center border-2 border-dashed border-outline-variant/20">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-400/40">
              <Star className="w-8 h-8" />
            </div>
            <h4 className="font-headline font-bold text-primary mb-2 text-lg">No Favourites Yet</h4>
            <p className="text-secondary text-sm max-w-[240px] mx-auto">
              Add stops to your favourites for quick access to live departures.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
