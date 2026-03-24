import React, { useState, useEffect } from 'react';
import { Star, CheckCircle2, Loader2, ChevronDown, ChevronUp, MapPin, Navigation, Map as MapIcon, Footprints, Edit, X as CloseIcon } from 'lucide-react';
import { cn, formatDistance, formatWalkingTime } from '../lib/utils';
import { Link } from 'react-router-dom';
import { fetchStops, fetchDepartures, fetchRoutes } from '../services/transportService';
import { getFavorites, isFavorite, toggleFavorite as toggleFavService, updateFavorite } from '../services/favoritesService';
import { watchLocation } from '../services/locationService';
import { getDistance } from '../lib/geo';
import { Stop, Arrival } from '../types';

export const Dashboard = () => {
  const [closestStop, setClosestStop] = useState(null as Stop | null);
  const [nearbyStops, setNearbyStops] = useState([] as Stop[]);
  const [userLocation, setUserLocation] = useState(null as { lat: number; lng: number } | null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [departures, setDepartures] = useState([] as Arrival[]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null as string | null);
  const [showAllFavs, setShowAllFavs] = useState(false);
  
  const [expandedNearby, setExpandedNearby] = useState(null as string | null);
  const [nearbyDepartures, setNearbyDepartures] = useState({} as { [key: string]: Arrival[] });
  const [nearbyLoading, setNearbyLoading] = useState({} as { [key: string]: boolean });
  const [favorites, setFavorites] = useState([] as Stop[]);
  const [allStops, setAllStops] = useState([] as Stop[]);
  const [isEditingFavs, setIsEditingFavs] = useState(false);
  const [editingFav, setEditingFav] = useState(null as Stop | null);
  const [editName, setEditName] = useState('');
  const [editEmoji, setEditEmoji] = useState('');

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
    setFavorites(getFavorites());
  }, []);

  // Continuous geolocation tracking
  useEffect(() => {
    const cleanup = watchLocation((location, simulated) => {
      setUserLocation(location);
      setIsSimulated(simulated);
    });

    return cleanup;
  }, []);

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
    
    // Only update departures if the closest stop actually changed
    if (!closestStop || nearest.id !== closestStop.id) {
      setClosestStop(nearest);
      setNearbyStops(sorted.slice(1, 4));
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
      setNearbyStops(sorted.slice(1, 4));
    }
  }, [userLocation, allStops]);

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
    const interval = setInterval(() => {
      // Refresh closest stop
      if (closestStop) {
        fetchDepartures(closestStop.id, closestStop.siriId).then(deps => {
          setDepartures(deps.slice(0, 6));
        }).catch(err => console.error("Failed to refresh closest stop departures", err));
      }

      // Refresh expanded nearby stop or favorite
      if (expandedNearby) {
        const stop = allStops.find(s => s.id === expandedNearby) || favorites.find(f => f.id === expandedNearby);
        if (stop) {
          fetchDepartures(stop.id, stop.siriId).then(deps => {
            // Favorites show 3, nearby show 6
            const isFav = favorites.some(f => f.id === stop.id);
            setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, isFav ? 3 : 6) }));
          }).catch(err => console.error("Failed to refresh nearby departures", err));
        }
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [closestStop, expandedNearby, allStops, favorites]);

  const handleSaveEdit = () => {
    if (editingFav) {
      const newFavs = updateFavorite(editingFav.id, { customName: editName, emoji: editEmoji });
      setFavorites(newFavs);
      setEditingFav(null);
    }
  };

  const visibleFavs = showAllFavs ? favorites : favorites.slice(0, 3);

  return (
    <div className="max-w-screen-md mx-auto px-6 mt-8 pb-10">
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

      {/* Hero Section: Stop Identity */}
      <section className="mb-10">
        <div className="flex justify-between items-start">
          <div className="space-y-1">
            <div className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary opacity-70 mb-0.5">
              Closest stop
            </div>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-widest mb-1",
              !userLocation ? "bg-blue-50 border-blue-100 text-blue-600 animate-pulse" : (isSimulated ? "bg-amber-50 border-amber-100 text-amber-600" : "bg-blue-50 border-blue-100 text-blue-600")
            )}>
              <Navigation className={cn("w-2.5 h-2.5", userLocation && "fill-current")} />
              {!userLocation ? 'Acquiring GPS...' : (isSimulated ? 'Simulated Tallinn Location' : 'Live Location Active')}
            </div>
            <h2 className="font-headline font-black text-primary text-5xl md:text-6xl tracking-tighter leading-none flex items-center gap-3">
              {closestStop ? (
                <>
                  {favorites.find(f => f.id === closestStop.id)?.emoji && (
                    <span className="text-4xl md:text-5xl">{favorites.find(f => f.id === closestStop.id)?.emoji}</span>
                  )}
                  {favorites.find(f => f.id === closestStop.id)?.customName || closestStop.name}
                </>
              ) : 'Locating...'}
            </h2>
            {closestStop?.distance !== undefined && (
              <div className="flex items-center gap-2 pt-1.5">
                <div className="font-label text-secondary text-[11px] uppercase tracking-wider font-bold">
                  {formatDistance(closestStop.distance * 1000)}
                </div>
                <div className="flex items-center gap-1 px-2 py-0.5 bg-secondary/5 rounded-full border border-secondary/10">
                  <Footprints className="w-3 h-3 text-secondary/60" />
                  <span className="font-label text-secondary text-[10px] uppercase tracking-wider font-bold">
                    {formatWalkingTime(closestStop.distance * 1000)}
                  </span>
                </div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            {closestStop && (
              <Link
                to={`/map?lat=${closestStop.lat}&lng=${closestStop.lng}&zoom=20`}
                className="bg-surface-container-lowest editorial-shadow h-12 w-12 rounded-full flex items-center justify-center active:scale-90 transition-all text-secondary hover:text-primary"
                title="View on Map"
              >
                <MapIcon className="w-5 h-5" />
              </Link>
            )}
            {closestStop && (
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
          <div className="p-6 bg-error/10 text-error rounded-[20px] text-center">
            {error}
          </div>
        ) : departures.length === 0 ? (
          <div className="p-6 bg-surface-container-high rounded-[20px] text-center text-secondary">
            No upcoming departures found for this stop.
          </div>
        ) : (
          <div className="space-y-2">
            {departures.map((arrival, idx) => (
              <div
                key={idx}
                className={cn(
                  "group flex items-center justify-between p-3 rounded-[20px] transition-all",
                  arrival.status === 'departed' 
                    ? "bg-surface-container-high/30 opacity-60" 
                    : "bg-surface-container-lowest editorial-shadow hover:translate-x-2"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-full flex items-center justify-center font-label font-bold text-base",
                    arrival.type === 'tram' ? "bg-tram text-white" : arrival.type === 'trolley' ? "bg-trolley text-white" : "bg-bus text-white"
                  )}>
                    {arrival.line}
                  </div>
                  <div className="flex flex-col">
                    <span className={cn(
                      "font-headline font-extrabold text-primary text-sm",
                      arrival.status === 'departed' && "line-through text-on-surface-variant"
                    )}>
                      {arrival.destination}
                    </span>
                    <span className="font-label text-[9px] text-secondary font-bold uppercase tracking-widest">
                      {arrival.type.charAt(0).toUpperCase() + arrival.type.slice(1)} • {arrival.info || 'Local'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  {arrival.status === 'departed' ? (
                    <CheckCircle2 className="text-on-surface-variant w-4 h-4" />
                  ) : (
                    <span className="font-headline font-black text-xl text-primary">
                      {arrival.minutes <= 0 ? 'Now' : arrival.minutes}
                      {arrival.minutes > 0 && <span className="text-[10px] ml-0.5 font-bold">min</span>}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Nearby Stations Section */}
      {nearbyStops.length > 0 && (
        <section className="mb-12 space-y-4">
          <div className="flex items-baseline justify-between">
            <h3 className="font-headline font-bold text-2xl text-primary">Nearby stops</h3>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {nearbyStops.map((stop) => (
              <div key={stop.id} className="bg-surface-container-lowest editorial-shadow rounded-[20px] overflow-hidden transition-all">
                <div 
                  className="p-3 flex items-center justify-between hover:bg-surface-container-low transition-colors cursor-pointer group"
                  onClick={() => handleNearbyClick(stop)}
                >
                  <div className="flex items-center gap-4">
                    <Link 
                      to={`/map?lat=${stop.lat}&lng=${stop.lng}&zoom=20`}
                      onClick={(e) => e.stopPropagation()}
                      className="h-10 w-10 rounded-full bg-primary/5 text-primary flex items-center justify-center hover:bg-primary hover:text-white transition-colors active:scale-90"
                      title="View on Map"
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

                {/* Expanded Nearby Departures */}
                {expandedNearby === stop.id && (
                  <div className="px-4 pb-4 pt-2 border-t border-outline-variant/20 bg-surface-container-lowest/50">
                    {nearbyLoading[stop.id] ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-5 h-5 animate-spin text-secondary" />
                      </div>
                    ) : nearbyDepartures[stop.id]?.length > 0 ? (
                      <div className="space-y-2">
                        {nearbyDepartures[stop.id].map((arr, i) => (
                          <div key={i} className="flex items-center justify-between py-2">
                            <div className="flex items-center gap-3">
                              <div className={cn(
                                "h-8 w-8 rounded-full flex items-center justify-center font-label font-bold text-xs",
                                arr.type === 'tram' ? "bg-tram text-white" : arr.type === 'trolley' ? "bg-trolley text-white" : "bg-bus text-white"
                              )}>
                                {arr.line}
                              </div>
                              <span className="font-headline font-bold text-primary text-sm">{arr.destination}</span>
                            </div>
                            <div className="flex items-baseline gap-1">
                              <span className="font-headline font-black text-lg text-primary">
                                {arr.minutes > 60 && arr.time ? arr.time : (arr.minutes <= 0 ? 'Now' : arr.minutes)}
                              </span>
                              {arr.minutes > 0 && !(arr.minutes > 60 && arr.time) && <span className="text-[10px] font-bold text-secondary uppercase">min</span>}
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
        </section>
      )}

      {/* Favourites Section */}
      <section className="space-y-4">
        <div className="flex items-baseline justify-between">
          <h3 className="font-headline font-bold text-2xl text-primary">Favorites</h3>
          {favorites.length > 0 && (
            <button 
              onClick={() => setIsEditingFavs(!isEditingFavs)}
              className={cn(
                "font-label text-xs font-bold uppercase tracking-widest transition-all px-3 py-1 rounded-full",
                isEditingFavs ? "bg-primary text-white" : "text-primary hover:bg-primary/5"
              )}
            >
              {isEditingFavs ? 'Done' : 'Edit'}
            </button>
          )}
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          {visibleFavs.map((fav) => (
            <div key={fav.id} className={cn(
              "bg-surface-container-lowest editorial-shadow rounded-[20px] overflow-hidden transition-all",
              isEditingFavs && "ring-2 ring-primary/20"
            )}>
              <div 
                onClick={() => handleFavClick(fav)}
                className={cn(
                  "p-3 flex items-center justify-between cursor-pointer hover:bg-surface-container-low transition-colors active:scale-[0.98]",
                  isEditingFavs && "bg-primary/5"
                )}
              >
                <div className="flex items-center gap-4">
                  <div className="relative">
                    <Link 
                      to={`/map?lat=${fav.lat}&lng=${fav.lng}&zoom=20`}
                      onClick={(e) => e.stopPropagation()}
                      className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center hover:bg-amber-500 hover:text-white transition-colors active:scale-90"
                      title="View on Map"
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
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFavorite(fav);
                    }}
                    className="h-10 w-10 rounded-full flex items-center justify-center text-amber-400 active:scale-90 transition-all"
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                  <div className="text-secondary">
                    {expandedNearby === fav.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </div>
              </div>
              
              {/* Expanded Departures */}
              {expandedNearby === fav.id && (
                <div className="px-4 pb-4 pt-2 border-t border-outline-variant/20 bg-surface-container-lowest/50">
                  {nearbyLoading[fav.id] ? (
                    <div className="flex justify-center py-4">
                      <Loader2 className="w-5 h-5 animate-spin text-secondary" />
                    </div>
                  ) : nearbyDepartures[fav.id]?.length > 0 ? (
                    <div className="space-y-2">
                      {nearbyDepartures[fav.id].map((arr, i) => (
                        <div key={i} className="flex items-center justify-between py-2">
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "h-8 w-8 rounded-full flex items-center justify-center font-label font-bold text-xs",
                              arr.type === 'tram' ? "bg-tram text-white" : arr.type === 'trolley' ? "bg-trolley text-white" : "bg-bus text-white"
                            )}>
                              {arr.line}
                            </div>
                            <span className="font-headline font-bold text-primary text-sm">{arr.destination}</span>
                          </div>
                          <div className="flex items-baseline gap-1">
                            <span className="font-headline font-black text-lg text-primary">
                              {arr.minutes > 60 && arr.time ? arr.time : (arr.minutes <= 0 ? 'Now' : arr.minutes)}
                            </span>
                            {arr.minutes > 0 && !(arr.minutes > 60 && arr.time) && <span className="text-[10px] font-bold text-secondary uppercase">min</span>}
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
            className="w-full py-3 flex items-center justify-center gap-2 text-primary font-bold text-sm uppercase tracking-widest hover:bg-surface-container-low rounded-[20px] transition-colors"
          >
            {showAllFavs ? (
              <>Show Less <ChevronUp className="w-4 h-4" /></>
            ) : (
              <>Show All {favorites.length} Favorites <ChevronDown className="w-4 h-4" /></>
            )}
          </button>
        )}
        
        {favorites.length === 0 && (
          <div className="p-10 bg-surface-container-lowest editorial-shadow rounded-[20px] text-center border-2 border-dashed border-outline-variant/20">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-400/40">
              <Star className="w-8 h-8" />
            </div>
            <h4 className="font-headline font-bold text-primary mb-2 text-lg">No favorites yet</h4>
            <p className="text-secondary text-sm max-w-[240px] mx-auto">
              Add stops to your favourites for quick access to live departures.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
