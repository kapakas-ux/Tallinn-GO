import React, { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'react-router-dom';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchStops, fetchDepartures, fetchVehicles, fetchRoutes } from '../services/transportService';
import { getFavorites, toggleFavorite, isFavorite } from '../services/favoritesService';
import { watchLocation, TALLINN_CENTER as TALLINN_CENTER_COORD } from '../services/locationService';
import { Stop, Arrival, Vehicle } from '../types';
import { Bus, Loader2, Navigation, Footprints, Bell, X } from 'lucide-react';
import { getDistance } from '../lib/geo';
import { cn, formatDistance, formatWalkingTime, getVehicleColorClass } from '../lib/utils';
import { scheduleDepartureNotification } from '../services/notificationService';
import { addActiveAlert, getActiveAlerts, isAlertActive } from '../services/alertService';
import { getRouteStopsForVehicle } from '../services/transportService';
import { VehicleMap } from '../components/VehicleMap';
import { AnimatePresence, motion } from 'motion/react';

const TALLINN_CENTER: [number, number] = [TALLINN_CENTER_COORD.lng, TALLINN_CENTER_COORD.lat]; // [lng, lat]

const isValidLngLat = (lng: number, lat: number) => {
  return !isNaN(lng) && !isNaN(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const Map = () => {
  console.log('Map component rendering');
  const location = useLocation();
  const mapContainer = useRef(null as HTMLDivElement | null);
  const map = useRef(null as maplibregl.Map | null);
  const markers = useRef([] as maplibregl.Marker[]);
  const vehicleMarkers = useRef({} as { [id: string]: maplibregl.Marker });
  const vehicleInterpolation = useRef({} as { [id: string]: { current: [number, number], target: [number, number], lastUpdate: number } });
  const userMarker = useRef(null as maplibregl.Marker | null);
  const pulsatingMarker = useRef(null as maplibregl.Marker | null);
  const currentPopup = useRef(null as maplibregl.Popup | null);
  const [loadingDepartures, setLoadingDepartures] = useState(false);
  const [userLocation, setUserLocation] = useState(null as [number, number] | null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [locationError, setLocationError] = useState(null as string | null);
  const [pulsatingStopId, setPulsatingStopId] = useState(null as string | null);
  const [scheduledAlerts, setScheduledAlerts] = useState<any[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<{ vehicle: Vehicle, routeStops: Stop[] } | null>(null);

  const [stops, setStops] = useState([] as Stop[]);
  const [vehicles, setVehicles] = useState([] as Vehicle[]);
  const [styleLoadCount, setStyleLoadCount] = useState(0);

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
        setVehicles(data);
      }).catch(err => {
        console.error('Error fetching vehicles:', err);
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

  // Geolocation tracking
  useEffect(() => {
    const cleanup = watchLocation((location, simulated) => {
      setUserLocation([location.lng, location.lat]);
      setIsSimulated(simulated);
      setLocationError(null);
    });

    return cleanup;
  }, []);

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
    try {
      const searchParams = new URLSearchParams(location.search);
      const latParam = searchParams.get('lat');
      const lngParam = searchParams.get('lng');
      const zoomParam = searchParams.get('zoom');

      const initialCenter: [number, number] = latParam && lngParam 
        ? [parseFloat(lngParam), parseFloat(latParam)] 
        : TALLINN_CENTER;
      const initialZoom = zoomParam ? parseFloat(zoomParam) : 13;

      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://tiles.openfreemap.org/styles/bright',
        center: initialCenter,
        zoom: initialZoom,
        attributionControl: false
      });

      map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

      // Double tap to clear pulsating effect
      map.current.on('dblclick', (e) => {
        // Prevent default zoom on dblclick if we want to handle it specifically
        // e.preventDefault(); 
        setPulsatingStopId(null);
      });

      map.current.on('error', (e) => {
        console.error('MapLibre error:', e.error?.message || e);
      });

      map.current.on('load', () => {
        console.log('Map "load" event fired (count:', styleLoadCount + 1, ')');
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
                    map.current.setFilter(layer.id, ['all', currentFilter, ['!=', ['get', 'class'], 'bus']]);
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
        const visible = currentZoom >= 13;
        Object.values(vehicleMarkers.current).forEach((marker: maplibregl.Marker) => {
          marker.getElement().style.display = visible ? 'block' : 'none';
        });
      });

      map.current.on('move', () => {
        const currentZoom = map.current?.getZoom() || 0;
        const visible = currentZoom >= 13;
        Object.values(vehicleMarkers.current).forEach((marker: maplibregl.Marker) => {
          marker.getElement().style.display = visible ? 'block' : 'none';
        });
      });

    } catch (err) {
      console.error('Error initializing map:', err);
    }

    return () => {
      console.log('Map component unmounting');
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Update vehicle markers
  useEffect(() => {
    if (!map.current || styleLoadCount === 0) return;

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
        const startPos = prevData ? prevData.target : [vehicle.lng, vehicle.lat];
        
        vehicleInterpolation.current[vehicle.id] = {
          current: startPos,
          target: [vehicle.lng, vehicle.lat],
          lastUpdate: Date.now()
        };

        const el = vehicleMarkers.current[vehicle.id].getElement();
        
        const currentZoom = map.current?.getZoom() || 0;
        const visible = currentZoom >= 13;
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
            <div class="vehicle-label absolute bottom-full mb-1 text-[8px] font-bold text-white ${bgColor} opacity-80 px-1 py-0.5 rounded-sm shadow-sm whitespace-nowrap">
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
          const routeStops = await getRouteStopsForVehicle(vehicle);
          setSelectedVehicle({ vehicle, routeStops });
        });

        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([vehicle.lng, vehicle.lat])
          .addTo(map.current!);
          
        const currentZoom = map.current?.getZoom() || 0;
        const visible = currentZoom >= 13;
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
      popupContent.className = 'p-4 pb-8 min-w-[240px] max-h-[50vh] overflow-y-auto overflow-x-hidden font-body no-scrollbar';
      
      let intervalId: any;

      const updateContent = async (isLoading: boolean) => {
        let departures: Arrival[] = [];
        let errorMsg = '';
        
        if (!isLoading) {
          try {
            departures = await fetchDepartures(id, siriId);
          } catch (err: any) {
            console.error('Error in handleStopClick:', err);
            errorMsg = err.message || 'No live data';
          }
        }

        let departuresHtml = '';
        if (isLoading) {
          departuresHtml = `<div class="py-4 text-center text-secondary font-label text-xs uppercase tracking-wider">Loading...</div>`;
        } else if (errorMsg) {
          departuresHtml = `<div class="py-4 text-center text-red-500 font-label text-xs uppercase tracking-wider">${errorMsg}</div>`;
        } else if (departures.length > 0) {
          departuresHtml = departures.map(d => {
            const isScheduled = isAlertActive(id, d.line, d.minutes);
            const showAlarm = d.minutes > 15 && d.status !== 'departed';
            
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
                    ${d.isRealtime ? '<div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-0.5 self-center"></div>' : ''}
                    <span class="font-headline font-black text-lg text-primary">
                      ${d.minutes > 60 && d.time ? d.time : (d.minutes === 0 ? 'Now' : d.minutes + '<span class="text-[10px] ml-0.5 font-bold">min</span>')}
                    </span>
                  </div>
                </div>
              </div>
            `;
          }).join('');
        } else {
          departuresHtml = `<div class="py-4 text-center text-secondary font-label text-xs uppercase tracking-wider">No departures scheduled</div>`;
        }

        const lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
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
          distanceHtml = `<p class="text-[10px] font-label uppercase tracking-wider text-secondary font-bold">ID: ${siriId || id}</p>`;
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
            Updated ${lastUpdated}
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
            overlay.className = 'absolute inset-0 bg-surface-container-lowest/95 z-50 flex flex-col items-center justify-center p-4 text-center rounded-[20px]';
            overlay.innerHTML = `
              <h4 class="font-headline font-bold text-xs text-primary uppercase tracking-widest mb-2">Set Alert</h4>
              <p class="text-[10px] text-secondary mb-4 leading-tight">Notify me before ${line} to ${dest} departs.</p>
              <div class="flex flex-col gap-2 w-full">
                <button id="alert-5" class="py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors">5 Mins Before</button>
                <button id="alert-10" class="py-2 bg-primary/5 hover:bg-primary/10 text-primary font-headline font-bold text-xs rounded-xl transition-colors">10 Mins Before</button>
                <button id="alert-cancel" class="py-1 text-[10px] text-secondary hover:text-primary mt-1 uppercase font-bold tracking-widest">Cancel</button>
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
            overlay.querySelector('#alert-10')?.addEventListener('click', () => handleChoice(10));
            overlay.querySelector('#alert-cancel')?.addEventListener('click', () => overlay.remove());
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

  const handleLocateMe = () => {
    if (userLocation && map.current) {
      // Don't fly to 0,0
      if (Math.abs(userLocation[0]) < 0.1 && Math.abs(userLocation[1]) < 0.1) {
        alert('Waiting for GPS...');
        return;
      }
      map.current.flyTo({
        center: userLocation,
        zoom: 15,
        essential: true
      });
    } else if (locationError) {
      alert(`Location error: ${locationError}`);
    }
  };

  return (
    <div className="h-full w-full relative overflow-hidden bg-surface-container-high">
      <div className="absolute top-4 left-4 z-10 bg-surface-container-lowest/60 backdrop-blur-md px-2 py-1 rounded-full text-[8px] font-label font-bold text-secondary uppercase tracking-wider pointer-events-none shadow-sm border border-outline-variant/20">
        OpenFreeMap, OSM & Transpordiamet
      </div>

      <button 
        onClick={handleLocateMe}
        className="absolute bottom-4 right-4 z-10 bg-white p-3 rounded-full shadow-lg border border-surface-container-high hover:bg-surface-container-low transition-colors group"
        title="Locate me"
      >
        <Navigation className={`w-5 h-5 ${userLocation ? 'text-blue-600 fill-blue-600' : 'text-primary'}`} />
      </button>

      <div ref={mapContainer} className="w-full h-full" />
      
      {loadingDepartures && (
        <div className="absolute inset-0 bg-surface/20 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-surface p-4 rounded-full shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="font-headline font-bold text-primary">Fetching departures...</span>
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
            className="absolute bottom-0 left-0 right-0 z-50 bg-surface-container-lowest rounded-t-[32px] editorial-shadow flex flex-col max-h-[80vh]"
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
                  <h3 className="font-headline font-bold text-xl text-primary leading-tight">
                    {selectedVehicle.vehicle.destination || 'Unknown Destination'}
                  </h3>
                  <p className="font-label text-xs text-secondary font-bold uppercase tracking-widest mt-0.5">
                    {selectedVehicle.vehicle.type} • {Math.round(selectedVehicle.vehicle.speed || 0)} km/h
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
              <div className="h-48 rounded-xl overflow-hidden bg-surface-container relative shrink-0">
                <VehicleMap routeStops={selectedVehicle.routeStops} targetStop={selectedVehicle.routeStops[0]} />
              </div>
              
              <div className="flex flex-col gap-2">
                <h4 className="font-label text-xs font-bold text-secondary uppercase tracking-widest px-2">Route Stops</h4>
                {selectedVehicle.routeStops.length === 0 ? (
                  <p className="text-sm text-secondary px-2">Route data not available</p>
                ) : (
                  selectedVehicle.routeStops.map((stop, idx) => (
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
                      <div className="pb-2">
                        <span className={cn(
                          "font-headline font-bold text-sm",
                          idx === 0 ? "text-primary" : "text-secondary"
                        )}>
                          {stop.name}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
