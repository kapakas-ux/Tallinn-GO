import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Star, Loader2, ChevronDown, ChevronUp, MapPin, Navigation, Map as MapIcon, Footprints, Edit, X as CloseIcon, Home, Route as RouteIcon, Trash2, GripVertical } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { cn, formatDistance, formatWalkingTime, getStopColorClass, getVehicleColorClass } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { fetchStops, fetchDepartures, fetchRoutes, planJourney } from '../services/transportService';
import { getFavorites, isFavorite, subscribeFavorites, toggleFavorite as toggleFavService, updateFavorite } from '../services/favoritesService';
import { getFavouriteJourneys, subscribeJourneys, removeFavouriteJourney, renameJourney, type FavouriteJourney } from '../services/favouriteJourneysService';
import { watchLocation } from '../services/locationService';
import { getDistance } from '../lib/geo';
import { clusterStops, fetchClusterDepartures, scoreCluster, type StopCluster } from '../services/stopClustering';
import { ArrivalItem, getLiveMinutes, CompactTime } from '../components/ArrivalItem';
import { Stop, Arrival, PlanItinerary } from '../types';
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
  const [contentReady, setContentReady] = useState(false);
  const refreshFnRef = useRef<(() => void) | null>(null);
  
  const [expandedNearby, setExpandedNearby] = useState(null as string | null);
  const [nearbyDepartures, setNearbyDepartures] = useState({} as { [key: string]: Arrival[] });
  const [nearbyLoading, setNearbyLoading] = useState({} as { [key: string]: boolean });
  // Stop clustering — when enabled, clusters replace the individual next-stop cards
  const [heroCluster, setHeroCluster] = useState<StopCluster | null>(null);
  const [clusterDepartures, setClusterDepartures] = useState<Arrival[]>([]);
  const [favJourneys, setFavJourneys] = useState<FavouriteJourney[]>(getFavouriteJourneys());
  const [journeyResults, setJourneyResults] = useState<Record<string, PlanItinerary | null>>({});
  const [journeyLoading, setJourneyLoading] = useState<Record<string, boolean>>({});
  const [expandedJourney, setExpandedJourney] = useState<string | null>(null);
  const [isEditingJourneys, setIsEditingJourneys] = useState(false);
  const [editingJourneyId, setEditingJourneyId] = useState<string | null>(null);
  const [editJourneyName, setEditJourneyName] = useState('');
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

  // ─── Section drag-to-reorder ──────────────────────────────────
  type SectionId = 'nearby' | 'favorites' | 'journeys';
  const DEFAULT_SECTION_ORDER: SectionId[] = ['nearby', 'favorites', 'journeys'];
  const [sectionOrder, setSectionOrder] = useState<SectionId[]>(() => {
    try {
      const saved = localStorage.getItem('dashboard_section_order');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length === 3 && parsed.every((v: any) => DEFAULT_SECTION_ORDER.includes(v))) {
          return parsed as SectionId[];
        }
      }
    } catch {}
    return DEFAULT_SECTION_ORDER;
  });
  const saveSectionOrder = (order: SectionId[]) => {
    setSectionOrder(order);
    try { localStorage.setItem('dashboard_section_order', JSON.stringify(order)); } catch {}
  };
  const [dragSection, setDragSection] = useState<{ id: SectionId; startY: number; currentY: number } | null>(null);
  const sectionElRefs = useRef<Record<SectionId, HTMLDivElement | null>>({} as any);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null);
  const hasMovedDuringPress = useRef(false);

  const onSectionHeaderDown = useCallback((sectionId: SectionId, e: React.PointerEvent) => {
    // Only enable on section titles, not edit buttons etc.
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    pointerDownPos.current = { x: e.clientX, y: e.clientY };
    hasMovedDuringPress.current = false;
    longPressTimer.current = setTimeout(() => {
      if (!hasMovedDuringPress.current) {
        setDragSection({ id: sectionId, startY: e.clientY, currentY: e.clientY });
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      }
      longPressTimer.current = null;
    }, 500);
  }, []);

  const onSectionHeaderMove = useCallback((e: React.PointerEvent) => {
    if (pointerDownPos.current) {
      const dx = Math.abs(e.clientX - pointerDownPos.current.x);
      const dy = Math.abs(e.clientY - pointerDownPos.current.y);
      if (dx > 5 || dy > 5) hasMovedDuringPress.current = true;
    }
    if (!dragSection) return;
    setDragSection(prev => prev ? { ...prev, currentY: e.clientY } : null);
    // Determine swap target by comparing pointer Y with section midpoints
    const order = [...sectionOrder];
    const dragIdx = order.indexOf(dragSection.id);
    for (let i = 0; i < order.length; i++) {
      if (i === dragIdx) continue;
      const el = sectionElRefs.current[order[i]];
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if ((dragIdx < i && e.clientY > midY) || (dragIdx > i && e.clientY < midY)) {
        // Swap
        const newOrder = [...order];
        [newOrder[dragIdx], newOrder[i]] = [newOrder[i], newOrder[dragIdx]];
        setSectionOrder(newOrder);
        // Reset startY so translateY doesn't accumulate across swaps
        setDragSection(prev => prev ? { ...prev, startY: e.clientY } : null);
        break;
      }
    }
  }, [dragSection, sectionOrder]);

  const onSectionHeaderUp = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pointerDownPos.current = null;
    if (dragSection) {
      // Persist final order
      try { localStorage.setItem('dashboard_section_order', JSON.stringify(sectionOrder)); } catch {}
      setDragSection(null);
    }
  }, [dragSection, sectionOrder]);

  // Drag offset for translateY visual feedback
  const dragOffset = dragSection ? dragSection.currentY - dragSection.startY : 0;

  useEffect(() => {
    const handleSettingsChange = () => {
      const s = getSettings();
      setSettings(s);
      setClusterRadius(s.clusterRadius);
      setClusterEnabled(s.clusterEnabled);
    };
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

  useEffect(() => {
    const unsub = subscribeJourneys(setFavJourneys);
    return unsub;
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

  // Mark content as visible after first paint to enable fade-in transition
  useEffect(() => {
    const raf = requestAnimationFrame(() => setContentReady(true));
    return () => cancelAnimationFrame(raf);
  }, []);

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

  const [clusterRadius, setClusterRadius] = useState(getSettings().clusterRadius);
  const [clusterEnabled, setClusterEnabled] = useState(getSettings().clusterEnabled);
  // Cache clusters — only recompute when allStops or radius changes
  const cachedClustersRef = useRef<StopCluster[] | null>(null);

  // Pre-compute clusters once when allStops or radius changes
  // (clustering uses stop-to-stop distance, independent of user location)
  useEffect(() => {
    if (allStops.length === 0 || !clusterEnabled) {
      if (!clusterEnabled) cachedClustersRef.current = null;
      return;
    }
    cachedClustersRef.current = clusterStops(
      allStops, 59.437, 24.745, // dummy coords — clusterStops only uses them for .distance, ignored here
      { radiusM: clusterRadius, topN: 20 },
    );
  }, [allStops, clusterRadius, clusterEnabled]);

  // Update closest stop / hero when user moves significantly (≥ 50 m)
  // or when clustering settings change.
  const lastSignificantLocationRef = useRef<{ lat: number; lng: number } | null>(null);
  // Reset gate when settings change so effect re-evaluates immediately
  useEffect(() => { lastSignificantLocationRef.current = null; }, [clusterEnabled, clusterRadius]);

  useEffect(() => {
    if (!userLocation || allStops.length === 0) return;
    const last = lastSignificantLocationRef.current;
    if (last && getDistance(last.lat, last.lng, userLocation.lat, userLocation.lng) * 1000 < 50) return;
    lastSignificantLocationRef.current = { lat: userLocation.lat, lng: userLocation.lng };

    // Compute Haversine for all stops, then work with the closest ~200.
    // Haversine is O(n) and fast — the original bottleneck was O(n²) union-find.
    const withDist = allStops.map(s => ({
      ...s,
      distance: getDistance(userLocation.lat, userLocation.lng, s.lat, s.lng)
    })).sort((a, b) => (a.distance || 0) - (b.distance || 0));
    const nearest50 = withDist.slice(0, 50);

    // Fallback: clustering disabled → simple nearest-stop behaviour
    if (!clusterEnabled || !cachedClustersRef.current) {
      setHeroCluster(null);
      setClusterDepartures([]);
      const nearest = nearest50[0];
      const nearby = nearest50.slice(1, 4);
      if (nearest) {
        setClosestStop(nearest);
        setNearbyStops(nearby);
        setLoading(true);
        fetchDepartures(nearest.id, nearest.siriId).then(deps => {
          setDepartures(deps.slice(0, 6));
          setLoading(false);
        }).catch(() => setLoading(false));
      }
      return;
    }

    // Build a fast id→distance map from the full sorted list
    const distMap = new Map<string, Stop>();
    for (const s of withDist) distMap.set(s.id, s);

    // Only consider clusters whose members appear in the nearest 50.
    const nearbyIds = new Set(nearest50.map(s => s.id));
    const localClusters = (cachedClustersRef.current || []).map(c => ({
      ...c,
      stops: c.stops
        .filter(s => nearbyIds.has(s.id))
        .map(s => distMap.get(s.id) ?? { ...s, distance: getDistance(userLocation.lat, userLocation.lng, s.lat, s.lng) })
        .sort((a, b) => (a.distance || 0) - (b.distance || 0)),
    })).filter(c => c.stops.length >= 2);

    // Build a set of stop ids already in local clusters (to exclude from singles)
    const clusteredIds = new Set<string>();
    for (const c of localClusters) {
      for (const s of c.stops) clusteredIds.add(s.id);
    }

    // Collect single (non-clustered) stops
    const singles: Stop[] = [];
    for (const s of nearest50) {
      if (!clusteredIds.has(s.id)) singles.push(s);
    }

    // Merge localClusters + singles into a ranked list
    const items: (StopCluster | Stop)[] = [];

    for (const c of localClusters) {
      items.push({ ...c, score: 1 / Math.max(1, (c.stops[0]?.distance ?? 0.1) * 1000) });
    }

    for (const s of singles.slice(0, 10)) items.push(s);
    items.sort((a, b) => {
      const sa = 'hubName' in a ? a.score : (1 / Math.max(1, (a.distance ?? 0.1) * 1000));
      const sb = 'hubName' in b ? b.score : (1 / Math.max(1, (b.distance ?? 0.1) * 1000));
      return sb - sa;
    });

    // Pick the hero item
    const hero = items[0];
    if (hero && 'hubName' in hero) {
      const cluster = hero as StopCluster;
      const prevId = heroCluster?.id;
      setHeroCluster(cluster);
      setClosestStop(cluster.stops[0]);

      if (cluster.id !== prevId) {
        setLoading(true);
        fetchClusterDepartures(cluster).then(({ departures, departuresPerHour }) => {
          setClusterDepartures(departures.slice(0, 12));
          setDepartures(departures.slice(0, 12));
          setHeroCluster(prev => prev ? { ...prev, score: scoreCluster(prev, departuresPerHour), departuresPerHour } : null);
          setLoading(false);
        }).catch(() => setLoading(false));
      }

      const nearby: Stop[] = [];
      for (let i = 1; i < items.length && nearby.length < 3; i++) {
        const item = items[i];
        nearby.push('hubName' in item ? (item as StopCluster).stops[0] : item as Stop);
      }
      setNearbyStops(nearby);
    } else if (hero) {
      setHeroCluster(null);
      setClusterDepartures([]);
      const nearest = hero as Stop;
      const nearby = items.slice(1, 4).map(i => ('hubName' in i ? (i as StopCluster).stops[0] : i as Stop));

      if (!closestStop || nearest.id !== closestStop.id) {
        setClosestStop(nearest);
        setNearbyStops(nearby);
        setLoading(true);
        fetchDepartures(nearest.id, nearest.siriId).then(deps => {
          setDepartures(deps.slice(0, 6));
          setLoading(false);
        }).catch(() => setLoading(false));
      } else {
        setClosestStop(nearest);
        setNearbyStops(nearby);
      }
    }
  }, [userLocation, allStops.length > 0, clusterEnabled, clusterRadius]);

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
      // Use rAF to batch DOM updates — prevents white flash from
      // intermediate empty states during rapid re-renders.
      const scheduleUpdate = (fn: () => void) => {
        requestAnimationFrame(() => requestAnimationFrame(fn));
      };

      let pending = 0;
      const markDone = () => {
        pending--;
        if (pending <= 0) {
          // All fetches scheduled — signal App.tsx to hide the spinner
          window.dispatchEvent(new CustomEvent('pull-refresh-done'));
        }
      };

      // Refresh closest stop (or hero cluster if active)
      if (heroCluster) {
        pending++;
        fetchClusterDepartures(heroCluster).then(({ departures }) => {
          scheduleUpdate(() => {
            setClusterDepartures(departures.slice(0, 12));
            setDepartures(departures.slice(0, 12));
          });
        }).catch(err => console.error("Failed to refresh cluster departures", err))
        .finally(markDone);
      } else if (closestStop) {
        pending++;
        fetchDepartures(closestStop.id, closestStop.siriId).then(deps => {
          scheduleUpdate(() => setDepartures(deps.slice(0, 6)));
        }).catch(err => console.error("Failed to refresh closest stop departures", err))
        .finally(markDone);
      }

      // Refresh nearby stops
      nearbyStops.forEach(stop => {
        pending++;
        fetchDepartures(stop.id, stop.siriId).then(deps => {
          scheduleUpdate(() => setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, 6) })));
        }).catch(err => console.error("Failed to refresh nearby departures", err))
        .finally(markDone);
      });

      // Refresh favorites (which have their own rows in the dashboard)
      favorites.forEach(fav => {
        if (closestStop?.id === fav.id) return;
        if (nearbyStops.some(s => s.id === fav.id)) return;
        pending++;
        fetchDepartures(fav.id, fav.siriId).then(deps => {
          scheduleUpdate(() => setNearbyDepartures(prev => ({ ...prev, [fav.id]: deps.slice(0, 6) })));
        }).catch(err => console.error("Failed to refresh favorite departures", err))
        .finally(markDone);
      });

      // Refresh expanded favorite (3 rows when expanded)
      if (expandedNearby && !nearbyStops.some(s => s.id === expandedNearby)) {
        const stop = favorites.find(f => f.id === expandedNearby);
        if (stop) {
          pending++;
          fetchDepartures(stop.id, stop.siriId).then(deps => {
            scheduleUpdate(() => setNearbyDepartures(prev => ({ ...prev, [stop.id]: deps.slice(0, 3) })));
          }).catch(err => console.error("Failed to refresh favorite departures", err))
          .finally(markDone);
        }
      }

      if (pending === 0) markDone();
    };

    refreshFnRef.current = refreshAll;

    const interval = setInterval(refreshAll, 10000);

    // Force an immediate refresh whenever the app comes back from the
    // background. Android WebView pauses setInterval while backgrounded, and
    // cached departureTimeSeconds are now in the past, so every row would
    // otherwise render as "Now" until the next interval tick.
    const onVisible = () => {
      if (!document.hidden) refreshAll();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Listen for pull-to-refresh gesture from App.tsx
    const onPullRefresh = () => refreshFnRef.current?.();
    window.addEventListener('pull-to-refresh', onPullRefresh);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pull-to-refresh', onPullRefresh);
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

  // ─── Section drag helpers ────────────────────────────────────
  const sectionHeaderProps = (id: SectionId) => ({
    className: cn(
      "font-headline font-bold text-2xl gradient-text select-none cursor-grab active:cursor-grabbing transition-transform",
      dragSection?.id === id && "scale-105 opacity-80"
    ),
    onPointerDown: (e: React.PointerEvent) => onSectionHeaderDown(id, e),
  } as const);

  const renderNearbyStops = () => (
    nearbyStops.length > 0 && (
      <section className="mb-12 space-y-4" ref={(el) => { sectionElRefs.current['nearby'] = el as any; }} data-section-id="nearby">
        <div className="flex items-baseline justify-between">
          <h3 {...sectionHeaderProps('nearby')}>{t('dashboard.nearbyStops')}</h3>
          {dragSection?.id === 'nearby' && <GripVertical className="w-5 h-5 text-primary animate-pulse" />}
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
                              <div className={cn("h-6 w-6 rounded-full flex items-center justify-center font-label font-bold shrink-0", arr.line.length >= 4 ? 'text-[7px]' : 'text-[10px]', arr.status === 'departed' ? 'bg-surface-container-high text-secondary' : getVehicleColorClass(arr.type))}>
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
    <section className="space-y-4 mb-12" ref={(el) => { sectionElRefs.current['favorites'] = el as any; }} data-section-id="favorites">
      <div className="flex items-baseline justify-between">
        <h3 {...sectionHeaderProps('favorites')}>{t('dashboard.favorites')}</h3>
        <div className="flex items-center gap-2">
          {dragSection?.id === 'favorites' && <GripVertical className="w-5 h-5 text-primary animate-pulse" />}
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
                            <div className={cn("h-6 w-6 rounded-full flex items-center justify-center font-label font-bold shrink-0", arr.line.length >= 4 ? 'text-[7px]' : 'text-[10px]', arr.status === 'departed' ? 'bg-surface-container-high text-secondary' : getVehicleColorClass(arr.type))}>
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

  const handleJourneyClick = async (j: FavouriteJourney) => {
    if (expandedJourney === j.id) { setExpandedJourney(null); return; }
    setExpandedJourney(j.id);
    if (journeyResults[j.id]) return;
    setJourneyLoading(prev => ({ ...prev, [j.id]: true }));
    try {
      const fromLat = j.fromLat ?? 59.437;
      const fromLon = j.fromLon ?? 24.745;
      const toLat = j.toLat ?? 59.437;
      const toLon = j.toLon ?? 24.745;
      const results = await planJourney(fromLat, fromLon, toLat, toLon, 1);
      setJourneyResults(prev => ({ ...prev, [j.id]: results[0] ?? null }));
    } catch { setJourneyResults(prev => ({ ...prev, [j.id]: null })); }
    finally { setJourneyLoading(prev => ({ ...prev, [j.id]: false })); }
  };

  const renderFavouriteJourneys = () => (
    <section className="space-y-4 mb-12" ref={(el) => { sectionElRefs.current['journeys'] = el as any; }} data-section-id="journeys">
      <div className="flex items-baseline justify-between">
        <h3 {...sectionHeaderProps('journeys')}>{t('dashboard.favouriteJourneys')}</h3>
        <div className="flex items-center gap-2">
          {dragSection?.id === 'journeys' && <GripVertical className="w-5 h-5 text-primary animate-pulse" />}
          {favJourneys.length > 0 && (
          <button 
            onClick={() => setIsEditingJourneys(!isEditingJourneys)}
            className={cn(
              "font-label text-xs font-bold uppercase tracking-widest transition-all px-3 py-1 rounded-full",
              isEditingJourneys ? "bg-primary text-white" : "text-primary hover:bg-primary/5"
            )}
          >
            {isEditingJourneys ? t('common.done') : t('common.edit')}
          </button>
        )}
        </div>
      </div>
      {favJourneys.length === 0 ? (
        <div className="p-10 bg-surface-container-lowest editorial-shadow rounded-[20px] text-center border-2 border-dashed border-outline-variant/20">
          <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <RouteIcon className="w-8 h-8 text-amber-400/40" />
          </div>
          <h4 className="font-headline font-bold text-primary mb-2 text-lg">{t('dashboard.favouriteJourneys')}</h4>
          <p className="text-secondary text-sm max-w-[240px] mx-auto">{t('dashboard.noFavouriteJourneys')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {favJourneys.map(j => (
            <div key={j.id} className={cn(
              "bg-surface-container-lowest editorial-shadow rounded-[20px] transition-all",
              isEditingJourneys && "ring-2 ring-primary/20"
            )}>
              <button
                onClick={() => {
                  if (isEditingJourneys) {
                    setEditingJourneyId(j.id);
                    setEditJourneyName(j.customName || j.fromName + ' → ' + j.toName);
                  } else {
                    handleJourneyClick(j);
                  }
                }}
                className={cn(
                  "w-full p-4 flex items-center justify-between text-left hover:bg-surface-container-low transition-colors",
                  expandedJourney === j.id ? "rounded-t-[20px]" : "rounded-[20px]"
                )}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                      <RouteIcon className="w-5 h-5" />
                    </div>
                    {isEditingJourneys && (
                      <div className="absolute -top-1 -right-1 bg-primary text-white rounded-full p-1 shadow-sm">
                        <Edit className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="font-headline font-bold text-sm text-primary truncate">{j.customName || `${j.fromName} → ${j.toName}`}</p>
                    {j.customName && <p className="text-[9px] text-secondary font-label truncate">{j.fromName} → {j.toName}</p>}
                  </div>
                </div>
                {!isEditingJourneys && (
                  <ChevronDown className={cn("w-5 h-5 text-secondary transition-transform shrink-0", expandedJourney === j.id && "rotate-180")} />
                )}
              </button>
              {expandedJourney === j.id && (
                <div className="px-4 pb-4 border-t border-outline-variant/10 pt-3 bg-surface-container-lowest/50 rounded-b-[20px]">
                  {journeyLoading[j.id] ? (
                    <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-secondary" /></div>
                  ) : journeyResults[j.id] === null ? (
                    <p className="text-sm text-secondary text-center py-4">{t('map.noRoutes')}</p>
                  ) : journeyResults[j.id] ? (
                    <div className="space-y-2">
                      {journeyResults[j.id]!.legs.map((leg, li) => (
                        <div key={li} className="flex items-center gap-3 text-sm">
                          <div className={cn(
                            "h-8 w-8 rounded-full flex items-center justify-center font-label font-bold text-xs shrink-0",
                            leg.mode === 'WALK' ? 'bg-surface-container-high text-secondary' : 'bg-primary text-white'
                          )}>
                            {leg.mode === 'WALK' ? <Footprints className="w-4 h-4" /> : (leg.routeShortName || leg.mode.slice(0, 3))}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-headline font-bold text-xs text-primary truncate">
                              {leg.mode === 'WALK' ? `${Math.round(leg.distance)} m walk` : (leg.headsign || leg.to.name)}
                            </p>
                            <p className="text-[9px] text-secondary font-label">
                              {new Date(leg.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – {new Date(leg.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              {' · '}{Math.round(leg.duration / 60)} min
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div
      className={cn(
        "max-w-screen-md mx-auto px-6 mt-4 pb-10 content-fade",
        contentReady && "content-visible",
        dragSection && "select-none"
      )}
      onPointerMove={onSectionHeaderMove}
      onPointerUp={onSectionHeaderUp}
      onPointerLeave={onSectionHeaderUp}
    >
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

      {/* Edit Journey Modal */}
      {editingJourneyId && (
        <div
          className="fixed inset-x-0 z-[100] flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          style={{ top: typeof window !== 'undefined' ? (window.visualViewport?.offsetTop ?? 0) : 0, height: typeof window !== 'undefined' ? (window.visualViewport?.height ?? window.innerHeight) : '100%' }}
          onClick={() => setEditingJourneyId(null)}
        >
          <div className="bg-surface-container-lowest editorial-shadow w-full max-w-sm rounded-[32px] overflow-hidden mb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]" onClick={e => e.stopPropagation()}>
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-headline font-bold text-2xl text-primary">{t('dashboard.editJourneys')}</h3>
                <button onClick={() => setEditingJourneyId(null)} className="text-secondary hover:text-primary transition-colors">
                  <CloseIcon className="w-6 h-6" />
                </button>
              </div>
              <div className="space-y-2">
                <label className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">{t('dashboard.customName')}</label>
                <input
                  autoFocus
                  type="text"
                  value={editJourneyName}
                  onChange={e => setEditJourneyName(e.target.value)}
                  className="w-full h-12 px-4 bg-surface-container-low rounded-2xl border border-outline-variant/20 font-headline font-bold text-primary focus:outline-none focus:border-primary transition-colors"
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      renameJourney(editingJourneyId, editJourneyName || '');
                      setEditingJourneyId(null);
                    }
                  }}
                />
              </div>
              <button
                onClick={() => { renameJourney(editingJourneyId, editJourneyName || ''); setEditingJourneyId(null); }}
                className="w-full h-14 bg-primary text-white font-headline font-black text-lg rounded-2xl hover:bg-primary/90 active:scale-95 transition-all"
              >
                {t('common.save')}
              </button>
              <button
                onClick={() => { removeFavouriteJourney(editingJourneyId); setEditingJourneyId(null); }}
                className="w-full h-12 flex items-center justify-center gap-2 text-error font-headline font-bold text-sm rounded-xl hover:bg-error/5 active:scale-95 transition-all border border-error/20"
              >
                <Trash2 className="w-4 h-4" />
                {t('dashboard.removeJourney')}
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
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-bold uppercase tracking-wider mb-1 max-w-fit whitespace-nowrap",
              !userLocation ? "bg-blue-50 border-blue-100 text-blue-600 animate-pulse" : (isSimulated ? "bg-error/10 border-error/20 text-error" : "bg-blue-50 border-blue-100 text-blue-600")
            )}>
              <Navigation className={cn("w-2.5 h-2.5 shrink-0", userLocation && "fill-current")} />
              <span className="leading-tight">
                {!userLocation ? t('dashboard.acquiringGps') : (isSimulated ? t('dashboard.gpsDisabled') : t('dashboard.liveLocation'))}
              </span>
            </div>
            <h2 className="font-headline font-black text-primary text-5xl md:text-6xl tracking-tighter leading-none flex items-center gap-3">
              {isSimulated ? (
                <span className="text-error">{t('dashboard.pleaseEnableGps')}</span>
              ) : closestStop ? (
                <>
                  {favorites.find(f => f.id === closestStop.id)?.emoji && (
                    <span className="text-4xl md:text-5xl">{favorites.find(f => f.id === closestStop.id)?.emoji}</span>
                  )}
                  {heroCluster 
                    ? heroCluster.hubName
                    : (favorites.find(f => f.id === closestStop.id)?.customName || closestStop.name)
                  }
                </>
              ) : t('dashboard.locating')}
            </h2>
          </div>
          <div className="flex gap-2">
            {closestStop && !isSimulated && (
              <button
                onClick={() => {
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
        {closestStop?.distance !== undefined && !isSimulated && (
          <div className="flex items-center gap-1.5 pt-3 flex-nowrap overflow-x-auto no-scrollbar">
            <div className="font-label text-secondary text-[11px] uppercase tracking-wider font-bold whitespace-nowrap shrink-0">
              {formatDistance(closestStop.distance * 1000)}
            </div>
            <div className="flex items-center gap-1 px-2 py-0.5 bg-secondary/5 rounded-full border border-secondary/10 whitespace-nowrap shrink-0">
              <Footprints className="w-3 h-3 text-secondary/60" />
              <span className="font-label text-secondary text-[10px] uppercase tracking-wider font-bold">
                {formatWalkingTime(closestStop.distance * 1000)}
              </span>
            </div>
            {weather && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-secondary/5 rounded-full border border-secondary/10 whitespace-nowrap shrink-0">
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
      </section>

      {/* Cluster member stops — expandable list */}
      {heroCluster && (
        <section className="my-3">
          <details className="group">
            <summary className="cursor-pointer list-none flex items-center gap-2 px-3 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high transition-colors">
              <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <MapPin className="w-3.5 h-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <span className="font-headline font-bold text-sm text-primary">
                  {heroCluster.stops.length} {t('dashboard.clusteredStops', { defaultValue: 'clustered stops' })}
                </span>
              </div>
              <ChevronDown className="w-4 h-4 text-secondary group-open:rotate-180 transition-transform" />
            </summary>
            <div className="mt-2 space-y-1 pl-3">
              {heroCluster.stops.map(s => (
                <button
                  key={s.id}
                  onClick={() => navigate(`/map?lat=${s.lat}&lng=${s.lng}&zoom=20&stopId=${s.id}`)}
                  className="w-full text-left flex items-center justify-between px-3 py-2 rounded-lg hover:bg-surface-container-low transition-colors"
                >
                  <span className="font-headline font-semibold text-sm text-primary">{s.name}</span>
                  <span className="font-label text-secondary text-[10px] flex items-center gap-1">
                    <Footprints className="w-2.5 h-2.5" />
                    {formatDistance((s.distance ?? 0) * 1000)} · {formatWalkingTime((s.distance ?? 0) * 1000)}
                  </span>
                </button>
              ))}
            </div>
          </details>
        </section>
      )}

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

      {/* Nearby Stations, Favorites & Journeys — drag-reorderable */}
      {sectionOrder.map(id => {
        const isDragging = dragSection?.id === id;
        const content = (() => {
          switch (id) {
            case 'nearby': return renderNearbyStops();
            case 'favorites': return renderFavorites();
            case 'journeys': return renderFavouriteJourneys();
            default: return null;
          }
        })();
        return (
          <div
            key={id}
            className={cn(
              "transition-transform duration-150",
              isDragging && "relative z-20 scale-[1.02]"
            )}
            style={isDragging ? { transform: `translateY(${dragOffset}px)`, filter: 'brightness(1.05)' } : undefined}
          >
            {content}
          </div>
        );
      })}

      {homePickerOpen && (
        <HomeAddressPicker
          onClose={() => setHomePickerOpen(false)}
          onSaved={() => navigate('/plan?to=home')}
        />
      )}
    </div>
  );
};
