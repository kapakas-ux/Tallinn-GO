import React, { useState, useEffect } from 'react';
import { Search, Star, Navigation as NearMe, ChevronRight, Loader2, X, Trash2, Map as MapIcon, MapPin, ChevronDown, ChevronUp, Footprints, Edit, X as CloseIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { fetchStops, fetchDepartures, fetchRoutes } from '../services/transportService';
import { getFavorites, toggleFavorite as toggleFavService, isFavorite, updateFavorite } from '../services/favoritesService';
import { watchLocation } from '../services/locationService';
import { getDistance } from '../lib/geo';
import { MiniMap } from '../components/MiniMap';
import { ArrivalItem, getLiveMinutes } from '../components/ArrivalItem';
import { Stop, Arrival } from '../types';
import { cn, formatDistance, formatWalkingTime, getVehicleColorClass, getStopColorClass } from '../lib/utils';
import { NotificationSelector } from '../components/NotificationSelector';
import { getActiveAlerts, isAlertActive } from '../services/alertService';
import { AnimatePresence } from 'motion/react';

export const Stops = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [allStops, setAllStops] = useState([] as Stop[]);
  const [filteredStops, setFilteredStops] = useState([] as Stop[]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedStop, setSelectedStop] = useState(null as Stop | null);
  const [departures, setDepartures] = useState([] as Arrival[]);
  const [isDeparturesLoading, setIsDeparturesLoading] = useState(false);
  const [favorites, setFavorites] = useState([] as Stop[]);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingFav, setEditingFav] = useState(null as Stop | null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [alertingArrival, setAlertingArrival] = useState<{ stop: Stop; arrival: Arrival } | null>(null);
  const [scheduledAlerts, setScheduledAlerts] = useState<any[]>([]);
  // Tick every 15 s so inline minute badges stay live
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);

  const emojiOptions = [
    { label: 'Home', emoji: '🏠' },
    { label: 'Gym', emoji: '🏋️' },
    { label: 'Work', emoji: '💼' },
    { label: 'Market', emoji: '🛒' },
    { label: 'Airport', emoji: '✈️' },
    { label: 'Bus', emoji: '🚌' },
    { label: 'Heart', emoji: '❤️' },
  ];

  useEffect(() => {
    setScheduledAlerts(getActiveAlerts());
  }, []);

  const [favDepartures, setFavDepartures] = useState({} as { [key: string]: Arrival[] });
  const [favLoading, setFavLoading] = useState({} as { [key: string]: boolean });

  const [userLocation, setUserLocation] = useState(null as { lat: number; lng: number } | null);
  const [nearbyStops, setNearbyStops] = useState([] as Stop[]);
  const [expandedNearby, setExpandedNearby] = useState(null as string | null);
  const [nearbyDepartures, setNearbyDepartures] = useState({} as { [key: string]: Arrival[] });
  const [nearbyLoading, setNearbyLoading] = useState({} as { [key: string]: boolean });
  const [isSimulated, setIsSimulated] = useState(false);

  useEffect(() => {
    const cleanup = watchLocation((location, simulated) => {
      setUserLocation(location);
      setIsSimulated(simulated);
    });
    return cleanup;
  }, []);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchStops().then(stops => {
      if (mounted) {
        setAllStops(stops);
        setIsLoading(false);
      }
    });
    fetchRoutes().catch(err => console.error('Error fetching routes:', err));
    setFavorites(getFavorites());
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!userLocation || allStops.length === 0) return;

    const sorted = [...allStops].map(s => ({
      ...s,
      distance: getDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
    })).sort((a, b) => (a.distance || 0) - (b.distance || 0));

    const closest = sorted.slice(0, 6);
    setNearbyStops(closest);
  }, [userLocation, allStops]);

  // Auto-fetch departures for all nearby stops
  useEffect(() => {
    if (nearbyStops.length === 0) return;
    nearbyStops.forEach(async (stop) => {
      if (nearbyDepartures[stop.id]) return;
      setNearbyLoading(prev => ({ ...prev, [stop.id]: true }));
      try {
        const deps = await fetchDepartures(stop.id, stop.siriId);
        setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, 6) }));
      } catch (err) {
        console.error("Failed to load nearby departures", err);
      } finally {
        setNearbyLoading(prev => ({ ...prev, [stop.id]: false }));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyStops]);

  const handleNearbyClick = (stop: Stop) => {
    setExpandedNearby(expandedNearby === stop.id ? null : stop.id);
  };

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStops([]);
      return;
    }
    const query = searchQuery.toLowerCase();
    let results = allStops.filter(stop => 
      stop.name.toLowerCase().includes(query) || stop.id.includes(query)
    );

    if (userLocation) {
      results = results.map(s => ({
        ...s,
        distance: getDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
      })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
    }

    setFilteredStops(results.slice(0, 20)); // limit to 20 results for performance
  }, [searchQuery, allStops, userLocation]);

  useEffect(() => {
    if (favorites.length === 0) return;

    const fetchFavDeps = async () => {
      await Promise.all(favorites.map(async (fav) => {
        if (favDepartures[fav.id]) return;
        
        setFavLoading(prev => ({ ...prev, [fav.id]: true }));
        try {
          const deps = await fetchDepartures(fav.id, fav.siriId);
          setFavDepartures(prev => ({ ...prev, [fav.id]: deps.slice(0, 3) }));
        } catch (err) {
          console.error(`Failed to fetch departures for favorite ${fav.name}`, err);
        } finally {
          setFavLoading(prev => ({ ...prev, [fav.id]: false }));
        }
      }));
    };

    fetchFavDeps();
  }, [favorites]);

  const handleStopClick = async (stop: Stop) => {
    setSelectedStop(stop);
    setIsDeparturesLoading(true);
    setDepartures([]);
    try {
      // Fetching with time=0 to get full day schedule if possible
      const deps = await fetchDepartures(stop.id, stop.siriId, '0');
      setDepartures(deps);
    } catch (err) {
      console.error("Failed to fetch departures", err);
    } finally {
      setIsDeparturesLoading(false);
    }
  };

  const toggleFavorite = (stop: Stop) => {
    const newFavs = toggleFavService(stop);
    setFavorites(newFavs);
  };

  const handleFavClick = async (fav: Stop) => {
    if (isEditMode) {
      setEditingFav(fav);
      setEditName(fav.customName || fav.name);
      setEditEmoji(fav.emoji || '');
      return;
    }
    handleStopClick(fav);
  };

  useEffect(() => {
    const interval = setInterval(() => {
      // Refresh favorites
      if (favorites.length > 0) {
        favorites.forEach(async (fav) => {
          try {
            const deps = await fetchDepartures(fav.id, fav.siriId);
            setFavDepartures(prev => ({ ...prev, [fav.id]: deps.slice(0, 3) }));
          } catch (err) {
            console.error(`Failed to refresh departures for favorite ${fav.name}`, err);
          }
        });
      }

      // Refresh expanded nearby stop
      if (expandedNearby) {
        const stop = allStops.find(s => s.id === expandedNearby);
        if (stop) {
          fetchDepartures(stop.id, stop.siriId).then(deps => {
            setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, 6) }));
          }).catch(err => console.error("Failed to refresh nearby departures", err));
        }
      }

      // Refresh selected stop (modal)
      if (selectedStop) {
        fetchDepartures(selectedStop.id, selectedStop.siriId, '0').then(deps => {
          setDepartures(deps);
        }).catch(err => console.error("Failed to refresh selected stop departures", err));
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [favorites, expandedNearby, selectedStop, allStops]);

  const handleSaveEdit = () => {
    if (editingFav) {
      const newFavs = updateFavorite(editingFav.id, { customName: editName, emoji: editEmoji });
      setFavorites(newFavs);
      setEditingFav(null);
    }
  };

  return (
    <div className="pb-10 relative">
      {/* Edit Favorite Modal */}
      {editingFav && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface-container-lowest editorial-shadow w-full max-w-sm rounded-[32px] overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-bold text-2xl text-primary">Edit Favorite</h3>
                <button onClick={() => setEditingFav(null)} className="text-secondary hover:text-primary transition-colors">
                  <CloseIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">Custom Name</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={editingFav.name}
                    className="w-full h-12 px-4 bg-surface-container-low rounded-2xl border border-outline-variant/20 font-headline font-bold text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">Choose Emoji</label>
                  <div className="grid grid-cols-4 gap-2">
                    <button 
                      onClick={() => setEditEmoji('')}
                      className={cn(
                        "h-12 rounded-2xl flex items-center justify-center text-lg transition-all",
                        editEmoji === '' ? "bg-primary text-white" : "bg-surface-container-low hover:bg-surface-container-high text-secondary"
                      )}
                    >
                      None
                    </button>
                    {emojiOptions.map((opt) => (
                      <button 
                        key={opt.label}
                        onClick={() => setEditEmoji(opt.emoji)}
                        className={cn(
                          "h-12 rounded-2xl flex items-center justify-center text-xl transition-all",
                          editEmoji === opt.emoji ? "bg-primary text-white" : "bg-surface-container-low hover:bg-surface-container-high"
                        )}
                        title={opt.label}
                      >
                        {opt.emoji}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button 
                onClick={handleSaveEdit}
                className="w-full h-14 bg-primary text-white font-headline font-black text-lg rounded-2xl hover:bg-primary/90 active:scale-95 transition-all"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Section */}
      <section className="px-6 pt-8 pb-10">
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            <Search className="text-secondary w-5 h-5" />
          </div>
          <input
            className="w-full bg-surface-container-highest border-none h-16 pl-14 pr-6 rounded-full font-headline font-semibold text-on-surface focus:ring-2 focus:ring-primary-fixed transition-all placeholder:text-on-surface-variant/50"
            placeholder="Search stops..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isLoading && allStops.length === 0 && (
            <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none">
              <Loader2 className="w-5 h-5 animate-spin text-secondary" />
            </div>
          )}
        </div>
      </section>

      {searchQuery.trim() ? (
        /* Search Results Section */
        <section className="px-6 mb-12">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight mb-6 gradient-text">Search Results</h2>
          {filteredStops.length > 0 ? (
            <div className="space-y-3">
              {filteredStops.map((stop) => (
                <div
                  key={stop.id}
                  onClick={() => handleStopClick(stop)}
                  className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-[20px] shadow-sm hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-surface-container-high rounded-full flex items-center justify-center text-primary">
                      <NearMe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <h4 className="font-headline font-bold text-lg text-primary leading-tight">{stop.name}</h4>
                        {stop.desc && (
                          <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest bg-surface-container-high px-1.5 py-0.5 rounded-md">
                            {stop.desc}
                          </span>
                        )}
                      </div>
                      {userLocation ? (
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">
                            {(getDistance(userLocation.lat, userLocation.lng, stop.lat, stop.lng) * 1000).toFixed(0)}m
                          </span>
                          <span className="text-secondary opacity-30">•</span>
                          <div className="flex items-center gap-1">
                            <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">
                              {Math.round((getDistance(userLocation.lat, userLocation.lng, stop.lat, stop.lng) * 1000) / 83.33)} min
                            </span>
                            <Footprints className="w-3 h-3 text-secondary/60" />
                          </div>
                        </div>
                      ) : (
                        <p className="font-label text-xs text-secondary mt-0.5">Stop ID: {stop.id}</p>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="text-outline-variant w-5 h-5" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-secondary">
              <p>No stops matching "{searchQuery}"</p>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Nearby Section */}
          <section className="mb-12">
            <div className="px-6 flex items-end justify-between mb-6">
              <div>
                <span className="font-label text-xs uppercase tracking-widest text-secondary mb-1 block">
                  Live Coverage
                </span>
                <h2 className="font-headline text-3xl font-extrabold tracking-tight gradient-text">Nearby Stops</h2>
              </div>
              {isSimulated && (
                <div className="flex items-center gap-1.5 px-2 py-1 bg-error/10 text-error rounded-full text-[10px] font-bold uppercase tracking-widest border border-error/20">
                  <NearMe className="w-2.5 h-2.5" />
                  GPS Disabled
                </div>
              )}
            </div>
            
            {isSimulated ? (
              <div className="px-6">
                <div className="bg-surface-container-low rounded-[32px] p-8 text-center space-y-3 border border-outline-variant/10">
                  <div className="w-12 h-12 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-1">
                    <NearMe className="w-6 h-6" />
                  </div>
                  <h4 className="font-headline font-bold text-lg text-primary">Location required</h4>
                  <p className="text-secondary text-xs max-w-[200px] mx-auto">
                    Please enable GPS to find stops near your current location.
                  </p>
                </div>
              </div>
            ) : nearbyStops.length > 0 ? (
              <div className="space-y-3 px-6">
                {nearbyStops.map((stop) => (
                  <div key={stop.id} className="bg-surface-container-lowest editorial-shadow rounded-[20px] transition-all">
                    {/* Stop header */}
                    <div
                      className={cn(
                        "p-3 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors",
                        expandedNearby === stop.id ? "rounded-t-[20px]" : "rounded-[20px]"
                      )}
                      onClick={() => handleNearbyClick(stop)}
                    >
                      <div className="flex items-center gap-3">
                        <Link
                          to={`/map?lat=${stop.lat}&lng=${stop.lng}&zoom=20&stopId=${stop.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className={cn("h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-colors active:scale-90", getStopColorClass(stop))}
                        >
                          <MapPin className="w-4 h-4" />
                        </Link>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-headline font-bold text-sm text-primary leading-tight">{stop.name}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="font-label text-[9px] text-secondary font-bold uppercase tracking-wider">{formatDistance(stop.distance! * 1000)}</span>
                            <span className="text-secondary/30">·</span>
                            <Footprints className="w-2.5 h-2.5 text-secondary/50" />
                            <span className="font-label text-[9px] text-secondary font-bold uppercase tracking-wider">{formatWalkingTime(stop.distance! * 1000)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleFavorite(stop); }}
                          className={cn("h-8 w-8 rounded-full flex items-center justify-center transition-all", isFavorite(stop.id) ? "text-amber-400" : "text-secondary/40 hover:text-amber-400")}
                        >
                          <Star className={cn("w-4 h-4", isFavorite(stop.id) && "fill-current")} />
                        </button>
                        <div className="text-secondary">
                          {expandedNearby === stop.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </div>
                      </div>
                    </div>

                    {/* Inline departure preview (always visible) */}
                    {!expandedNearby || expandedNearby !== stop.id ? (
                      nearbyLoading[stop.id] ? (
                        <div className="flex items-center gap-2 px-3 pb-2.5">
                          <Loader2 className="w-3 h-3 animate-spin text-secondary/40" />
                          <span className="font-label text-[9px] text-secondary/40 uppercase tracking-widest">Loading...</span>
                        </div>
                      ) : nearbyDepartures[stop.id]?.length > 0 ? (
                        <div className="px-3 pb-2.5 border-t border-outline-variant/10 pt-2 flex gap-3">
                          {[nearbyDepartures[stop.id].slice(0, 3), nearbyDepartures[stop.id].slice(3, 6)].map((col, ci) => (
                            <div key={ci} className="flex-1 min-w-0 space-y-0.5">
                              {col.map((arr, i) => (
                                <div key={i} className="flex items-center justify-between py-0.5 min-w-0">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <div className={cn("h-6 w-6 rounded-full flex items-center justify-center font-label font-bold text-[10px] shrink-0", arr.status === 'departed' ? 'bg-surface-container-high text-secondary' : getVehicleColorClass(arr.type))}>
                                      {arr.line}
                                    </div>
                                    <span className={cn("font-headline font-bold text-[11px] text-primary truncate", arr.status === 'departed' && "line-through text-secondary/50")}>
                                      {arr.destination}
                                    </span>
                                  </div>
                                  <span className={cn("font-headline font-black text-[11px] shrink-0 ml-1", arr.status === 'departed' ? "text-secondary/40" : "text-primary")}>
                                    {arr.status === 'departed' ? '–' : getLiveMinutes(arr) <= 1 ? 'Now' : (arr.time ?? `${getLiveMinutes(arr)}m`)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      ) : null
                    ) : null}

                    {/* Expanded ArrivalItem view */}
                    {expandedNearby === stop.id && (
                      <div className="px-4 pb-4 pt-2 border-t border-outline-variant/20 bg-surface-container-lowest/50 rounded-b-[20px]">
                        {nearbyLoading[stop.id] ? (
                          <div className="flex justify-center py-4">
                            <Loader2 className="w-5 h-5 animate-spin text-secondary" />
                          </div>
                        ) : nearbyDepartures[stop.id]?.length > 0 ? (
                          <div className="space-y-2">
                            {nearbyDepartures[stop.id].map((arr, i) => (
                              <div key={i} className="relative">
                                <ArrivalItem
                                  arrival={arr}
                                  stop={stop}
                                  variant="compact"
                                  isAlertActive={isAlertActive(stop.id, arr.line, arr.minutes)}
                                  onAlertClick={() => setAlertingArrival({ stop, arrival: arr })}
                                />
                                <AnimatePresence>
                                  {alertingArrival?.arrival === arr && alertingArrival?.stop === stop && (
                                    <NotificationSelector
                                      stop={stop}
                                      arrival={arr}
                                      onClose={() => setAlertingArrival(null)}
                                      onScheduled={() => setScheduledAlerts(getActiveAlerts())}
                                    />
                                  )}
                                </AnimatePresence>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="py-4 text-center text-sm text-secondary">No upcoming departures</div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-6 py-12 flex flex-col items-center justify-center text-secondary">
                <Loader2 className="w-8 h-8 animate-spin mb-4" />
                <p className="font-label font-bold uppercase tracking-widest text-xs">Nearby Stops...</p>
              </div>
            )}
          </section>

          {/* Favorites Section */}
          <section className="px-6 mb-12">
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="font-label text-xs uppercase tracking-widest text-secondary mb-1 block">
                  Quick Access
                </span>
                <h2 className="font-headline text-3xl font-extrabold tracking-tight gradient-text">Favorites</h2>
              </div>
              {favorites.length > 0 && (
                <button 
                  onClick={() => setIsEditMode(!isEditMode)}
                  className="text-primary font-bold text-sm hover:underline"
                >
                  {isEditMode ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
            
            {favorites.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {favorites.map((stop) => (
                  <div 
                    key={stop.id}
                    onClick={() => handleFavClick(stop)}
                    className={cn(
                      "p-5 rounded-[24px] shadow-sm flex flex-col justify-between min-h-[180px] relative group transition-all",
                      isEditMode ? "bg-surface-container-high ring-2 ring-primary/20" : "bg-surface-container-lowest hover:bg-surface-container-low cursor-pointer"
                    )}
                  >
                    <div className="absolute top-0 right-0 p-4 flex gap-2">
                      {isEditMode ? (
                        <>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingFav(stop);
                              setEditName(stop.customName || stop.name);
                              setEditEmoji(stop.emoji || '');
                            }}
                            className="bg-primary/10 p-2 rounded-full text-primary hover:bg-primary/20 transition-colors"
                          >
                            <Edit className="w-5 h-5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFavorite(stop);
                            }}
                            className="bg-error/10 p-2 rounded-full text-error hover:bg-error/20 transition-colors"
                          >
                            <Trash2 className="w-5 h-5" />
                          </button>
                        </>
                      ) : (
                        <Star className="text-amber-400 w-6 h-6 fill-current" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2 pr-16">
                        <h3 className="font-headline text-lg font-black text-primary leading-tight flex items-center gap-2">
                          {stop.emoji && <span className="text-xl">{stop.emoji}</span>}
                          {stop.customName || stop.name}
                        </h3>
                        {stop.desc && (
                          <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest bg-surface-container-high px-1.5 py-0.5 rounded-md whitespace-nowrap">
                            {stop.desc}
                          </span>
                        )}
                      </div>
                      {userLocation ? (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">
                            {(getDistance(userLocation.lat, userLocation.lng, stop.lat, stop.lng) * 1000).toFixed(0)}m
                          </span>
                          <span className="text-secondary opacity-30">•</span>
                          <div className="flex items-center gap-1">
                            <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">
                              {Math.round((getDistance(userLocation.lat, userLocation.lng, stop.lat, stop.lng) * 1000) / 83.33)} min
                            </span>
                            <Footprints className="w-3 h-3 text-secondary/60" />
                          </div>
                        </div>
                      ) : (
                        <p className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest mt-1">ID: {stop.id}</p>
                      )}
                    </div>

                    <div className="mt-4 space-y-2">
                      {favLoading[stop.id] ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 className="w-3 h-3 animate-spin text-secondary" />
                          <span className="text-[9px] font-label font-bold uppercase tracking-widest text-secondary opacity-50">Loading...</span>
                        </div>
                      ) : favDepartures[stop.id]?.length > 0 ? (
                        favDepartures[stop.id].map((arr, i) => (
                          <div key={i} className="relative">
                            <ArrivalItem
                              arrival={arr}
                              stop={stop}
                              variant="compact"
                              expandable={false}
                              isAlertActive={isAlertActive(stop.id, arr.line, arr.minutes)}
                              onAlertClick={() => setAlertingArrival({ stop, arrival: arr })}
                            />
                            <AnimatePresence>
                              {alertingArrival?.arrival === arr && alertingArrival?.stop === stop && (
                                <NotificationSelector 
                                  stop={stop}
                                  arrival={arr}
                                  onClose={() => setAlertingArrival(null)}
                                  onScheduled={() => {
                                    setScheduledAlerts(getActiveAlerts());
                                  }}
                                />
                              )}
                            </AnimatePresence>
                          </div>
                        ))
                      ) : (
                        <div className="py-2">
                          <span className="text-[9px] font-label font-bold uppercase tracking-widest text-secondary opacity-50">No departures</span>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-outline-variant/10 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <NearMe className="w-3 h-3 text-primary" />
                        <span className="font-label text-[10px] font-bold text-primary uppercase tracking-widest">Schedule</span>
                      </div>
                      <ChevronRight className="w-4 h-4 text-outline-variant" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface-container-lowest p-8 rounded-[20px] border-2 border-dashed border-outline-variant/20 text-center">
                <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mx-auto mb-4 text-secondary/40">
                  <Star className="w-8 h-8" />
                </div>
                <h3 className="font-headline font-bold text-primary mb-2">No Favorites</h3>
                <p className="text-secondary text-sm max-w-[200px] mx-auto">
                  Add stops to your favorites for quick access.
                </p>
              </div>
            )}
          </section>
        </>
      )}

      {/* Departures Modal */}
      {selectedStop && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedStop(null)}
          />
          <div className="relative w-full max-w-lg bg-surface rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleFavorite(selectedStop)}
                  className={cn(
                    "h-12 w-12 rounded-[20px] flex items-center justify-center transition-all shadow-sm",
                    isFavorite(selectedStop.id) 
                      ? "bg-amber-50 text-amber-400 shadow-amber-200/50" 
                      : "bg-surface-container-high text-secondary hover:text-amber-400"
                  )}
                >
                  <Star className={cn("w-6 h-6", isFavorite(selectedStop.id) && "fill-current")} />
                </button>
                <div>
                  <div className="flex items-baseline gap-2">
                    <h3 className="font-headline text-2xl font-black text-primary tracking-tight leading-tight">{selectedStop.name}</h3>
                    {selectedStop.desc && (
                      <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest bg-surface-container-high px-1.5 py-0.5 rounded-md">
                        {selectedStop.desc}
                      </span>
                    )}
                  </div>
                  {userLocation ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">
                        {(getDistance(userLocation.lat, userLocation.lng, selectedStop.lat, selectedStop.lng) * 1000).toFixed(0)}m
                      </span>
                      <span className="text-secondary opacity-30">•</span>
                      <div className="flex items-center gap-1">
                        <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-widest">
                          {Math.round((getDistance(userLocation.lat, userLocation.lng, selectedStop.lat, selectedStop.lng) * 1000) / 83.33)} min
                        </span>
                        <Footprints className="w-3 h-3 text-secondary/60" />
                      </div>
                    </div>
                  ) : (
                    <p className="font-label text-xs text-secondary uppercase tracking-widest font-bold">Stop ID: {selectedStop.id}</p>
                  )}
                </div>
              </div>
              <button 
                onClick={() => setSelectedStop(null)}
                className="h-10 w-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary hover:bg-surface-container-highest transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              {selectedStop && (
                <div className="h-48 w-full rounded-[24px] overflow-hidden mb-6 bg-surface-container-high relative border border-outline-variant/10">
                  <MiniMap 
                    userLocation={userLocation} 
                    stops={[selectedStop]} 
                    onStopClick={() => {}} 
                  />
                  <Link 
                    to={`/map?lat=${selectedStop.lat}&lng=${selectedStop.lng}&zoom=20&stopId=${selectedStop.id}`}
                    className="absolute bottom-3 right-3 bg-surface/90 backdrop-blur-md p-3 rounded-full shadow-xl text-primary active:scale-90 transition-transform"
                    title="Open in full map"
                  >
                    <MapIcon className="w-5 h-5" />
                  </Link>
                </div>
              )}

              {isDeparturesLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-secondary">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" />
                  <p className="font-label font-bold uppercase tracking-widest text-xs">Fetching Schedule...</p>
                </div>
              ) : departures.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">Daily Departures</span>
                    <span className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">{departures.length} found</span>
                  </div>
                  {departures.map((arr, i) => (
                    <div key={i} className={cn("relative", alertingArrival?.arrival === arr && alertingArrival?.stop === selectedStop ? "z-50" : "z-10")}>
                      <ArrivalItem
                        arrival={arr}
                        stop={selectedStop}
                        onAlertClick={() => setAlertingArrival({ stop: selectedStop, arrival: arr })}
                        isAlertActive={isAlertActive(selectedStop.id, arr.line, arr.minutes)}
                      />
                      <AnimatePresence>
                        {alertingArrival?.arrival === arr && alertingArrival?.stop === selectedStop && (
                          <NotificationSelector
                            stop={selectedStop}
                            arrival={arr}
                            onClose={() => setAlertingArrival(null)}
                            onScheduled={() => setScheduledAlerts(getActiveAlerts())}
                          />
                        )}
                      </AnimatePresence>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center text-secondary">
                  <p className="font-headline font-bold">No departures today</p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-surface-container-lowest border-t border-outline-variant/10">
              <button 
                onClick={() => setSelectedStop(null)}
                className="w-full py-4 bg-primary text-on-primary rounded-full font-headline font-bold text-lg shadow-lg active:scale-95 transition-all"
              >
                Close Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
