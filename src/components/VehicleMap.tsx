import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Stop, Vehicle } from '../types';
import { cn } from '../lib/utils';

function getVehicleColor(type: string): string {
  switch (type) {
    case 'tram': return '#DC143C';
    case 'trolley': return '#003571';
    case 'train': return '#f37021';
    case 'regional': return '#059669';
    default: return '#003571';
  }
}

interface VehicleMapProps {
  routeStops: Stop[];
  targetStop?: Stop;
  vehicle?: Vehicle;
}

export const VehicleMap = ({ routeStops, targetStop, vehicle }: VehicleMapProps) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const stopMarkers = useRef<maplibregl.Marker[]>([]);
  const vehicleMarker = useRef<maplibregl.Marker | null>(null);
  const isFirstFit = useRef(true);
  const [isMapReady, setIsMapReady] = React.useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const initialCenter = targetStop ? [targetStop.lng, targetStop.lat] : (routeStops.length > 0 ? [routeStops[0].lng, routeStops[0].lat] : [24.7536, 59.4370]);

    const newMap = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: initialCenter as [number, number],
      zoom: 14,
      attributionControl: false,
      interactive: true
    });

    newMap.scrollZoom.disable();
    map.current = newMap;
    
    newMap.on('load', () => {
      setIsMapReady(true);
    });

    return () => {
      newMap.remove();
      map.current = null;
    };
  }, []); // Only run once

  // Handle route stops and route line
  useEffect(() => {
    if (!isMapReady || !map.current) return;

    // Clear old stop markers
    stopMarkers.current.forEach(m => m.remove());
    stopMarkers.current = [];

    const bounds = new maplibregl.LngLatBounds();

    // Route stops markers
    routeStops.forEach((stop) => {
      const isTarget = targetStop && (
        stop.id === targetStop.id || 
        stop.id.startsWith(targetStop.id.split('-')[0] + '-') ||
        stop.name.toLowerCase() === targetStop.name.toLowerCase()
      );
      
      const el = document.createElement('div');
      if (isTarget) {
        el.className = 'relative flex items-center justify-center w-6 h-6 z-20';
        el.innerHTML = `
          <div class="absolute w-full h-full bg-primary rounded-full opacity-40 animate-ping"></div>
          <div class="relative w-3 h-3 bg-primary rounded-full border-2 border-white shadow-sm"></div>
        `;
      } else {
        el.className = 'w-3 h-3 bg-white border-2 border-primary rounded-full shadow-sm z-10';
      }
      
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map.current!);
      stopMarkers.current.push(marker);
      bounds.extend([stop.lng, stop.lat]);
    });

    // Add or update route line and stop labels
    const updateRouteData = () => {
      if (!map.current) return;
      const coordinates = routeStops.map(s => [s.lng, s.lat]);
      
      // Update route line
      if (map.current.getSource('route')) {
        (map.current.getSource('route') as maplibregl.GeoJSONSource).setData({
          type: 'Feature',
          properties: {},
          geometry: {
            type: 'LineString',
            coordinates: coordinates
          }
        });
      } else if (coordinates.length > 1) {
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: coordinates
            }
          }
        });

        map.current.addLayer({
          id: 'route',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#0052cc', // primary color
            'line-width': 4,
            'line-opacity': 0.5
          }
        });
      }

      // Update stop labels
      const stopsGeoJSON: any = {
        type: 'FeatureCollection',
        features: routeStops.map(s => ({
          type: 'Feature',
          properties: { name: s.name },
          geometry: {
            type: 'Point',
            coordinates: [s.lng, s.lat]
          }
        }))
      };

      if (map.current.getSource('route-stops')) {
        (map.current.getSource('route-stops') as maplibregl.GeoJSONSource).setData(stopsGeoJSON);
      } else {
        map.current.addSource('route-stops', {
          type: 'geojson',
          data: stopsGeoJSON
        });

        map.current.addLayer({
          id: 'route-stops-labels',
          type: 'symbol',
          source: 'route-stops',
          minzoom: 12,
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Open Sans Regular'],
            'text-size': 10,
            'text-offset': [0, 1.2],
            'text-anchor': 'top',
            'text-allow-overlap': false,
            'text-ignore-placement': false
          },
          paint: {
            'text-color': '#0052cc',
            'text-halo-color': '#ffffff',
            'text-halo-width': 1.5
          }
        });
      }
    };

    if (map.current.isStyleLoaded()) {
      updateRouteData();
    } else {
      map.current.once('load', updateRouteData);
    }

    // Fit bounds only on initial load of stops
    if (routeStops.length > 0 && isFirstFit.current) {
      if (!bounds.isEmpty()) {
        map.current.fitBounds(bounds, { 
          padding: { top: 40, bottom: 40, left: 40, right: 40 }, 
          maxZoom: 16, 
          duration: 1000 
        });
        isFirstFit.current = false;
      }
    }
  }, [routeStops, targetStop, isMapReady]);

  // Handle vehicle marker
  useEffect(() => {
    if (!isMapReady || !map.current || !vehicle) return;

    if (!vehicleMarker.current) {
      const color = getVehicleColor(vehicle.type);
      const el = document.createElement('div');
      el.className = 'flex items-center justify-center z-30';
      el.style.width = '28px';
      el.style.height = '28px';
      el.innerHTML = `
        <div style="width:28px;height:28px;border-radius:50%;border:3px solid ${color};background:white;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,0.25);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/>
          </svg>
        </div>
      `;
      
      vehicleMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([vehicle.lng, vehicle.lat])
        .addTo(map.current);
    } else {
      vehicleMarker.current.setLngLat([vehicle.lng, vehicle.lat]);
    }
  }, [vehicle, isMapReady]);

  return <div ref={mapContainer} className="w-full h-full rounded-xl overflow-hidden" />;
};
