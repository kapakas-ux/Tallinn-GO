import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Stop } from '../types';

interface MiniMapProps {
  userLocation: { lat: number; lng: number } | null;
  stops: Stop[];
  onStopClick?: (stop: Stop) => void;
}

export const MiniMap = ({ userLocation, stops, onStopClick }: MiniMapProps) => {
  const mapContainer = useRef(null as HTMLDivElement | null);
  const map = useRef(null as maplibregl.Map | null);
  const markers = useRef([] as maplibregl.Marker[]);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://tiles.openfreemap.org/styles/bright',
      center: userLocation ? [userLocation.lng, userLocation.lat] : [24.7535, 59.4370],
      zoom: 14,
      attributionControl: false,
      interactive: true
    });

    // Disable scroll zoom for hero map to prevent accidental scrolling while navigating the page
    map.current.scrollZoom.disable();

    map.current.on('load', () => {
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

    return () => {
      map.current?.remove();
    };
  }, []);

  useEffect(() => {
    if (!map.current) return;

    // Clear old markers
    markers.current.forEach(m => m.remove());
    markers.current = [];

    const bounds = new maplibregl.LngLatBounds();

    // User marker
    if (userLocation) {
      const el = document.createElement('div');
      el.className = 'relative flex items-center justify-center w-6 h-6';
      el.innerHTML = `
        <div class="absolute w-full h-full bg-blue-500 rounded-full opacity-20 animate-ping"></div>
        <div class="relative w-3 h-3 bg-blue-600 rounded-full border-2 border-white shadow-lg"></div>
      `;
      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(map.current);
      markers.current.push(marker);
      bounds.extend([userLocation.lng, userLocation.lat]);
    }

    // Stop markers
    stops.forEach((stop, idx) => {
      const el = document.createElement('div');
      // Highlight the first (closest) stop with a larger marker or different style
      const isClosest = idx === 0;
      el.className = `flex items-center justify-center rounded-full border-2 border-white shadow-md cursor-pointer ${
        isClosest ? 'w-8 h-8 bg-primary z-10' : 'w-6 h-6 bg-secondary'
      }`;
      
      // Add a small dot or icon inside
      el.innerHTML = `
        <div class="w-1.5 h-1.5 bg-white rounded-full"></div>
      `;
      
      el.onclick = (e) => {
        e.stopPropagation();
        if (onStopClick) onStopClick(stop);
      };

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.lng, stop.lat])
        .addTo(map.current!);
      markers.current.push(marker);
      bounds.extend([stop.lng, stop.lat]);
    });

    if (!bounds.isEmpty()) {
      map.current.fitBounds(bounds, { 
        padding: { top: 40, bottom: 40, left: 40, right: 40 }, 
        maxZoom: 16, 
        duration: 1000 
      });
    }
  }, [userLocation, stops]);

  return <div ref={mapContainer} className="w-full h-full" />;
};
