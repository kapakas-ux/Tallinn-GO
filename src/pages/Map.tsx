import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import i18next from 'i18next';
import { Capacitor } from '@capacitor/core';
import { useLocation, useNavigate } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchStops, fetchDepartures, fetchVehicles, fetchRoutes, fetchServiceAlerts } from '../services/transportService';
import { getFavorites, toggleFavorite, isFavorite } from '../services/favoritesService';
import { getHome, subscribeHome, type HomeLocation } from '../services/homeService';
import { watchLocation, TALLINN_CENTER as TALLINN_CENTER_COORD } from '../services/locationService';
import { decodePolyline } from '../lib/geo';
import { Stop, Arrival, Vehicle, PlanItinerary, LegMode, ServiceAlert } from '../types';
import { Bus, Loader2, Navigation, Footprints, Bell, X, Construction, TriangleAlert, Sun, Moon, Home } from 'lucide-react';
import { getDistance } from '../lib/geo';
import { cn, formatDistance, formatWalkingTime, getVehicleColorClass } from '../lib/utils';
import { fetchDarkMapStyle } from '../lib/mapStyles';
import { scheduleDepartureNotification } from '../services/notificationService';
import { getSettings, AppTheme } from '../services/settingsService';
import { addActiveAlert, getActiveAlerts, isAlertActive } from '../services/alertService';
import { getRouteStopsForVehicle, fetchVehicleTripStoptimes } from '../services/transportService';
import type { TripStoptime } from '../services/transportService';
import { VehicleMap } from '../components/VehicleMap';
import { AnimatePresence, motion } from 'motion/react';

const TALLINN_CENTER: [number, number] = [TALLINN_CENTER_COORD.lng, TALLINN_CENTER_COORD.lat]; // [lng, lat]
const VEHICLE_VISIBILITY_MIN_ZOOM = 13;

const isDarkTheme = (theme: AppTheme) => theme === 'plum' || theme === 'havgra';

const isValidLngLat = (lng: number, lat: number) => {
  return !isNaN(lng) && !isNaN(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const Map = ({ active = true }: { active?: boolean }) => {
  const { t } = useTranslation();
  console.log('Map component rendering');
  const navigate = useNavigate();
  const location = useLocation();
  const mapContainer = useRef(null as HTMLDivElement | null);
  const map = useRef(null as maplibregl.Map | null);
  const markers = useRef([] as maplibregl.Marker[]);
  const vehicleMarkers = useRef({} as { [id: string]: maplibregl.Marker });
  const vehicleInterpolation = useRef({} as { [id: string]: { current: [number, number], target: [number, number], lastUpdate: number } });
  const vehiclesRef = useRef<Vehicle[]>([]);
  const userMarker = useRef(null as maplibregl.Marker | null);
  const pulsatingMarker = useRef(null as maplibregl.Marker | null);
  const currentPopup = useRef(null as maplibregl.Popup | null);
  const journeyMarkers = useRef<maplibregl.Marker[]>([]);
  const journeySourceIds = useRef<string[]>([]);
  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [userLocation, setUserLocation] = useState(null as [number, number] | null);
  const [home, setHome] = useState<HomeLocation | null>(getHome());
  const [isSimulated, setIsSimulated] = useState(false);
  const [locationError, setLocationError] = useState(null as string | null);
  const [pulsatingStopId, setPulsatingStopId] = useState(null as string | null);
  const [scheduledAlerts, setScheduledAlerts] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<{ vehicle: Vehicle, routeStops: Stop[] } | null>(null);
  const [tripStoptimes, setTripStoptimes] = useState<TripStoptime[]>([]);

  const [stops, setStops] = useState([] as Stop[]);
  const [vehicles, setVehicles] = useState([] as Vehicle[]);
  const [vehicleError, setVehicleError] = useState<string | null>(null);
  const [styleLoadCount, setStyleLoadCount] = useState(0);
  const [serviceAlerts, setServiceAlerts] = useState<ServiceAlert[]>([]);
  const [showAlertsPanel, setShowAlertsPanel] = useState(false);
  const [isDarkMap, setIsDarkMap] = useState(() => isDarkTheme(getSettings().theme));

  // Sync map style when app theme changes (e.g. from settings modal)
  useEffect(() => {
    const observer = new MutationObserver(() => {
      const theme = document.documentElement.getAttribute('data-theme') as AppTheme | null;
      if (!theme || !map.current) return;
      const shouldBeDark = isDarkTheme(theme);
      setIsDarkMap(prev => {
        if (prev === shouldBeDark) return prev;
        (async () => {
          try {
            if (shouldBeDark) {
              const darkStyle = await fetchDarkMapStyle();
              map.current?.setStyle(darkStyle);
            } else {
              map.current?.setStyle('https://tiles.openfreemap.org/styles/bright');
            }
          } catch (err) {
            console.error('Auto style sync failed:', err);
          }
        })();
        return shouldBeDark;
      });
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    console.log('Map component mounted');
    
    fetchStops().then(data => {
      console.log(`Fetched ${data.length} stops`);
      setStops(data);
    }).catch(err => {
      console.error('Error fetching stops:', err);
    });

    fetchRoutes().catch(err => console.error('Error fetching routes:', err));

    const loadVehicles = () => {
      fetchVehicles().then(data => {
        setVehicleError(null);
        setVehicles(data);
      }).catch(err => {
        console.error('Error fetching vehicles:', err);
        setVehicleError(err?.message || 'Vehicle fetch failed');
      });
    };

    loadVehicles();
    const interval = setInterval(loadVehicles, 2000); // Update every 2 seconds

    // Animation loop for smooth vehicle movement
    let animationFrameId: number;
    const animate = () => {
      const now = Date.now();
      const duration = 2000; // Match fetch interval

      Object.keys(vehicleInterpolation.current).forEach(id => {
        const data = vehicleInterpolation.current[id];
        const marker = vehicleMarkers.current[id];
        if (!marker) return;

        const elapsed = now - data.lastUpdate;
        const t = Math.min(elapsed / duration, 1);
        
        // Linear interpolation
        const lng = data.current[0] + (data.target[0] - data.current[0]) * t;
        const lat = data.current[1] + (data.target[1] - data.current[1]) * t;
        
        marker.setLngLat([lng, lat]);
      });

      animationFrameId = requestAnimationFrame(animate);
    };
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      clearInterval(interval);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Geolocation tracking (only when active tab)
  useEffect(() => {
    if (!active) return;
    const cleanup = watchLocation((location, simulated) => {
      setUserLocation([location.lng, location.lat]);
      setIsSimulated(simulated);
      setLocationError(null);
    });

    return cleanup;
  }, [active]);

  useEffect(() => subscribeHome(setHome), []);

  // Fly to user location when tab becomes active
  useEffect(() => {
    if (!active || !map.current || !userLocation || isSimulated) return;
    map.current.flyTo({ center: userLocation, zoom: 15, essential: true });
  }, [active]);

  // Service alerts polling — only show when user is in Tallinn area
  const isInTallinn = userLocation && userLocation[1] > 59.3 && userLocation[1] < 59.55 && userLocation[0] > 24.4 && userLocation[0] < 25.0;
  useEffect(() => {
    if (!isInTallinn) { setServiceAlerts([]); return; }
    const loadAlerts = () => {
      fetchServiceAlerts().then(setServiceAlerts).catch(() => {});
    };
    loadAlerts();
    const interval = setInterval(loadAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isInTallinn]);

  // Update user marker
  useEffect(() => {
    if (!map.current || !userLocation || styleLoadCount === 0 || isSimulated) {
      if (userMarker.current) {
        userMarker.current.remove();
        userMarker.current = null;
      }
      return;
    }
    
    // Don't show marker at 0,0 (likely invalid/unlocked GPS)
    if (Math.abs(userLocation[0]) < 0.1 && Math.abs(userLocation[1]) < 0.1) {
      if (userMarker.current) {
        userMarker.current.remove();
        userMarker.current = null;
      }
      return;
    }

    if (!userMarker.current) {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center w-10 h-10';
      el.innerHTML = `
        <div class="absolute w-full h-full bg-blue-500 rounded-full opacity-20 animate-ping"></div>
        <div class="relative w-5 h-5 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
      `;

      userMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat(userLocation)
        .addTo(map.current);
    } else {
      userMarker.current.setLngLat(userLocation);
    }
  }, [userLocation, styleLoadCount]);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    
    console.log('Initializing map instance...');

    const initMap = async () => {
      if (!mapContainer.current) return;
      try {
        const searchParams = new URLSearchParams(location.search);
        const latParam = searchParams.get('lat');
        const lngParam = searchParams.get('lng');
        const zoomParam = searchParams.get('zoom');

        const initialCenter: [number, number] = latParam && lngParam 
          ? [parseFloat(lngParam), parseFloat(latParam)] 
          : TALLINN_CENTER;
        const initialZoom = zoomParam ? parseFloat(zoomParam) : 13;

        let style: any;
        const wantDark = isDarkTheme(getSettings().theme);
        try {
          style = wantDark ? await fetchDarkMapStyle() : 'https://tiles.openfreemap.org/styles/bright';
        } catch {
          style = 'https://tiles.openfreemap.org/styles/bright';
        }

        map.current = new maplibregl.Map({
          container: mapContainer.current,
          style,
          center: initialCenter,
          zoom: initialZoom,
          attributionControl: false
        });

      map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

      // Dark/Light map toggle handler — stored on the map instance for access
      (map.current as any)._toggleDarkLight = null;

      // Double tap to clear pulsating effect
      map.current.on('dblclick', (e) => {
        // Prevent default zoom on dblclick if we want to handle it specifically
        // e.preventDefault(); 
        setPulsatingStopId(null);
      });

      map.current.on('error', (e) => {
        console.error('MapLibre error:', e.error?.message || e);
      });

      map.current.on('style.load', () => {
        console.log('Map "style.load" event fired (count:', styleLoadCount + 1, ')');
        setStyleLoadCount(prev => prev + 1);

        // Hide native bus stops to prevent clutter
        if (map.current) {
          const layers = map.current.getStyle().layers;
          if (layers) {
            layers.forEach(layer => {
              if (layer.id.startsWith('poi_')) {
                if (layer.id === 'poi_transit') {
                  map.current.setFilter(layer.id, ['match', ['get', 'class'], ['airport', 'rail'], true, false]);
                } else {
                  const currentFilter = map.current.getFilter(layer.id);
                  if (currentFilter) {
                    map.current.setFilter(layer.id, ['all', currentFilter, ['!=', ['get', 'class'], 'bus']] as any);
                  } else {
                    map.current.setFilter(layer.id, ['!=', ['get', 'class'], 'bus']);
                  }
                }
              }
            });
          }
        }
      });

      map.current.on('zoom', () => {
        const currentZoom = map.current?.getZoom() || 0;
        const visible = currentZoom >= VEHICLE_VISIBILITY_MIN_ZOOM;
        Object.values(vehicleMarkers.current).forEach((marker: maplibregl.Marker) => {
          marker.getElement().style.display = visible ? 'block' : 'none';
        });
      });

      map.current.on('move', () => {
        const currentZoom = map.current?.getZoom() || 0;
        const visible = currentZoom >= VEHICLE_VISIBILITY_MIN_ZOOM;
        Object.values(vehicleMarkers.current).forEach((marker: maplibregl.Marker) => {
          marker.getElement().style.display = visible ? 'block' : 'none';
        });
      });

    } catch (err) {
      console.error('Error initializing map:', err);
    }
    };

    initMap();

    return () => {
      console.log('Map component unmounting');
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update vehicle markers
  useEffect(() => {
    if (!map.current || styleLoadCount === 0) return;
    vehiclesRef.current = vehicles;

    const currentIds = new Set(vehicles.map(v => v.id));

    // Remove old markers
    Object.keys(vehicleMarkers.current).forEach(id => {
      if (!currentIds.has(id)) {
        vehicleMarkers.current[id].remove();
        delete vehicleMarkers.current[id];
      }
    });

    // Add or update markers
    vehicles.forEach(vehicle => {
      if (!isValidLngLat(vehicle.lng, vehicle.lat)) return;

      if (vehicleMarkers.current[vehicle.id]) {
        // Update existing target for interpolation
        const prevData = vehicleInterpolation.current[vehicle.id];
        
        // Use the previous target as the new start point to avoid jumping
        // or drifting when the map moves.
        const startPos: [number, number] = prevData ? prevData.target : [vehicle.lng, vehicle.lat];
        
        vehicleInterpolation.current[vehicle.id] = {
          current: startPos,
          target: [vehicle.lng, vehicle.lat],
          lastUpdate: Date.now()
        };

        const el = vehicleMarkers.current[vehicle.id].getElement();
        
        const currentZoom = map.current?.getZoom() || 0;
        const visible = currentZoom >= VEHICLE_VISIBILITY_MIN_ZOOM;
        el.style.display = visible ? 'block' : 'none';

        const icon = el.querySelector('.vehicle-icon') as HTMLElement;
        if (icon) {
          icon.style.transform = `rotate(${vehicle.bearing - 45}deg)`;
        }
        const label = el.querySelector('.vehicle-label') as HTMLElement;
        if (label) {
          label.textContent = vehicle.destination ? `${vehicle.line} ${vehicle.destination}` : vehicle.line;
        }
      } else {
        // Create new
        const el = document.createElement('div');
        el.className = 'cursor-pointer group';
        
        const bgColor = getVehicleColorClass(vehicle.type).split(' ')[0];
        const labelText = vehicle.destination ? `${vehicle.line} ${vehicle.destination}` : vehicle.line;

        el.innerHTML = `
          <div class="relative w-5 h-5 flex items-center justify-center transition-transform group-hover:scale-110">
            <div class="vehicle-label absolute bottom-full mb-1 text-[8px] font-bold text-white ${bgColor} opacity-80 px-1 py-px rounded-sm shadow-sm whitespace-nowrap leading-tight">
              ${labelText}
            </div>
            <div class="vehicle-icon w-5 h-5 ${bgColor} rounded-full flex items-center justify-center shadow-sm border border-white" style="transform: rotate(${vehicle.bearing - 45}deg)">
              <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
              </svg>
            </div>
          </div>
        `;

        el.addEventListener('click', async (e) => {
          e.stopPropagation();
          // Use latest vehicle data (destination may have resolved since marker was created)
          const latest = vehiclesRef.current?.find(v => v.id === vehicle.id) || vehicle;
          const routeStops = await getRouteStopsForVehicle(latest);
          setSelectedVehicle({ vehicle: latest, routeStops });
          setTripStoptimes([]);
          fetchVehicleTripStoptimes(latest).then(st => setTripStoptimes(st));
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([vehicle.lng, vehicle.lat])
          .addTo(map.current!);
          
        const currentZoom = map.current?.getZoom() || 0;
        const visible = currentZoom >= VEHICLE_VISIBILITY_MIN_ZOOM;
        el.style.display = visible ? 'block' : 'none';
          
        vehicleInterpolation.current[vehicle.id] = {
          current: [vehicle.lng, vehicle.lat],
          target: [vehicle.lng, vehicle.lat],
          lastUpdate: Date.now()
        };

        vehicleMarkers.current[vehicle.id] = marker;
      }
    });
  }, [vehicles, styleLoadCount]);

  // Handle pulsating stop marker
  useEffect(() => {
    if (!map.current || styleLoadCount === 0) return;

    if (pulsatingMarker.current) {
      pulsatingMarker.current.remove();
      pulsatingMarker.current = null;
    }

    if (pulsatingStopId && stops.length > 0) {
      const stop = stops.find(s => s.id === pulsatingStopId);
      if (stop) {
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center w-12 h-12 pointer-events-none';
        el.innerHTML = `
          <div class="absolute w-full h-full bg-red-500 rounded-full opacity-40 animate-ping"></div>
          <div class="relative w-4 h-4 bg-red-600 rounded-full border-2 border-white shadow-lg"></div>
        `;

        pulsatingMarker.current = new maplibregl.Marker({ element: el })
          .setLngLat([stop.lng, stop.lat])
          .addTo(map.current);
      }
    }
  }, [pulsatingStopId, stops, styleLoadCount]);

  useEffect(() => {
    if (styleLoadCount === 0 || stops.length === 0 || !map.current) {
      console.log('Not ready to add layers:', { styleLoadCount, stopsCount: stops.length, mapExists: !!map.current });
      return;
    }
    
    const m = map.current;
    console.log('--- Map Layer Update Cycle ---');
    console.log('Total stops in state:', stops.length);
    
    // Clear existing debug markers
    markers.current.forEach(m => m.remove());
    markers.current = [];

    // Filter valid stops for GeoJSON and handle exact coordinate overlaps
    const coordMap: { [key: string]: number } = {};
    const validStops = stops.filter(s => isValidLngLat(s.lng, s.lat)).map(stop => {
      // Use a precise key for grouping identical stops
      const key = `${stop.lat.toFixed(6)},${stop.lng.toFixed(6)}`;
      const count = coordMap[key] || 0;
      coordMap[key] = count + 1;
      
      if (count > 0) {
        // Very subtle jitter for overlapping stops
        const angle = (count * 137.5) * (Math.PI / 180);
        const radius = 0.00001 * Math.sqrt(count); // ~1 meter jitter
        return {
          ...stop,
          lat: stop.lat + radius * Math.sin(angle),
          lng: stop.lng + radius * Math.cos(angle)
        };
      }
      return stop;
    });

    console.log('Valid stops for GeoJSON (after jitter):', validStops.length);
    if (validStops.length > 0) {
      const jitteredCount = validStops.filter(s => (s as any).isJittered).length;
      console.log(`Jittered ${jitteredCount} stops out of ${validStops.length}`);
    }

    const geojson: any = {
      type: 'FeatureCollection',
      features: validStops.map((stop, index) => ({
        type: 'Feature',
        id: index,
        geometry: {
          type: 'Point',
          coordinates: [stop.lng, stop.lat]
        },
        properties: {
          id: stop.id,
          siriId: stop.siriId,
          name: stop.name,
          modes: stop.modes || [],
          originalLat: (stop as any).originalLat || stop.lat,
          originalLng: (stop as any).originalLng || stop.lng
        }
      }))
    };

    const nurmenukuFeatures = geojson.features.filter((f: any) => f.properties.name.toLowerCase().includes('nurmenuku'));
    console.log(`DEBUG: GeoJSON contains ${nurmenukuFeatures.length} Nurmenuku features:`, nurmenukuFeatures);

    console.log(`DEBUG: Created GeoJSON with ${geojson.features.length} features`);
    if (geojson.features.length > 0) {
      console.log('DEBUG: First feature coordinates:', geojson.features[0].geometry.coordinates);
    }

    console.log('GeoJSON to set:', JSON.stringify(geojson.features.slice(0, 3), null, 2));

    const addLayers = () => {
      if (!m.getLayer('stops-layer')) {
        m.addLayer({
          id: 'stops-layer',
          type: 'circle',
          source: 'stops',
          minzoom: 13,
          paint: {
            'circle-radius': [
              'interpolate',
              ['linear'],
              ['zoom'],
              13, 4,
              16, 10
            ],
            'circle-color': [
              'case',
              // Only trams
              ['all', 
                ['in', 'tram', ['get', 'modes']], 
                ['==', ['length', ['get', 'modes']], 1]
              ], '#DC143C',
              // Any bus, trolley, regional, commercial, or suburban
              ['any',
                ['in', 'bus', ['get', 'modes']],
                ['in', 'nightbus', ['get', 'modes']],
                ['in', 'trolley', ['get', 'modes']],
                ['in', 'regional', ['get', 'modes']],
                ['in', 'commercial', ['get', 'modes']],
                ['in', 'suburban', ['get', 'modes']]
              ], '#4DA3FF',
              // Default
              '#ff4444'
            ],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.9
          }
        });
      }

      if (!m.getLayer('stops-labels')) {
        m.addLayer({
          id: 'stops-labels',
          type: 'symbol',
          source: 'stops',
          minzoom: 15,
          layout: {
            'text-field': ['get', 'name'],
            'text-size': 11,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
            'text-font': ['Open Sans Regular'],
            'text-allow-overlap': true,
            'text-ignore-placement': true
          },
          paint: {
            'text-color': '#333333',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
          }
        });
      }
    };

    const existingSource = m.getSource('stops') as maplibregl.GeoJSONSource;
    
    if (existingSource) {
      console.log('Updating existing stops source data');
      existingSource.setData(geojson);
      addLayers();
    } else {
      console.log('Adding stops source and layers to map for the first time...');
      try {
        m.addSource('stops', {
          type: 'geojson',
          data: geojson
        });
        addLayers();
        console.log('Successfully added source and layers');
      } catch (err) {
        console.error('Error adding map source/layers:', err);
      }
    }

    m.on('sourcedata', (e) => {
      if (e.sourceId === 'stops' && e.isSourceLoaded) {
        console.log('Stops source data loaded successfully');
      }
    });

    const onMouseEnter = () => {
      m.getCanvas().style.cursor = 'pointer';
    };
    const onMouseLeave = () => {
      m.getCanvas().style.cursor = '';
    };

    m.on('mouseenter', 'stops-layer', onMouseEnter);
    m.on('mouseleave', 'stops-layer', onMouseLeave);

    const handleStopClick = async (e: any) => {
      const feature = e.features ? e.features[0] : e;
      if (!feature) return;

      // Close existing popup if any
      if (currentPopup.current) {
        currentPopup.current.remove();
        currentPopup.current = null;
      }

      const id = feature.properties?.id || feature.id;
      const siriId = feature.properties?.siriId || feature.siriId;
      const name = feature.properties?.name || feature.name;
      const coordinates = feature.geometry ? (feature.geometry as any).coordinates.slice() : [feature.lng, feature.lat];
      
      const popupContent = document.createElement('div');
      popupContent.className = 'relative p-4 pb-8 min-w-[240px] max-h-[50vh] overflow-y-auto overflow-x-hidden font-body no-scrollbar';
      
      let intervalId: any;

      const updateContent = async (isLoading: boolean) => {
        let departures: Arrival[] = [];
        let errorMsg = '';
        
        if (!isLoading) {
          try {
            departures = await fetchDepartures(id, siriId);
          } catch (err: any) {
            console.error('Error in handleStopClick:', err);
            errorMsg = err.message || i18next.t('map.noLiveData');
          }
        }

        let departuresHtml = '';
        if (isLoading) {
          departuresHtml = `<div class="py-4 text-center text-secondary font-label text-xs uppercase tracking-wider">${i18next.t('map.loading')}</div>`;
        } else if (errorMsg) {
          departuresHtml = `<div class="py-4 text-center text-red-500 font-label text-xs uppercase tracking-wider">${errorMsg}</div>`;
        } else if (departures.length > 0) {
          departuresHtml = departures.map(d => {
            const liveMins = (d as any).departureTimeSeconds ? Math.max(0, Math.floor(((d as any).departureTimeSeconds - Date.now() / 1000) / 60)) : d.minutes;
            const isScheduled = isAlertActive(id, d.line, d.minutes);
            const showAlarm = liveMins >= 15 && d.status !== 'departed';
            
            return `
              <div class="flex items-center justify-between py-2 border-b border-surface-container-high last:border-0 relative">
                <div class="flex items-center gap-3">
                  <div class="${getVehicleColorClass(d.type)} w-8 h-8 rounded-full flex items-center justify-center font-label font-bold text-xs">
                    ${d.line}
                  </div>
                  <div class="flex flex-col">
                    <span class="font-headline font-bold text-sm text-primary">${d.destination}</span>
                    <span class="text-[9px] font-label uppercase text-secondary font-bold">${d.type}</span>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  ${showAlarm ? `
                    <button class="alarm-btn p-1.5 rounded-full transition-all active:scale-90 ${isScheduled ? 'bg-amber-500 text-white' : 'bg-surface-container-high text-secondary'}" 
                            data-line="${d.line}" data-dest="${d.destination}" data-mins="${d.minutes}">
                      <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"></path><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"></path></svg>
                    </button>
                  ` : ''}
                  <div class="text-right flex items-baseline gap-1">
                    <span class="font-headline font-black text-lg text-primary flex items-baseline gap-1">
                      ${(() => { const depSec = (d as any).departureTimeSeconds; const m = depSec ? Math.max(0, Math.floor((depSec - Date.now() / 1000) / 60)) : d.minutes; return m <= 1 ? i18next.t('arrivals.now') : (m <= 59 ? m + '<span class="text-xs font-medium ' + (d.isRealtime ? 'text-emerald-500 animate-pulse' : 'text-secondary') + '">' + i18next.t('arrivals.min') + '</span>' : (d.time ?? m + '<span class="text-xs font-medium ' + (d.isRealtime ? 'text-emerald-500 animate-pulse' : 'text-secondary') + '">' + i18next.t('arrivals.min') + '</span>')); })()}
                    </span>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        } else {
          departuresHtml = `<div class="py-4 text-center text-secondary font-label text-xs uppercase tracking-wider">${i18next.t('map.noDepartures')}</div>`;
        }

        const lastUpdated = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
        const isFav = isFavorite(id);

        let distanceHtml = '';
        if (userLocation) {
          const distanceKm = getDistance(userLocation[1], userLocation[0], coordinates[1], coordinates[0]);
          const distanceM = distanceKm * 1000;
          
          distanceHtml = `
            <div class="flex items-center gap-2 mt-1">
              <span class="font-label text-[10px] text-secondary font-bold uppercase tracking-wider leading-tight">
                ${formatDistance(distanceM)}
              </span>
              <span class="text-secondary opacity-30">•</span>
              <div class="flex items-center gap-1">
                <span class="font-label text-[10px] text-secondary font-bold uppercase tracking-wider leading-tight">
                  ${formatWalkingTime(distanceM)}
                </span>
              </div>
            </div>
          `;
        } else {
          distanceHtml = `<p class="text-[10px] font-label uppercase tracking-wider text-secondary font-bold">${i18next.t('map.stopId', { id: siriId || id })}</p>`;
        }

        popupContent.innerHTML = `
          <div class="mb-3 pl-16 relative pr-8">
            <button id="refresh-btn" class="absolute top-0 left-0 p-1.5 hover:bg-surface-container-high rounded-full transition-colors group">
              <svg class="w-4 h-4 text-secondary group-hover:text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
            </button>
            <button id="fav-btn" class="absolute top-0 left-8 p-1.5 hover:bg-surface-container-high rounded-full transition-colors group ${isFav ? 'text-amber-400' : 'text-secondary'}">
              <svg class="w-4 h-4 ${isFav ? 'fill-current' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
            </button>
            <h3 class="font-headline font-black text-primary text-lg leading-tight">${name}</h3>
            ${distanceHtml}
          </div>
          <div class="space-y-2">
            ${departuresHtml}
          </div>
          <div class="mt-4 pt-2 border-t border-surface-container-high text-[9px] text-secondary font-label uppercase tracking-widest text-center opacity-70">
            ${i18next.t('map.updated', { time: lastUpdated })}
          </div>
        `;

        const refreshBtn = popupContent.querySelector('#refresh-btn');
        if (refreshBtn) {
          refreshBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            updateContent(false);
          });
        }

        const alarmBtns = popupContent.querySelectorAll('.alarm-btn');
        alarmBtns.forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const line = btn.getAttribute('data-line') || '';
            const dest = btn.getAttribute('data-dest') || '';
            const mins = parseInt(btn.getAttribute('data-mins') || '0');
            const alertId = btn.getAttribute('data-alert-id') || '';

            // Create a temporary overlay for selection
            const overlay = document.createElement('div');
              overlay.className = 'absolute inset-0 backdrop-blur-md bg-surface/90 z-[100] flex flex-col items-center justify-center p-4 text-center rounded-[16px] overflow-hidden min-h-full';
            overlay.innerHTML = `
              <h4 class="font-headline font-bold text-xs text-primary uppercase tracking-widest mb-2">${i18next.t('map.setAlert')}</h4>
              <p class="text-[10px] text-secondary mb-4 leading-tight">${i18next.t('map.notifyBefore', { line, dest })}</p>
              <div class="flex flex-col gap-2 w-full">
                <button id="alert-5" class="py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors">${i18next.t('map.fiveMin')}</button>
                <button id="alert-10" class="py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors">${i18next.t('map.tenMin')}</button>                  <button id="alert-15" class="py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors">${i18next.t('map.fifteenMin')}</button>                <button id="alert-cancel" class="py-1 text-[10px] text-secondary hover:text-primary mt-1 uppercase font-bold tracking-widest">${i18next.t('common.cancel')}</button>
              </div>
            `;
            popupContent.appendChild(overlay);

            const handleChoice = async (minutesBefore: number) => {
              const success = await scheduleDepartureNotification(name, line, dest, mins, minutesBefore);
              if (success) {
                addActiveAlert({
                  id: Math.random().toString(36).substr(2, 9),
                  stopId: id,
                  stopName: name,
                  line: line,
                  destination: dest,
                  departureTimestamp: Date.now() + mins * 60 * 1000,
                  minutesBefore
                });
                setScheduledAlerts(getActiveAlerts());
                btn.classList.remove('bg-surface-container-high', 'text-secondary');
                btn.classList.add('bg-amber-500', 'text-white');
              }
              overlay.remove();
            };

            overlay.querySelector('#alert-5')?.addEventListener('click', () => handleChoice(5));
            overlay.querySelector('#alert-10')?.addEventListener('click', () => handleChoice(10));              overlay.querySelector('#alert-15')?.addEventListener('click', () => handleChoice(15));            overlay.querySelector('#alert-cancel')?.addEventListener('click', () => overlay.remove());
          });
        });

        const favBtn = popupContent.querySelector('#fav-btn');
        if (favBtn) {
          favBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const stop: Stop = { id, siriId, name, lat: coordinates[1], lng: coordinates[0] };
            const newFavs = toggleFavorite(stop);
            const isNowFav = !!newFavs.find(f => f.id === id);
            
            if (isNowFav) {
              favBtn.classList.remove('text-secondary');
              favBtn.classList.add('text-amber-400');
              favBtn.querySelector('svg')?.classList.add('fill-current');
            } else {
              favBtn.classList.remove('text-amber-400');
              favBtn.classList.add('text-secondary');
              favBtn.querySelector('svg')?.classList.remove('fill-current');
            }
          });
        }
      };

      setLoadingDepartures(true);
      await updateContent(false);
      setLoadingDepartures(false);

      intervalId = setInterval(() => {
        updateContent(false);
      }, 10000);

      const popup = new maplibregl.Popup({ offset: 10, maxWidth: '300px' })
        .setLngLat(coordinates)
        .setDOMContent(popupContent)
        .addTo(m);
      
      currentPopup.current = popup;
      
      popup.on('close', () => {
        clearInterval(intervalId);
        if (currentPopup.current === popup) {
          currentPopup.current = null;
        }
      });
    };

    m.on('click', 'stops-layer', (e) => {
      handleStopClick(e);
    });

    // Handle initial stopId from URL
    const searchParams = new URLSearchParams(location.search);
    const stopIdFromUrl = searchParams.get('stopId');
    if (stopIdFromUrl && stops.length > 0) {
      const stop = stops.find(s => s.id === stopIdFromUrl);
      if (stop) {
        setPulsatingStopId(stopIdFromUrl);
        // Small delay to ensure map is ready to show popup
        setTimeout(() => {
          handleStopClick(stop);
        }, 500);
      }
    }

    return () => {
      m.off('click', 'stops-layer', handleStopClick);
      m.off('mouseenter', 'stops-layer', onMouseEnter);
      m.off('mouseleave', 'stops-layer', onMouseLeave);
      if (currentPopup.current) {
        currentPopup.current.remove();
        currentPopup.current = null;
      }
    };
  }, [styleLoadCount, stops]);

  // Fly to coords when navigating here from Planner with ?lat=&lng=&zoom=
  useEffect(() => {
    if (!map.current) return;
    const searchParams = new URLSearchParams(location.search);
    if (searchParams.has('journey')) return; // handled by journey overlay effect
    const latParam = searchParams.get('lat');
    const lngParam = searchParams.get('lng');
    const zoomParam = searchParams.get('zoom');
    if (latParam && lngParam) {
      const lat = parseFloat(latParam);
      const lng = parseFloat(lngParam);
      const zoom = zoomParam ? parseFloat(zoomParam) : 14;
      if (isValidLngLat(lng, lat)) {
        map.current.flyTo({ center: [lng, lat], zoom, essential: true });
      }
    }
  }, [location.search]);

  // Draw journey overlay when navigating here with ?journey=1
  useEffect(() => {
    const m = map.current;
    if (!m) return;

    const clearOverlay = () => {
      journeyMarkers.current.forEach(mk => mk.remove());
      journeyMarkers.current = [];
      try {
        const style = m.getStyle?.();
        if (style) {
          (style.layers ?? [])
            .filter((l: any) => l.id.startsWith('journey-'))
            .forEach((l: any) => { try { m.removeLayer(l.id); } catch {} });
          Object.keys(style.sources ?? {})
            .filter(s => s.startsWith('journey-'))
            .forEach(s => { try { m.removeSource(s); } catch {} });
        }
      } catch {}
      journeySourceIds.current = [];
    };

    const searchParams = new URLSearchParams(location.search);
    if (!searchParams.has('journey')) { clearOverlay(); return; }

    const raw = sessionStorage.getItem('planner_journey');
    if (!raw) { console.warn('journey: no planner_journey in sessionStorage'); return; }

    let itinerary: PlanItinerary;
    try { itinerary = JSON.parse(raw); } catch { console.error('journey: failed to parse planner_journey'); return; }

    console.log('journey: itinerary loaded, legs:', itinerary.legs.length);

    const modeColor = (mode: LegMode) => {
      if (mode === 'TRAM') return '#DC143C';
      if (mode === 'RAIL') return '#f37021';
      if (mode === 'BUS')  return '#003571';
      return '#9ca3af';
    };

    let drawn = false;

    const drawJourney = () => {
      if (drawn) return;
      if (!m.isStyleLoaded()) { console.warn('journey: style not loaded yet, skipping draw'); return; }
      drawn = true;
      clearOverlay();
      console.log('journey: drawing', itinerary.legs.length, 'legs');

      const allCoords: [number, number][] = [];

      const fmtTime = (ms: number) =>
        new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

      const fmtDur = (sec: number) => {
        const h = Math.floor(sec / 3600);
        const mn = Math.floor((sec % 3600) / 60);
        return h > 0 ? `${h}h ${mn}m` : `${mn} min`;
      };

      const modeEmoji = (mode: LegMode) => {
        if (mode === 'WALK') return '🚶';
        if (mode === 'TRAM') return '🚊';
        if (mode === 'RAIL') return '🚆';
        return '🚌';
      };

      itinerary.legs.forEach((leg, i) => {
        const coords = decodePolyline(leg.legGeometry.points);
        console.log(`journey: leg ${i} (${leg.mode}): ${coords.length} coords`);
        if (!coords.length) return;
        allCoords.push(...coords);
        const id = `journey-leg-${i}`;
        journeySourceIds.current.push(id);

        // Remove existing source/layers for this id before adding (idempotent)
        try { m.removeLayer(`${id}-line`); } catch {}
        try { m.removeLayer(`${id}-bg`); } catch {}
        try { m.removeSource(id); } catch {}

        try {
          m.addSource(id, {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
          });
          if (leg.mode === 'WALK') {
            m.addLayer({ id: `${id}-line`, type: 'line', source: id,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#9ca3af', 'line-width': 3, 'line-dasharray': [2, 3] },
            });
          } else {
            m.addLayer({ id: `${id}-bg`, type: 'line', source: id,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': '#ffffff', 'line-width': 7 },
            });
            m.addLayer({ id: `${id}-line`, type: 'line', source: id,
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': modeColor(leg.mode), 'line-width': 5 },
            });
          }
          console.log(`journey: leg ${i} added successfully`);
        } catch (err) {
          console.error(`journey: error adding leg ${i} (${leg.mode}):`, err);
        }

        // Add informational markers — skip if this leg's start overlaps with the next leg's start
        // (to avoid double-stacking at transfer points)
        const isFirstLeg = i === 0;
        const isLastLeg = i === itinerary.legs.length - 1;

        // Skip walk markers that start at the same place as start/end — those get dedicated markers
        const isAtStart = isFirstLeg;
        const isAtEnd = isLastLeg;

        // For walk legs, place the label at the midpoint of the walk to avoid overlap with adjacent transit markers
        if (leg.mode === 'WALK') {
          const walkMins = Math.round(leg.duration / 60);
          const walkDist = leg.distance < 1000 ? `${Math.round(leg.distance)}m` : `${(leg.distance / 1000).toFixed(1)}km`;
          if (walkMins > 0 && coords.length >= 2) {
            const midIdx = Math.floor(coords.length / 2);
            const midCoord = coords[midIdx];
            const walkEl = document.createElement('div');
            walkEl.style.cssText = 'pointer-events: none; display: flex; flex-direction: column; align-items: center;';
            walkEl.innerHTML = `
              <div style="background: white; border: 2px solid #9ca3af; border-radius: 50%; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 8px rgba(0,0,0,0.15); font-size: 14px;">
                🚶
              </div>
              <div style="background: white; color: #374151; font-size: 9px; font-weight: 700; padding: 1px 5px; border-radius: 6px; margin-top: 2px; box-shadow: 0 1px 4px rgba(0,0,0,0.12); white-space: nowrap; text-align: center;">
                ${walkMins} ${i18next.t('arrivals.min')} · ${walkDist}
              </div>
            `;
            journeyMarkers.current.push(
              new maplibregl.Marker({ element: walkEl, anchor: 'center' }).setLngLat(midCoord).addTo(m)
            );
          }
        } else {
          // Transit marker: place at boarding stop
          const color = modeColor(leg.mode);
          const routeLabel = leg.routeShortName || leg.mode;
          const el = document.createElement('div');
          el.style.cssText = 'pointer-events: none; display: flex; flex-direction: column; align-items: center;';
          el.innerHTML = `
            <div style="background: ${color}; color: white; border-radius: 12px; padding: 3px 8px; font-size: 11px; font-weight: 800; box-shadow: 0 2px 8px rgba(0,0,0,0.2); display: flex; align-items: center; gap: 3px; white-space: nowrap;">
              <span style="font-size: 12px;">${modeEmoji(leg.mode)}</span>
              ${routeLabel}
            </div>
            <div style="background: white; color: #374151; font-size: 9px; font-weight: 600; padding: 1px 5px; border-radius: 6px; margin-top: 2px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); white-space: nowrap; text-align: center; max-width: 130px; overflow: hidden; text-overflow: ellipsis;">
              ${leg.from.name || i18next.t('map.board')} · ${fmtTime(leg.startTime)}
            </div>
          `;
          // Offset transit markers slightly above the point so they don't overlap with start/end
          journeyMarkers.current.push(
            new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([leg.from.lon, leg.from.lat]).addTo(m)
          );

          // Alight marker — only if this is NOT the last leg (final destination gets its own marker)
          if (!isLastLeg) {
            const alightEl = document.createElement('div');
            alightEl.style.cssText = 'pointer-events: none; display: flex; flex-direction: column; align-items: center;';
            alightEl.innerHTML = `
              <div style="background: white; border: 2px solid ${color}; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; box-shadow: 0 1px 4px rgba(0,0,0,0.1);">
                <div style="width: 8px; height: 8px; border-radius: 50%; background: ${color};"></div>
              </div>
              <div style="background: white; color: #6b7280; font-size: 8px; font-weight: 600; padding: 1px 4px; border-radius: 4px; margin-top: 1px; box-shadow: 0 1px 2px rgba(0,0,0,0.08); white-space: nowrap; max-width: 100px; overflow: hidden; text-overflow: ellipsis;">
                ${leg.to.name || i18next.t('map.alight')} · ${fmtTime(leg.endTime)}
              </div>
            `;
            journeyMarkers.current.push(
              new maplibregl.Marker({ element: alightEl, anchor: 'top' }).setLngLat([leg.to.lon, leg.to.lat]).addTo(m)
            );
          }
        }
      });

      // Start marker (origin)
      const first = itinerary.legs[0];
      const last = itinerary.legs[itinerary.legs.length - 1];

      if (first) {
        const startEl = document.createElement('div');
        startEl.style.cssText = 'pointer-events: none; display: flex; flex-direction: column; align-items: center;';
        startEl.innerHTML = `
          <div style="background: #003571; color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(0,53,113,0.4); font-size: 18px; border: 3px solid white;">
            📍
          </div>
          <div style="background: #003571; color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-top: 2px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); white-space: nowrap;">
            ${i18next.t('map.start')} · ${fmtTime(itinerary.startTime)}
          </div>
        `;
        journeyMarkers.current.push(
          new maplibregl.Marker({ element: startEl, anchor: 'bottom' })
            .setLngLat([first.from.lon, first.from.lat])
            .addTo(m)
        );
      }

      // End marker (destination)
      if (last) {
        const endEl = document.createElement('div');
        endEl.style.cssText = 'pointer-events: none; display: flex; flex-direction: column; align-items: center;';
        endEl.innerHTML = `
          <div style="background: #DC143C; color: white; border-radius: 50%; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 10px rgba(220,20,60,0.4); font-size: 18px; border: 3px solid white;">
            🏁
          </div>
          <div style="background: #DC143C; color: white; font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 8px; margin-top: 2px; box-shadow: 0 2px 6px rgba(0,0,0,0.15); white-space: nowrap;">
            ${last.to.name || i18next.t('map.arrive')} · ${fmtTime(itinerary.endTime)}
          </div>
        `;
        journeyMarkers.current.push(
          new maplibregl.Marker({ element: endEl, anchor: 'bottom' })
            .setLngLat([last.to.lon, last.to.lat])
            .addTo(m)
        );
      }

      // Fit bounds
      if (allCoords.length) {
        const lngs = allCoords.map(c => c[0]);
        const lats = allCoords.map(c => c[1]);
        console.log('journey: fitting bounds, total coords:', allCoords.length);
        m.fitBounds(
          [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]],
          { padding: 80, duration: 800 }
        );
      }
    };

    // Try drawing immediately, on style load, and on idle — whichever fires first
    const onLoad = () => drawJourney();
    const onIdle = () => drawJourney();

    if (m.isStyleLoaded()) {
      console.log('journey: style already loaded, drawing');
      drawJourney();
    }
    m.once('load', onLoad);
    m.once('idle', onIdle);

    return () => {
      m.off('load', onLoad);
      m.off('idle', onIdle);
    };
  }, [location.search, styleLoadCount]);

  const handleLocateMe = () => {
    if (userLocation && map.current) {
      // Don't fly to 0,0
      if (Math.abs(userLocation[0]) < 0.1 && Math.abs(userLocation[1]) < 0.1) {
        alert(i18next.t('map.waitingGps'));
        return;
      }
      map.current.flyTo({
        center: userLocation,
        zoom: 15,
        essential: true
      });
    } else if (locationError) {
      alert(i18next.t('map.locationError', { error: locationError }));
    }
  };

  return (
    <div className="h-full w-full relative overflow-hidden bg-surface-container-high">
      <div className="absolute left-4 z-10 bg-surface-container-lowest/60 backdrop-blur-md px-2 py-1 rounded-full text-[8px] font-label font-bold text-secondary uppercase tracking-wider shadow-sm border border-outline-variant/20" style={{ top: 'calc(4.5rem + env(safe-area-inset-top))' }}>
        <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="no-underline text-inherit">OpenFreeMap</a>, <a href="https://www.openstreetmap.org" target="_blank" rel="noopener noreferrer" className="no-underline text-inherit">OSM</a>, <a href="https://www.opentripplanner.org" target="_blank" rel="noopener noreferrer" className="no-underline text-inherit">OTP</a> & <a href="https://transpordiamet.ee" target="_blank" rel="noopener noreferrer" className="no-underline text-inherit">Transpordiamet</a>
      </div>

      {/* Dark/Light Map Toggle */}
      <button
        onClick={async () => {
          if (!map.current) return;
          const goLight = isDarkMap;
          try {
            if (goLight) {
              map.current.setStyle('https://tiles.openfreemap.org/styles/bright');
            } else {
              const darkStyle = await fetchDarkMapStyle();
              map.current.setStyle(darkStyle);
            }
            setIsDarkMap(!isDarkMap);
          } catch (err) {
            console.error('Style toggle failed:', err);
          }
        }}
        className="absolute z-10 bg-white hover:bg-gray-100 p-1.5 rounded-md shadow-lg border border-surface-container-high transition-colors"
        style={{ top: 'calc(env(safe-area-inset-top) + 11.5rem)', right: '10px' }}
        title={isDarkMap ? 'Switch to light map' : 'Switch to dark map'}
      >
        {isDarkMap ? <Sun className="w-4 h-4 text-amber-500" /> : <Moon className="w-4 h-4 text-indigo-500" />}
      </button>



      {/* Service Alerts Button */}
      <button
        onClick={() => setShowAlertsPanel(true)}
        className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] left-4 z-10 bg-white hover:bg-gray-100 p-3 rounded-full shadow-lg border border-surface-container-high transition-colors group"
        title={t('map.serviceAlerts')}
      >
        <Construction className="w-5 h-5 text-red-500" />
        {serviceAlerts.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center leading-none">
            {serviceAlerts.length > 9 ? '9+' : serviceAlerts.length}
          </span>
        )}
      </button>

      <button 
        onClick={handleLocateMe}
        className="absolute bottom-[calc(6rem+env(safe-area-inset-bottom))] right-4 z-10 bg-white hover:bg-gray-100 p-3 rounded-full shadow-lg border border-surface-container-high transition-colors group"
        title={t('map.locateMe')}
      >
        <Navigation className={`w-5 h-5 ${userLocation ? 'text-blue-600 fill-blue-600' : 'text-primary'}`} />
      </button>

      <button
        onClick={() => navigate('/plan?to=home')}
        className="absolute bottom-[calc(9.5rem+env(safe-area-inset-bottom))] right-4 z-10 bg-white hover:bg-gray-100 p-3 rounded-full shadow-lg border border-surface-container-high transition-colors"
        title={t('home.takeMeHome')}
      >
        <Home className={`w-5 h-5 ${home ? 'text-primary' : 'text-secondary'}`} />
      </button>

      <div ref={mapContainer} className="w-full h-full" />
      
      {loadingDepartures && (
        <div className="absolute inset-0 bg-surface/20 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-surface p-4 rounded-full shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="font-headline font-bold text-primary">{t('map.fetchingDepartures')}</span>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selectedVehicle && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="vehicle-popup absolute bottom-0 left-0 right-0 z-50 rounded-t-[32px] editorial-shadow flex flex-col"
            style={{ maxHeight: 'calc(100vh - 4.5rem - env(safe-area-inset-top))', paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
          >
            <div className="w-full flex justify-center pt-3 pb-2" onClick={() => setSelectedVehicle(null)}>
              <div className="w-12 h-1.5 bg-outline-variant/30 rounded-full" />
            </div>
            
            <div className="px-6 pb-4 flex items-center justify-between border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center font-label font-bold text-base",
                  getVehicleColorClass(selectedVehicle.vehicle.type)
                )}>
                  {selectedVehicle.vehicle.line}
                </div>
                <div>
                  <h3 className="font-headline font-bold text-xl gradient-text leading-tight">
                    {selectedVehicle.vehicle.destination || t('map.unknownDestination')}
                  </h3>
                  <p className="font-label text-xs text-secondary font-bold uppercase tracking-widest mt-0.5">
                    {selectedVehicle.vehicle.type}{(() => {
                      const spd = selectedVehicle.vehicle.speed;
                      const maxSpd = selectedVehicle.vehicle.type === 'train' || selectedVehicle.vehicle.type === 'regional' ? 120 : 70;
                      return spd && spd > 0 && spd <= maxSpd ? ` • ${Math.round(spd)} km/h` : '';
                    })()}
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedVehicle(null)}
                className="p-2 rounded-full bg-surface-container-high text-secondary hover:text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              <div className="h-48 rounded-xl overflow-hidden bg-surface-container-high relative shrink-0">
                <VehicleMap routeStops={selectedVehicle.routeStops} targetStop={selectedVehicle.routeStops[0]} vehicle={selectedVehicle.vehicle} />
              </div>
              
              <div className="flex flex-col gap-2">
                <h4 className="font-label text-xs font-bold text-secondary uppercase tracking-widest px-2 gradient-text">{t('map.routeStops')}</h4>
                {selectedVehicle.routeStops.length === 0 ? (
                  <p className="text-sm text-secondary px-2">{t('map.routeNotAvailable')}</p>
                ) : (
                  selectedVehicle.routeStops.map((stop, idx) => {
                    const st = tripStoptimes.find(t => t.stopName === stop.name);
                    return (
                    <div key={idx} className="flex items-center gap-3 px-2 py-1">
                      <div className="flex flex-col items-center self-stretch">
                        <div className={cn(
                          "w-3 h-3 rounded-full border-2 z-10",
                          idx === 0 ? "bg-primary border-primary" : "bg-surface-container-lowest border-outline-variant"
                        )} />
                        {idx < selectedVehicle.routeStops.length - 1 && (
                          <div className="w-0.5 h-full bg-outline-variant/30 my-1" />
                        )}
                      </div>
                      <div className="pb-2 flex-1 flex items-center justify-between">
                        <span className={cn(
                          "font-headline font-bold text-sm",
                          idx === 0 ? "text-primary" : "text-secondary"
                        )}>
                          {stop.name}
                        </span>
                        {st && (
                          <span className="font-label text-xs text-secondary tabular-nums">{st.departureTime}</span>
                        )}
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Service Alerts Panel */}
      <AnimatePresence>
        {showAlertsPanel && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="absolute bottom-0 left-0 right-0 z-50 rounded-t-[32px] editorial-shadow bg-surface flex flex-col"
            style={{ maxHeight: 'calc(100vh - 4.5rem - env(safe-area-inset-top))', paddingBottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
          >
            <div className="w-full flex justify-center pt-3 pb-2" onClick={() => setShowAlertsPanel(false)}>
              <div className="w-12 h-1.5 bg-outline-variant/30 rounded-full" />
            </div>

            <div className="px-6 pb-4 flex items-center justify-between border-b border-outline-variant/10">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full flex items-center justify-center bg-red-100">
                  <TriangleAlert className="w-5 h-5 text-red-500" />
                </div>
                <h3 className="font-headline font-bold text-xl gradient-text leading-tight">
                  {t('map.serviceAlerts')}
                </h3>
              </div>
              <button
                onClick={() => setShowAlertsPanel(false)}
                className="p-2 rounded-full bg-surface-container-high text-secondary hover:text-primary transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-2">
              {serviceAlerts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-secondary">
                  <Construction className="w-12 h-12 mb-3 opacity-30" />
                  <p className="font-label font-bold text-sm">{t('map.noServiceAlerts')}</p>
                </div>
              ) : (
                serviceAlerts.map(alert => (
                  <div key={alert.id} className={cn(
                    "rounded-2xl p-3 border",
                    alert.type === 'interruption'
                      ? "bg-red-500/10 border-red-500/20"
                      : "bg-amber-500/10 border-amber-500/20"
                  )}>
                    <div className="flex items-center gap-2 mb-1.5">
                      {alert.routes.length > 0 && (
                        <div className="flex flex-wrap gap-1 shrink-0">
                          {alert.routes.map((r, i) => (
                            <span key={i} className={cn(
                              "text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none",
                              alert.type === 'interruption' ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                            )}>
                              {r.shortName}
                            </span>
                          ))}
                        </div>
                      )}
                      {(alert.effectiveStartDate || alert.effectiveEndDate) && (
                        <span className="font-label text-[9px] text-secondary/60 ml-auto shrink-0">
                          {alert.effectiveStartDate && new Date(alert.effectiveStartDate * 1000).toLocaleDateString()}
                          {alert.effectiveStartDate && alert.effectiveEndDate && ' – '}
                          {alert.effectiveEndDate && new Date(alert.effectiveEndDate * 1000).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="font-headline font-bold text-xs text-on-surface leading-snug">{alert.headerText}</p>
                    {alert.descriptionText && alert.descriptionText !== alert.headerText && (
                      <p className="font-body text-[11px] text-secondary leading-relaxed mt-1 line-clamp-2">{alert.descriptionText}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
