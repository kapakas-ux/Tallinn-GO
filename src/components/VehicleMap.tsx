import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Stop, Vehicle } from '../types';
import { cn } from '../lib/utils';

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
      const el = document.createElement('div');
      el.className = 'w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-md z-30';
      
      vehicleMarker.current = new maplibregl.Marker({ element: el })
        .setLngLat([vehicle.lng, vehicle.lat])
        .addTo(map.current);
    } else {
      vehicleMarker.current.setLngLat([vehicle.lng, vehicle.lat]);
    }
  }, [vehicle, isMapReady]);

  return <div ref={mapContainer} className="w-full h-full rounded-xl overflow-hidden" />;
};
