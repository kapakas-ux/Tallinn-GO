import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Loader2, MapPin, Navigation } from 'lucide-react';
import { planJourney } from '../services/transportService';
import { decodePolyline } from '../lib/geo';
import { fetchDarkMapStyle } from '../lib/mapStyles';
import { getSettings } from '../services/settingsService';
import type { PlanItinerary, LegMode } from '../types';

const modeColor = (mode: LegMode) => {
  if (mode === 'TRAM') return '#DC143C';
  if (mode === 'RAIL') return '#f37021';
  if (mode === 'BUS')  return '#003571';
  return '#9ca3af';
};

export const ShareTrip = () => {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const [itinerary, setItinerary] = useState<PlanItinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const markers = useRef<maplibregl.Marker[]>([]);
  const sourceIds = useRef<string[]>([]);

  const fromName = searchParams.get('from') || 'Start';
  const toName = searchParams.get('to') || 'Destination';
  const flat = parseFloat(searchParams.get('flat') || '');
  const flng = parseFloat(searchParams.get('flng') || '');
  const tlat = parseFloat(searchParams.get('tlat') || '');
  const tlng = parseFloat(searchParams.get('tlng') || '');

  useEffect(() => {
    if (isNaN(flat) || isNaN(flng) || isNaN(tlat) || isNaN(tlng)) {
      setError(t('share.invalidCoords', 'Invalid coordinates'));
      setLoading(false);
      return;
    }
    planJourney(flat, flng, tlat, tlng, 1).then(results => {
      setItinerary(results?.[0] || null);
      setLoading(false);
    }).catch(err => {
      setError(err.message || t('share.planError', 'Could not plan journey'));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!itinerary || !mapContainer.current) return;
    const init = async () => {
      const theme = getSettings().theme;
      const isDark = theme === 'plum' || theme === 'havgra' || theme === 'minimal';
      let style: any = 'https://tiles.openfreemap.org/styles/bright';
      if (isDark) { try { style = await fetchDarkMapStyle(); } catch {} }
      const m = new maplibregl.Map({
        container: mapContainer.current!, style, center: [flng, flat], zoom: 13, attributionControl: false,
      });
      map.current = m;
      m.on('style.load', () => {
        const allCoords: [number, number][] = [];
        itinerary.legs.forEach((leg, i) => {
          const coords = decodePolyline(leg.legGeometry.points);
          if (!coords.length) return;
          allCoords.push(...coords);
          const id = "share-leg-" + i;
          sourceIds.current.push(id);
          try {
            m.addSource(id, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} } });
            if (leg.mode === 'WALK') {
              m.addLayer({ id: id + '-line', type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#9ca3af', 'line-width': 3, 'line-dasharray': [2, 3] } });
            } else {
              m.addLayer({ id: id + '-bg', type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': 6 } });
              m.addLayer({ id: id + '-line', type: 'line', source: id, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': modeColor(leg.mode), 'line-width': 4 } });
            }
          } catch {}
        });
        const mkEl = (lng: number, lat: number, color: string, emoji: string, label: string) => {
          const el = document.createElement('div');
          el.style.cssText = 'pointer-events:none;display:flex;flex-direction:column;align-items:center;';
          el.innerHTML = '<div style=background:' + color + ';color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:16px;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.2);>' + emoji + '</div><div style=background:' + color + ';color:white;font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;margin-top:2px;white-space:nowrap;>' + label + '</div>';
          markers.current.push(new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(m));
        };
        const first = itinerary.legs[0], last = itinerary.legs[itinerary.legs.length - 1];
        mkEl(first.from.lon, first.from.lat, '#003571', '\uD83D\uDCCD', fromName);
        mkEl(last.to.lon, last.to.lat, '#DC143C', '\uD83C\uDFC1', toName);
        if (allCoords.length) {
          const lngs = allCoords.map(c => c[0]), lats = allCoords.map(c => c[1]);
          m.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 60 });
        }
      });
    };
    init();
    return () => {
      markers.current.forEach(mk => mk.remove()); markers.current = [];
      sourceIds.current.forEach(id => { try { map.current?.removeLayer(id + '-line'); } catch {}; try { map.current?.removeLayer(id + '-bg'); } catch {}; try { map.current?.removeSource(id); } catch {} });
      sourceIds.current = []; map.current?.remove();
    };
  }, [itinerary]);

  const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });

  const modeLabel = (mode: LegMode) => {
    if (mode === 'BUS') return t('planner.bus', 'Bus');
    if (mode === 'TRAM') return t('planner.tram', 'Tram');
    if (mode === 'RAIL') return t('planner.train', 'Train');
    if (mode === 'FERRY') return t('planner.ferry', 'Ferry');
    return mode;
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <div className="flex items-center gap-3 px-5 py-4 bg-surface-container-lowest border-b border-outline-variant/10" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}>
        <img src="/logo.png" alt="GO NOW" className="h-6" />
        <span className="font-label text-[10px] text-secondary uppercase tracking-widest">{t('share.title', 'Trip shared from GO NOW')}</span>
      </div>
      <div ref={mapContainer} className="w-full h-[40vh] shrink-0" />
      <div className="flex-1 p-5 space-y-4">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-secondary" /></div>
        ) : error ? (
          <p className="text-center text-error py-8">{error}</p>
        ) : itinerary ? (
          <>
            <div className="flex items-center gap-3 bg-surface-container-lowest rounded-2xl p-4">
              <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0"><Navigation className="w-4 h-4 text-blue-500" /></div>
              <div className="min-w-0"><p className="font-headline font-bold text-sm text-primary truncate">{fromName}</p><p className="text-[10px] text-secondary">{fmtTime(itinerary.startTime)}</p></div>
            </div>
            <div className="flex items-center gap-3 bg-surface-container-lowest rounded-2xl p-4">
              <div className="w-8 h-8 rounded-full bg-red-500/10 flex items-center justify-center shrink-0"><MapPin className="w-4 h-4 text-red-500" /></div>
              <div className="min-w-0"><p className="font-headline font-bold text-sm text-primary truncate">{toName}</p><p className="text-[10px] text-secondary">{fmtTime(itinerary.endTime)} · {Math.round(itinerary.duration / 60)} min</p></div>
            </div>
            <div className="space-y-1">
              {itinerary.legs.map((leg, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-2">
                  <span className="text-secondary w-12 text-right shrink-0">{fmtTime(leg.startTime)}</span>
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                  <span className="text-primary truncate">
                    {leg.mode === 'WALK'
                      ? `${Math.round(leg.distance)}m ${t('planner.walk', 'walk')}`
                      : `${modeLabel(leg.mode)} ${leg.routeShortName || ''}`}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
        <a href="/" className="block w-full py-3 bg-primary text-white rounded-xl font-headline font-bold text-sm text-center mt-4">{t('share.openApp', 'Open GO NOW')}</a>
      </div>
    </div>
  );
};