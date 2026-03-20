import React, { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchStops, fetchDepartures, fetchVehicles, fetchRoutes } from '../services/transportService';
import { getFavorites, toggleFavorite, isFavorite } from '../services/favoritesService';
import { Stop, Arrival, Vehicle } from '../types';
import { Bus, Loader2, Navigation } from 'lucide-react';

const TALLINN_CENTER: [number, number] = [24.7535, 59.437]; // [lng, lat]

const isValidLngLat = (lng: number, lat: number) => {
  return !isNaN(lng) && !isNaN(lat) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
};

export const Map = () => {
  console.log('Map component rendering');
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const vehicleMarkers = useRef<{ [id: string]: maplibregl.Marker }>({});
  const currentPopup = useRef<maplibregl.Popup | null>(null);
  const [loadingDepartures, setLoadingDepartures] = useState(false);

  const [stops, setStops] = useState<Stop[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
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
      }).catch(err => console.error('Error fetching vehicles:', err));
    };

    loadVehicles();
    const interval = setInterval(loadVehicles, 10000); // Update every 10 seconds

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (map.current || !mapContainer.current) return;
    
    console.log('Initializing map instance...');
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://tiles.openfreemap.org/styles/bright',
        center: TALLINN_CENTER,
        zoom: 13,
        attributionControl: false
      });

      map.current.addControl(new maplibregl.NavigationControl(), 'top-right');

      map.current.on('error', (e) => {
        console.error('MapLibre error:', e.error?.message || e);
      });

      map.current.on('load', () => {
        console.log('Map "load" event fired (count:', styleLoadCount + 1, ')');
        setStyleLoadCount(prev => prev + 1);
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
        // Update existing
        vehicleMarkers.current[vehicle.id].setLngLat([vehicle.lng, vehicle.lat]);
        const el = vehicleMarkers.current[vehicle.id].getElement();
        const icon = el.querySelector('.vehicle-icon') as HTMLElement;
        if (icon) {
          icon.style.transform = `rotate(${vehicle.bearing}deg)`;
        }
        const label = el.querySelector('.vehicle-label') as HTMLElement;
        if (label) {
          label.textContent = vehicle.line;
        }
      } else {
        // Create new
        const el = document.createElement('div');
        el.className = 'flex flex-col items-center justify-center pointer-events-none';
        
        let bgColor = 'bg-blue-500';
        if (vehicle.type === 'tram') bgColor = 'bg-orange-500';
        if (vehicle.type === 'trolley') bgColor = 'bg-green-500';

        el.innerHTML = `
          <div class="vehicle-label text-[10px] font-bold text-white ${bgColor} px-1.5 py-0.5 rounded-sm shadow-sm mb-0.5">
            ${vehicle.line}
          </div>
          <div class="vehicle-icon w-6 h-6 ${bgColor} rounded-full flex items-center justify-center shadow-md border-2 border-white transition-transform duration-1000" style="transform: rotate(${vehicle.bearing}deg)">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="3 11 22 2 13 21 11 13 3 11"></polygon>
            </svg>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([vehicle.lng, vehicle.lat])
          .addTo(map.current!);
          
        vehicleMarkers.current[vehicle.id] = marker;
      }
    });
  }, [vehicles, styleLoadCount]);

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
    const coordMap: Record<string, number> = {};
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
              13, 2,
              16, 6
            ],
            'circle-color': '#ff4444',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#ffffff',
            'circle-opacity': 0.8
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

      const { id, siriId, name } = feature.properties;
      const coordinates = (feature.geometry as any).coordinates.slice();
      
      setLoadingDepartures(true);
      let departures: Arrival[] = [];
      let errorMsg = '';
      try {
        departures = await fetchDepartures(id, siriId);
      } catch (err: any) {
        console.error('Error in handleStopClick:', err);
        errorMsg = err.message || 'Failed to fetch departures';
      }
      setLoadingDepartures(false);

      const popupContent = document.createElement('div');
      popupContent.className = 'p-4 pb-8 min-w-[240px] max-h-[50vh] overflow-y-auto overflow-x-hidden font-body no-scrollbar';
      
      let departuresHtml = '';
      if (errorMsg) {
        departuresHtml = `<div class="py-4 text-center text-red-500 font-label text-xs uppercase tracking-wider">${errorMsg}</div>`;
      } else if (departures.length > 0) {
        departuresHtml = departures.map(d => `
            <div class="flex items-center justify-between py-2 border-b border-surface-container-high last:border-0">
              <div class="flex items-center gap-3">
                <div class="bg-tertiary text-white w-8 h-8 rounded-full flex items-center justify-center font-label font-bold text-xs">
                  ${d.line}
                </div>
                <div class="flex flex-col">
                  <span class="font-headline font-bold text-sm text-primary">${d.destination}</span>
                  <span class="text-[9px] font-label uppercase text-secondary font-bold">${d.type}</span>
                </div>
              </div>
              <div class="text-right">
                <span class="font-headline font-black text-lg text-primary">
                  ${d.minutes > 30 && d.time ? d.time : (d.minutes <= 0 ? 'Now' : d.minutes)}
                  <span class="text-[10px] ml-0.5">${d.minutes > 30 && d.time ? '' : (d.minutes <= 0 ? '' : 'MIN')}</span>
                </span>
              </div>
            </div>
          `).join('');
      } else {
        departuresHtml = `<div class="py-4 text-center text-secondary font-label text-xs uppercase tracking-wider">No departures scheduled</div>`;
      }

      const lastUpdated = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const isFav = isFavorite(id);

      popupContent.innerHTML = `
        <div class="mb-3 pl-16 relative pr-4">
          <button id="refresh-btn" class="absolute top-0 left-0 p-1.5 hover:bg-surface-container-high rounded-full transition-colors group">
            <svg class="w-4 h-4 text-secondary group-hover:text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path></svg>
          </button>
          <button id="fav-btn" class="absolute top-0 left-8 p-1.5 hover:bg-surface-container-high rounded-full transition-colors group ${isFav ? 'text-amber-400' : 'text-secondary'}">
            <svg class="w-4 h-4 ${isFav ? 'fill-current' : ''}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
          </button>
          <h3 class="font-headline font-black text-primary text-lg leading-tight">${name}</h3>
          <p class="text-[10px] font-label uppercase tracking-widest text-secondary font-bold">ID: ${siriId || id}</p>
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
          handleStopClick(feature);
        });
      }

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

      const popup = new maplibregl.Popup({ offset: 10, maxWidth: '300px' })
        .setLngLat(coordinates)
        .setDOMContent(popupContent)
        .addTo(m);
      
      currentPopup.current = popup;
      
      popup.on('close', () => {
        if (currentPopup.current === popup) {
          currentPopup.current = null;
        }
      });
    };

    m.on('click', 'stops-layer', handleStopClick);

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

  return (
    <div className="h-[calc(100vh-140px)] w-full relative overflow-hidden bg-surface-container-high">
      <div className="absolute top-4 left-4 z-50 bg-white/80 backdrop-blur-md px-3 py-2 rounded-lg shadow-sm text-[10px] font-mono border border-primary/5 pointer-events-none">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${styleLoadCount > 0 ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className="opacity-70">{styleLoadCount > 0 ? 'Map Ready' : 'Loading...'}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${stops.length > 0 ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className="opacity-70">{stops.length} stops</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${vehicles.length > 0 ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
            <span className="opacity-70">{vehicles.length} vehicles</span>
          </div>
        </div>
      </div>

      <div ref={mapContainer} className="w-full h-full" />
      
      {loadingDepartures && (
        <div className="absolute inset-0 bg-surface/20 backdrop-blur-[2px] z-50 flex items-center justify-center">
          <div className="bg-surface p-4 rounded-full shadow-xl flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-primary animate-spin" />
            <span className="font-headline font-bold text-primary">Fetching departures...</span>
          </div>
        </div>
      )}

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-white/60 backdrop-blur-lg px-4 py-1.5 rounded-full shadow-sm border border-white/20 z-10 transition-all hover:bg-white/80">
        <p className="font-label text-[10px] uppercase tracking-[0.15em] text-primary/80 font-bold whitespace-nowrap">
          Click a stop for live departures
        </p>
      </div>
    </div>
  );
};
