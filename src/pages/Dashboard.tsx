import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Loader2, ChevronDown, ChevronUp, MapPin, Navigation, Map as MapIcon, Footprints, Edit, X as CloseIcon, Home } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { cn, formatDistance, formatWalkingTime, getStopColorClass, getVehicleColorClass } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { fetchStops, fetchDepartures, fetchRoutes } from '../services/transportService';
import { getFavorites, isFavorite, subscribeFavorites, toggleFavorite as toggleFavService, updateFavorite } from '../services/favoritesService';
import { watchLocation } from '../services/locationService';
import { getDistance } from '../lib/geo';
import { ArrivalItem, getLiveMinutes, CompactTime } from '../components/ArrivalItem';
import { Stop, Arrival } from '../types';
import { getActiveAlerts, isAlertActive } from '../services/alertService';
import { NotificationSelector } from '../components/NotificationSelector';
import { ActiveAlerts } from '../components/ActiveAlerts';
import { AnimatePresence } from 'motion/react';
import { getDailyFact, dismissDailyFact } from '../services/dailyFactService';
import { getSettings } from '../services/settingsService';
import { getWeatherForLocation, weatherIcon, WeatherData } from '../services/weatherService';
import { getHome, subscribeHome, type HomeLocation } from '../services/homeService';
import { HomeAddressPicker } from '../components/HomeAddressPicker';

export const Dashboard = ({ active = true }: { active?: boolean }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [closestStop, setClosestStop] = useState(null as Stop | null);
  const [nearbyStops, setNearbyStops] = useState([] as Stop[]);
  const [userLocation, setUserLocation] = useState(null as { lat: number; lng: number } | null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [departures, setDepartures] = useState([] as Arrival[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null as string | null);
  const [showAllFavs, setShowAllFavs] = useState(false);
  const dailyFact = getDailyFact();
  const [factDismissed, setFactDismissed] = useState(dailyFact.dismissed);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [home, setHome] = useState<HomeLocation | null>(getHome());
  const [homePickerOpen, setHomePickerOpen] = useState(false);
  
  const [expandedNearby, setExpandedNearby] = useState(null as string | null);
  const [nearbyDepartures, setNearbyDepartures] = useState({} as { [key: string]: Arrival[] });
  const [nearbyLoading, setNearbyLoading] = useState({} as { [key: string]: boolean });
  const [favorites, setFavorites] = useState([] as Stop[]);
  const [allStops, setAllStops] = useState([] as Stop[]);
  const [isEditingFavs, setIsEditingFavs] = useState(false);
  const [editingFav, setEditingFav] = useState(null as Stop | null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');
  const [alertingArrival, setAlertingArrival] = useState<{ stop: Stop; arrival: Arrival } | null>(null);
  const [scheduledAlerts, setScheduledAlerts] = useState<any[]>([]);
  const [settings, setSettings] = useState(getSettings());
  const [debugInfo, setDebugInfo] = useState<{ url: string, status: string, lastError: string | null }>({
    url: '',
    status: 'Checking...',
    lastError: null
  });

  useEffect(() => {
    const handleSettingsChange = () => setSettings(getSettings());
    window.addEventListener('settings_changed', handleSettingsChange);
    return () => window.removeEventListener('settings_changed', handleSettingsChange);
  }, []);

  useEffect(() => {
    const checkApi = async () => {
      try {
        const url = Capacitor.isNativePlatform() 
          ? 'https://transport.tallinn.ee/data/stops.txt'
          : '/api/transport/stops';
        
        setDebugInfo(prev => ({ ...prev, url }));
        
        const stops = await fetchStops();
        if (stops && stops.length > 0) {
          setDebugInfo(prev => ({ ...prev, status: 'Connected', lastError: null }));
        } else {
          setDebugInfo(prev => ({ ...prev, status: 'Empty Data', lastError: 'No stops found' }));
        }
      } catch (err: any) {
        setDebugInfo(prev => ({ ...prev, status: 'Error', lastError: err.message || String(err) }));
      }
    };
    checkApi();
  }, []);

  const emojiOptions = [
    { label: t('dashboard.emojiHome'), emoji: '🏠' },
    { label: t('dashboard.emojiGym'), emoji: '🏋️' },
    { label: t('dashboard.emojiWork'), emoji: '💼' },
    { label: t('dashboard.emojiMarket'), emoji: '🛒' },
    { label: t('dashboard.emojiAirport'), emoji: '✈️' },
    { label: t('dashboard.emojiBus'), emoji: '🚌' },
    { label: t('dashboard.emojiHeart'), emoji: '❤️' },
  ];

  useEffect(() => {
    setFavorites(getFavorites());
    setScheduledAlerts(getActiveAlerts());
    const unsubscribe = subscribeFavorites((nextFavorites) => {
      setFavorites(nextFavorites);
    });
    return unsubscribe;
  }, []);

  useEffect(() => subscribeHome(setHome), []);

  // Auto-fetch departures for favorite stops
  useEffect(() => {
    if (favorites.length === 0) return;
    const toFetch = favorites.filter(fav => !nearbyDepartures[fav.id]);
    if (toFetch.length === 0) return;
    toFetch.forEach(fav => setNearbyLoading(prev => ({ ...prev, [fav.id]: true })));
    Promise.all(toFetch.map(async (fav) => {
      try {
        const deps = await fetchDepartures(fav.id, fav.siriId);
        setNearbyDepartures(prev => ({ ...prev, [fav.id]: deps.slice(0, 6) }));
      } catch (err) {
        console.error('Failed to load fav departures', err);
      } finally {
        setNearbyLoading(prev => ({ ...prev, [fav.id]: false }));
      }
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favorites]);

  // Continuous geolocation tracking (only when active tab)
  useEffect(() => {
    if (!active) return;
    const cleanup = watchLocation((location, simulated) => {
      setUserLocation(location);
      setIsSimulated(simulated);
    });

    return cleanup;
  }, [active]);

  // Fetch weather data when location is available
  useEffect(() => {
    if (!userLocation || !active) return;
    getWeatherForLocation(userLocation.lat, userLocation.lng).then(setWeather);
  }, [userLocation, active]);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        const [stops] = await Promise.all([
          fetchStops(),
          fetchRoutes().catch(err => console.error('Error fetching routes:', err))
        ]);
        
        if (!mounted) return;
        setAllStops(stops);

        if (stops.length === 0) {
          setError('No stops found');
          setLoading(false);
          return;
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
  }, []); // Run once on mount

  // Update closest stop and nearby when location changes
  useEffect(() => {
    if (!userLocation || allStops.length === 0) return;

    const sorted = [...allStops].map(s => ({
      ...s,
      distance: getDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
    })).sort((a, b) => (a.distance || 0) - (b.distance || 0));

    const nearest = sorted[0];
    const nearby = sorted.slice(1, 4);
    
    // Only update departures if the closest stop actually changed
    if (!closestStop || nearest.id !== closestStop.id) {
      setClosestStop(nearest);
      setNearbyStops(nearby);
      setLoading(true);
      
      fetchDepartures(nearest.id, nearest.siriId).then(deps => {
        setDepartures(deps.slice(0, 6));
        setLoading(false);
      }).catch(() => {
        setLoading(false);
      });
    } else {
      // Just update distance
      setClosestStop(nearest);
      setNearbyStops(nearby);
    }
  }, [userLocation, allStops]);

  // Auto-fetch departures for all nearby stops
  useEffect(() => {
    if (nearbyStops.length === 0) return;
    const toFetch = nearbyStops.filter(stop => !nearbyDepartures[stop.id]);
    if (toFetch.length === 0) return;
    toFetch.forEach(stop => setNearbyLoading(prev => ({ ...prev, [stop.id]: true })));
    Promise.all(toFetch.map(async (stop) => {
      try {
        const deps = await fetchDepartures(stop.id, stop.siriId);
        setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, 6) }));
      } catch (err) {
        console.error("Failed to load nearby departures", err);
      } finally {
        setNearbyLoading(prev => ({ ...prev, [stop.id]: false }));
      }
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearbyStops]);

  const handleNearbyClick = async (stop: Stop) => {
    const stopId = stop.id;
    if (expandedNearby === stopId) {
      setExpandedNearby(null);
      return;
    }
    
    setExpandedNearby(stopId);
    
    if (!nearbyDepartures[stopId]) {
      setNearbyLoading(prev => ({ ...prev, [stopId]: true }));
      try {
        const deps = await fetchDepartures(stopId, stop.siriId);
        setNearbyDepartures(prev => ({ ...prev, [stopId]: deps.slice(0, 6) }));
      } catch (err) {
        console.error("Failed to load nearby departures", err);
      } finally {
        setNearbyLoading(prev => ({ ...prev, [stopId]: false }));
      }
    }
  };

  const handleFavClick = async (fav: Stop) => {
    if (isEditingFavs) {
      setEditingFav(fav);
      setEditName(fav.customName || fav.name);
      setEditEmoji(fav.emoji || '');
      return;
    }
    const favId = fav.id;
    if (expandedNearby === favId) {
      setExpandedNearby(null);
      return;
    }
    
    setExpandedNearby(favId);
    
    if (!nearbyDepartures[favId]) {
      setNearbyLoading(prev => ({ ...prev, [favId]: true }));
      try {
        const deps = await fetchDepartures(favId, fav.siriId);
        setNearbyDepartures(prev => ({ ...prev, [favId]: deps.slice(0, 3) }));
      } catch (err) {
        console.error("Failed to load fav departures", err);
      } finally {
        setNearbyLoading(prev => ({ ...prev, [favId]: false }));
      }
    }
  };

  const toggleFavorite = (stop: Stop) => {
    const newFavs = toggleFavService(stop);
    setFavorites(newFavs);
  };

  useEffect(() => {
    if (!active) return;

    const refreshAll = () => {
      // Refresh closest stop
      if (closestStop) {
        fetchDepartures(closestStop.id, closestStop.siriId).then(deps => {
          setDepartures(deps.slice(0, 6));
        }).catch(err => console.error("Failed to refresh closest stop departures", err));
      }

      // Refresh nearby stops
      nearbyStops.forEach(stop => {
        fetchDepartures(stop.id, stop.siriId).then(deps => {
          setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, 6) }));
        }).catch(err => console.error("Failed to refresh nearby departures", err));
      });

      // Refresh favorites (which have their own rows in the dashboard)
      favorites.forEach(fav => {
        // Skip if this favorite is already covered as the closest or a nearby stop
        if (closestStop?.id === fav.id) return;
        if (nearbyStops.some(s => s.id === fav.id)) return;
        fetchDepartures(fav.id, fav.siriId).then(deps => {
          setNearbyDepartures(prev => ({ ...prev, [fav.id]: deps.slice(0, 6) }));
        }).catch(err => console.error("Failed to refresh favorite departures", err));
      });

      // Refresh expanded favorite (3 rows when expanded)
      if (expandedNearby && !nearbyStops.some(s => s.id === expandedNearby)) {
        const stop = favorites.find(f => f.id === expandedNearby);
        if (stop) {
          fetchDepartures(stop.id, stop.siriId).then(deps => {
            setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, 3) }));
          }).catch(err => console.error("Failed to refresh favorite departures", err));
        }
      }
    };

    const interval = setInterval(refreshAll, 10000);

    // Force an immediate refresh whenever the app comes back from the
    // background. Android WebView pauses setInterval while backgrounded, and
    // cached departureTimeSeconds are now in the past, so every row would
    // otherwise render as "Now" until the next interval tick.
    const onVisible = () => {
      if (!document.hidden) refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [active, closestStop, expandedNearby, allStops, favorites, nearbyStops]);

  const handleSaveEdit = () => {
    if (editingFav) {
      const newFavs = updateFavorite(editingFav.id, { customName: editName, emoji: editEmoji });
      setFavorites(newFavs);
      setEditingFav(null);
    }
  };

  const visibleFavs = showAllFavs ? favorites : favorites.slice(0, 3);

  const renderNearbyStops = () => (
    nearbyStops.length > 0 && (
      <section className="mb-12 space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-headline font-bold text-2xl gradient-text">{t('dashboard.nearbyStops')}</h3>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {nearbyStops.map((stop) => (
            <div key={stop.id} className="bg-surface-container-lowest editorial-shadow rounded-[20px] transition-all">
              <div 
                className={cn(
                  "p-3 flex items-center justify-between hover:bg-surface-container-low transition-colors cursor-pointer group",
                  expandedNearby === stop.id ? "rounded-t-[20px]" : "rounded-[20px]"
                )}
                onClick={() => handleNearbyClick(stop)}
              >
                <div className="flex items-center gap-4">
                  <Link 
                    to={`/map?lat=${stop.lat}&lng=${stop.lng}&zoom=20&stopId=${stop.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center transition-colors active:scale-90",
                      getStopColorClass(stop)
                    )}
                    title={t('dashboard.viewOnMap')}
                  >
                    <MapPin className="w-5 h-5" />
                  </Link>
                  <div>
                    <h4 className="font-headline font-bold text-lg text-primary flex items-center gap-2">
                      {favorites.find(f => f.id === stop.id)?.emoji && (
                        <span className="text-lg">{favorites.find(f => f.id === stop.id)?.emoji}</span>
                      )}
                      {favorites.find(f => f.id === stop.id)?.customName || stop.name}
                    </h4>
                      <div className="flex flex-col mt-0.5">
                        <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-wider leading-tight">
                          {formatDistance(stop.distance! * 1000)}
                        </span>
                        <div className="flex items-center gap-1">
                          <Footprints className="w-2.5 h-2.5 text-secondary/60" />
                          <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-wider leading-tight">
                            {formatWalkingTime(stop.distance! * 1000)}
                          </span>
                        </div>
                      </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(stop);
                    }}
                    className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center transition-all",
                      isFavorite(stop.id) ? "text-amber-400" : "text-secondary hover:text-amber-400"
                    )}
                  >
                    <Star className={cn("w-5 h-5", isFavorite(stop.id) && "fill-current")} />
                  </button>
                  <div className="text-secondary ml-1">
                    {expandedNearby === stop.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
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
                ) : nearbyDepartures[stop.id]?.filter(a => a.status !== 'departed')?.length > 0 ? (
                  <div className="px-3 pb-2.5 border-t border-outline-variant/10 pt-2 flex gap-3">
                    {(() => { const active = nearbyDepartures[stop.id].filter(a => a.status !== 'departed'); return [active.slice(0, 1), active.slice(1, 2)]; })().map((col, ci) => (
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
                              <CompactTime arrival={arr} nowLabel={t('arrivals.now')} />
                            </span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                ) : null
              ) : null}

              {/* Expanded Nearby Departures */}
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
                            userLocation={userLocation}
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
                      ))}
                    </div>
                  ) : (
                    <div className="py-4 text-center text-sm text-secondary">
                      {t('dashboard.noUpcoming')}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    )
  );

  const renderFavorites = () => (
    <section className="space-y-4 mb-12">
      <div className="flex items-baseline justify-between">
        <h3 className="font-headline font-bold text-2xl gradient-text">{t('dashboard.favorites')}</h3>
        {favorites.length > 0 && (
          <button 
            onClick={() => setIsEditingFavs(!isEditingFavs)}
            className={cn(
              "font-label text-xs font-bold uppercase tracking-widest transition-all px-3 py-1 rounded-full",
              isEditingFavs ? "bg-primary text-white" : "text-primary hover:bg-primary/5"
            )}
          >
            {isEditingFavs ? t('common.done') : t('common.edit')}
          </button>
        )}
      </div>
      
      <div className="grid grid-cols-1 gap-3">
        {visibleFavs.map((fav) => (
          <div key={fav.id} className={cn(
            "bg-surface-container-lowest editorial-shadow rounded-[20px] transition-all",
            isEditingFavs && "ring-2 ring-primary/20"
          )}>
            <div 
              onClick={() => handleFavClick(fav)}
              className={cn(
                "p-3 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors active:scale-[0.98]",
                isEditingFavs && "bg-primary/5",
                expandedNearby === fav.id ? "rounded-t-[20px]" : "rounded-[20px]"
              )}
            >
              <div className="flex items-center gap-4">
                <div className="relative">
                  <Link 
                    to={`/map?lat=${fav.lat}&lng=${fav.lng}&zoom=20&stopId=${fav.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors active:scale-90"
                    title={t('dashboard.viewOnMap')}
                  >
                    {fav.emoji ? <span className="text-xl">{fav.emoji}</span> : <MapPin className="w-5 h-5" />}
                  </Link>
                  {isEditingFavs && (
                    <div className="absolute -top-1 -right-1 bg-primary text-white rounded-full p-1 shadow-sm">
                      <Edit className="w-2.5 h-2.5" />
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="font-headline font-bold text-lg text-primary">
                    {fav.customName || fav.name}
                    {fav.customName && <span className="text-[10px] text-secondary font-normal ml-2 opacity-50 uppercase tracking-widest">({fav.name})</span>}
                  </h4>
                  {userLocation ? (
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-wider">
                        {formatDistance(getDistance(userLocation.lat, userLocation.lng, fav.lat, fav.lng) * 1000)}
                      </span>
                      <span className="text-secondary opacity-30">•</span>
                      <div className="flex items-center gap-1">
                        <Footprints className="w-3 h-3 text-secondary/60" />
                        <span className="font-label text-[10px] text-secondary font-bold uppercase tracking-wider">
                          {formatWalkingTime(getDistance(userLocation.lat, userLocation.lng, fav.lat, fav.lng) * 1000)}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 text-secondary">
                      <MapPin className="w-3 h-3" />
                      <span className="font-label text-[10px] uppercase tracking-widest font-bold">Stop ID: {fav.id}</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isEditingFavs ? (
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(fav);
                    }}
                    className="h-10 w-10 rounded-full flex items-center justify-center text-amber-400 active:scale-90 transition-all"
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ) : (
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-amber-400">
                    <Star className="w-5 h-5 fill-current" />
                  </div>
                )}
                <div className="text-secondary">
                  {expandedNearby === fav.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                </div>
              </div>
            </div>
            
            {/* Inline departure preview (visible when collapsed) */}
            {!expandedNearby || expandedNearby !== fav.id ? (
              nearbyLoading[fav.id] ? (
                <div className="flex items-center gap-2 px-3 pb-2.5">
                  <Loader2 className="w-3 h-3 animate-spin text-secondary/40" />
                  <span className="font-label text-[9px] text-secondary/40 uppercase tracking-widest">Loading...</span>
                </div>
              ) : nearbyDepartures[fav.id]?.filter(a => a.status !== 'departed')?.length > 0 ? (
                <div className="px-3 pb-2.5 border-t border-outline-variant/10 pt-2 flex gap-3">
                  {(() => { const active = nearbyDepartures[fav.id].filter(a => a.status !== 'departed'); return [active.slice(0, 1), active.slice(1, 2)]; })().map((col, ci) => (
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
                            <CompactTime arrival={arr} nowLabel={t('arrivals.now')} />
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : null
            ) : null}

            {/* Expanded Departures */}
            {expandedNearby === fav.id && (
              <div className="px-4 pb-4 pt-2 border-t border-outline-variant/20 bg-surface-container-lowest/50 rounded-b-[20px]">
                {nearbyLoading[fav.id] ? (
                  <div className="flex justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-secondary" />
                  </div>
                ) : nearbyDepartures[fav.id]?.length > 0 ? (
                  <div className="space-y-2">
                    {nearbyDepartures[fav.id].map((arr, i) => (
                      <div key={i} className="relative">
                        <ArrivalItem
                          arrival={arr}
                          stop={fav}
                          variant="compact"
                          userLocation={userLocation}
                          isAlertActive={isAlertActive(fav.id, arr.line, arr.minutes)}
                          onAlertClick={() => setAlertingArrival({ stop: fav, arrival: arr })}
                        />
                        <AnimatePresence>
                          {alertingArrival?.arrival === arr && alertingArrival?.stop === fav && (
                            <NotificationSelector 
                              stop={fav}
                              arrival={arr}
                              onClose={() => setAlertingArrival(null)}
                              onScheduled={() => {
                                setScheduledAlerts(getActiveAlerts());
                              }}
                            />
                          )}
                        </AnimatePresence>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center text-sm text-secondary">
                    {t('dashboard.noUpcoming')}
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
          className="w-full py-3 flex items-center justify-center gap-2 text-primary font-bold text-sm uppercase tracking-widest hover:bg-surface-container-low rounded-[20px] transition-colors"
        >
          {showAllFavs ? (
            <>{t('dashboard.showLess')} <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>{t('dashboard.showAllFavorites', { count: favorites.length })} <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      )}
      
      {favorites.length === 0 && (
        <div className="p-10 bg-surface-container-lowest editorial-shadow rounded-[20px] text-center border-2 border-dashed border-outline-variant/20">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-400/40">
            <Star className="w-8 h-8" />
          </div>
          <h4 className="font-headline font-bold text-primary mb-2 text-lg">{t('dashboard.noFavorites')}</h4>
          <p className="text-secondary text-sm max-w-[240px] mx-auto">
            {t('dashboard.noFavoritesDesc')}
          </p>
        </div>
      )}
    </section>
  );

  return (
    <div className="max-w-screen-md mx-auto px-6 mt-4 pb-10">
     {/* Edit Favorite Modal */}
      {editingFav && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm">
          <div className="bg-surface-container-lowest editorial-shadow w-full max-w-sm rounded-[32px] overflow-hidden">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-bold text-2xl text-primary">{t('dashboard.editFavorite')}</h3>
                <button onClick={() => setEditingFav(null)} className="text-secondary hover:text-primary transition-colors">
                  <CloseIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">{t('dashboard.customName')}</label>
                  <input 
                    type="text" 
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder={editingFav.name}
                    className="w-full h-12 px-4 bg-surface-container-low rounded-2xl border border-outline-variant/20 font-headline font-bold text-primary focus:outline-none focus:border-primary transition-colors"
                  />
                </div>

                <div className="space-y-2">
                  <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">{t('dashboard.chooseEmoji')}</label>
                  <div className="grid grid-cols-4 gap-2">
                    <button 
                      onClick={() => setEditEmoji('')}
                      className={cn(
                        "h-12 rounded-2xl flex items-center justify-center text-lg transition-all",
                        editEmoji === '' ? "bg-primary text-white" : "bg-surface-container-low hover:bg-surface-container-high text-secondary"
                      )}
                    >
                      {t('common.none')}
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
                {t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Alerts Section */}
      <ActiveAlerts onAlertsChange={() => setScheduledAlerts(getActiveAlerts())} />


      {/* Hero Section: Stop Identity */}
      {/* Daily Fact */}
      {getSettings().showDailyFact && !factDismissed && (
        <section className="mb-8">
          <div className="px-4 py-3 bg-surface-container-lowest editorial-shadow rounded-[20px] border-l-2 border-primary/30 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <p className="font-label text-[9px] font-bold uppercase tracking-widest text-primary/50 mb-1">{t('dashboard.didYouKnow')}</p>
              <p className="font-body text-[11px] text-secondary leading-relaxed">{dailyFact.text}</p>
            </div>
            <button
              onClick={() => { dismissDailyFact(); setFactDismissed(true); }}
              className="shrink-0 mt-0.5 p-1 rounded-full text-secondary/40 hover:text-secondary transition-colors active:scale-90"
              aria-label="Dismiss"
            >
              <CloseIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary opacity-70 mb-0.5">
              {t('dashboard.closestStop')}
            </div>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest mb-1",
              !userLocation ? "bg-blue-50 border-blue-100 text-blue-600 animate-pulse" : (isSimulated ? "bg-error/10 border-error/20 text-error" : "bg-blue-50 border-blue-100 text-blue-600")
            )}>
              <Navigation className={cn("w-2.5 h-2.5", userLocation && "fill-current")} />
              {!userLocation ? t('dashboard.acquiringGps') : (isSimulated ? t('dashboard.gpsDisabled') : t('dashboard.liveLocation'))}
            </div>
            <h2 className="font-headline font-black text-primary text-5xl md:text-6xl tracking-tighter leading-none flex items-center gap-3">
              {isSimulated ? (
                <span className="text-error">{t('dashboard.pleaseEnableGps')}</span>
              ) : closestStop ? (
                <>
                  {favorites.find(f => f.id === closestStop.id)?.emoji && (
                    <span className="text-4xl md:text-5xl">{favorites.find(f => f.id === closestStop.id)?.emoji}</span>
                  )}
                  {favorites.find(f => f.id === closestStop.id)?.customName || closestStop.name}
                </>
              ) : t('dashboard.locating')}
            </h2>
            {closestStop?.distance !== undefined && !isSimulated && (
              <div className="flex flex-wrap items-center gap-2 pt-1.5">
                <div className="font-label text-secondary text-[11px] uppercase tracking-wider font-bold whitespace-nowrap">
                  {formatDistance(closestStop.distance * 1000)}
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 bg-secondary/5 rounded-full border border-secondary/10 whitespace-nowrap">
                  <Footprints className="w-3 h-3 text-secondary/60" />
                  <span className="font-label text-secondary text-[10px] uppercase tracking-wider font-bold">
                    {formatWalkingTime(closestStop.distance * 1000)}
                  </span>
                </div>
                {weather && (
                  <div className="flex items-center gap-1 px-2 py-0.5 bg-secondary/5 rounded-full border border-secondary/10 whitespace-nowrap">
                    <span className="text-sm leading-none">{weatherIcon(weather.phenomenon)}</span>
                    <span className="font-label text-secondary text-[10px] uppercase tracking-wider font-bold">
                      {Math.round(weather.temperature)}°C
                    </span>
                    {weather.windSpeed !== null && (
                      <span className="font-label text-secondary/50 text-[9px] uppercase tracking-wider font-bold">
                        {weather.windSpeed} m/s
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {closestStop && !isSimulated && (
              <button
                onClick={() => {
                  if (home && userLocation && getDistance(userLocation.lat, userLocation.lng, home.lat, home.lon) * 1000 < 200) return;
                  if (home) { navigate('/plan?to=home'); } else { setHomePickerOpen(true); }
                }}
                className={cn(
                  "bg-surface-container-lowest editorial-shadow h-12 w-12 rounded-full flex items-center justify-center active:scale-90 transition-all",
                  home ? "text-primary" : "text-secondary hover:text-primary"
                )}
                title={t('home.takeMeHome')}
              >
                <Home className="w-5 h-5" />
              </button>
            )}
            {!closestStop && userLocation && !isSimulated && (
              <button
                onClick={() => { if (home) { navigate('/plan?to=home'); } else { setHomePickerOpen(true); } }}
                className="bg-surface-container-lowest editorial-shadow h-12 w-12 rounded-full flex items-center justify-center active:scale-90 transition-all text-secondary hover:text-primary"
                title={t('home.takeMeHome')}
              >
                <Home className="w-5 h-5" />
              </button>
            )}
            {closestStop && !isSimulated && (
              <Link
                to={`/map?lat=${closestStop.lat}&lng=${closestStop.lng}&zoom=20&stopId=${closestStop.id}`}
                className="bg-surface-container-lowest editorial-shadow h-12 w-12 rounded-full flex items-center justify-center active:scale-90 transition-all text-secondary hover:text-primary"
                title={t('dashboard.viewOnMap')}
              >
                <MapIcon className="w-5 h-5" />
              </Link>
            )}
            {closestStop && !isSimulated && (
              <button 
                onClick={() => toggleFavorite(closestStop)}
                className={cn(
                  "bg-surface-container-lowest editorial-shadow h-12 w-12 rounded-full flex items-center justify-center active:scale-90 transition-all",
                  isFavorite(closestStop.id) ? "text-amber-400" : "text-secondary hover:text-amber-400"
                )}
              >
                <Star className={cn("w-5 h-5", isFavorite(closestStop.id) && "fill-current")} />
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Real-Time Arrivals Section */}
      <section className="mb-12 space-y-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-headline font-bold text-2xl gradient-text">{t('dashboard.liveArrivals')}</h3>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-error rounded-full animate-pulse"></div>
            <span className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">
              {t('dashboard.liveUpdate')}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-12 text-secondary">
            <Loader2 className="w-8 h-8 animate-spin mb-4" />
            <p>{t('dashboard.findingClosest')}</p>
          </div>
        ) : isSimulated ? (
          <div className="p-12 bg-surface-container-low rounded-[32px] text-center space-y-4 border border-outline-variant/10">
            <div className="w-16 h-16 bg-error/10 text-error rounded-full flex items-center justify-center mx-auto mb-2">
              <Navigation className="w-8 h-8" />
            </div>
            <h4 className="font-headline font-bold text-xl text-primary">{t('dashboard.gpsRequired')}</h4>
            <p className="text-secondary text-sm max-w-[240px] mx-auto">
              {t('dashboard.gpsRequiredDesc')}
            </p>
          </div>
        ) : error ? (
          <div className="p-6 bg-error/10 text-error rounded-[20px] text-center">
            {error}
          </div>
        ) : departures.length === 0 ? (
          <div className="p-6 bg-surface-container-high rounded-[20px] text-center text-secondary">
            {t('dashboard.noDepartures')}
          </div>
        ) : (
          <div className="space-y-2">
            {departures.map((arrival, idx) => (
              <div key={idx} className={cn("relative", alertingArrival?.arrival === arrival && alertingArrival?.stop === closestStop ? "z-50" : "z-10")}>
                <ArrivalItem
                  arrival={arrival}
                  stop={closestStop ?? undefined}
                  userLocation={userLocation}
                  onAlertClick={closestStop ? () => setAlertingArrival({ stop: closestStop, arrival }) : undefined}
                  isAlertActive={closestStop ? isAlertActive(closestStop.id, arrival.line, arrival.minutes) : false}
                />
                <AnimatePresence>
                  {alertingArrival?.arrival === arrival && alertingArrival?.stop === closestStop && (
                    <NotificationSelector
                      stop={closestStop}
                      arrival={arrival}
                      onClose={() => setAlertingArrival(null)}
                      onScheduled={() => setScheduledAlerts(getActiveAlerts())}
                    />
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Nearby Stations and Favorites Section */}
      {settings.showFavoritesFirst ? (
        <>
          {renderFavorites()}
          {renderNearbyStops()}
        </>
      ) : (
        <>
          {renderNearbyStops()}
          {renderFavorites()}
        </>
      )}

      {homePickerOpen && (
        <HomeAddressPicker
          onClose={() => setHomePickerOpen(false)}
          onSaved={() => navigate('/plan?to=home')}
        />
      )}
    </div>
  );
};
