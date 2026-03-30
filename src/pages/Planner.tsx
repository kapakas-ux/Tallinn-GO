import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Navigation, ArrowUpDown, History, Filter, Bus, TrainFront as Tram, MoveRight, Footprints, Search, X, Loader2 } from 'lucide-react';
import { MOCK_ROUTES } from '../mockData';
import { cn, getVehicleColorClass } from '../lib/utils';
import { fetchStops } from '../services/transportService';
import { watchLocation } from '../services/locationService';
import { Stop } from '../types';

export const Planner = () => {
  const navigate = useNavigate();
  const [from, setFrom] = useState('Current Location');
  const [to, setTo] = useState('Tallinn Airport (TLL)');
  const [userCoords, setUserCoords] = useState(null as { lat: number; lng: number } | null);
  const [isSimulated, setIsSimulated] = useState(false);
  const [stops, setStops] = useState([] as Stop[]);
  const [suggestions, setSuggestions] = useState([] as Stop[]);
  const [activeInput, setActiveInput] = useState(null as 'from' | 'to' | null);
  const [isLoading, setIsLoading] = useState(false);
  const [routes, setRoutes] = useState(MOCK_ROUTES);
  const [showResults, setShowResults] = useState(true);

  const containerRef = useRef(null as HTMLDivElement | null);

  const [expandedRoute, setExpandedRoute] = useState(null as string | null);

  useEffect(() => {
    fetchStops().then(setStops);

    const cleanup = watchLocation((location, simulated) => {
      setUserCoords(location);
      setIsSimulated(simulated);
    });

    return cleanup;
  }, []);

  const handleGo = (e: React.MouseEvent) => {
    e.stopPropagation();
    const destinationStop = stops.find(s => s.name === to);
    if (destinationStop) {
      navigate(`/map?lat=${destinationStop.lat}&lng=${destinationStop.lng}&zoom=16`);
    } else if (userCoords) {
      navigate(`/map?lat=${userCoords.lat}&lng=${userCoords.lng}&zoom=16`);
    } else {
      navigate('/map');
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setActiveInput(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearch = (query: string, type: 'from' | 'to') => {
    if (type === 'from') setFrom(query);
    else setTo(query);

    if (query.length > 1) {
      const filtered = stops
        .filter(s => s.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 5);
      setSuggestions(filtered);
      setActiveInput(type);
    } else {
      setSuggestions([]);
      setActiveInput(null);
    }
  };

  const selectSuggestion = (stop: Stop) => {
    if (activeInput === 'from') setFrom(stop.name);
    else setTo(stop.name);
    setActiveInput(null);
    setSuggestions([]);
  };

  const swapLocations = () => {
    const temp = from;
    setFrom(to);
    setTo(temp);
  };

  const findRoutes = () => {
    if (!from || !to) return;
    
    setIsLoading(true);
    setShowResults(false);
    
    // Simulate API call with more "realistic" generated routes
    setTimeout(() => {
      setIsLoading(false);
      setShowResults(true);
      
      const now = new Date();
      const formatTime = (date: Date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      
      const generatedRoutes = [
        {
          id: `r-${Date.now()}-1`,
          duration: 15 + Math.floor(Math.random() * 10),
          startTime: formatTime(new Date(now.getTime() + 2 * 60000)),
          endTime: formatTime(new Date(now.getTime() + 22 * 60000)),
          type: 'fastest' as const,
          transfers: 0,
          leavesIn: 2,
          segments: [
            { type: 'bus' as const, line: ['67', '68', '18', '5', '73'][Math.floor(Math.random() * 5)] },
            { type: 'walk' as const, distance: 150 + Math.floor(Math.random() * 200) }
          ]
        },
        {
          id: `r-${Date.now()}-2`,
          duration: 25 + Math.floor(Math.random() * 15),
          startTime: formatTime(new Date(now.getTime() + 8 * 60000)),
          endTime: formatTime(new Date(now.getTime() + 38 * 60000)),
          type: 'direct' as const,
          transfers: 1,
          via: stops[Math.floor(Math.random() * stops.length)]?.name || 'Center',
          segments: [
            { type: 'tram' as const, line: ['1', '2', '3', '4'][Math.floor(Math.random() * 4)] },
            { type: 'bus' as const, line: ['15', '2', '101'][Math.floor(Math.random() * 3)] }
          ]
        }
      ];
      
      setRoutes(generatedRoutes);
    }, 1200);
  };

  return (
    <div className="max-w-2xl mx-auto px-6 pb-32 pt-4" ref={containerRef}>
      {/* Search Input Section */}
      <section className="relative bg-surface-container-low p-6 rounded-[20px] mb-8 shadow-sm">
        <div className="flex flex-col gap-3 relative">
          <div className={cn(
            "flex items-center gap-4 bg-surface-container-lowest p-4 rounded-[20px] shadow-sm transition-all border-2",
            activeInput === 'from' ? "border-primary" : "border-transparent"
          )}>
            <Navigation className={cn("w-5 h-5", from === 'Current Location' ? "text-blue-500 fill-blue-500" : "text-secondary")} />
            <div className="flex-1">
              <p className="text-[10px] font-label uppercase tracking-widest text-secondary mb-1">From</p>
              <input 
                className="w-full bg-transparent border-none p-0 focus:ring-0 font-headline font-semibold text-on-surface placeholder:text-outline-variant" 
                value={from}
                onChange={(e) => handleSearch(e.target.value, 'from')}
                onFocus={() => {
                  setActiveInput('from');
                  if (from === 'Current Location') {
                    setFrom('');
                    setSuggestions(stops.slice(0, 5));
                  } else {
                    handleSearch(from, 'from');
                  }
                }}
                placeholder="Starting point..."
              />
            </div>
            {from !== 'Current Location' && from !== '' && (
              <button onClick={() => setFrom('')} className="text-secondary hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          
          <button 
            onClick={swapLocations}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-primary text-white p-3 rounded-full shadow-lg active:scale-90 transition-all hover:bg-primary/90"
          >
            <ArrowUpDown className="w-5 h-5" />
          </button>

          <div className={cn(
            "flex items-center gap-4 bg-surface-container-lowest p-4 rounded-[20px] shadow-sm transition-all border-2",
            activeInput === 'to' ? "border-primary" : "border-transparent"
          )}>
            <MapPin className="text-error w-5 h-5" />
            <div className="flex-1">
              <p className="text-[10px] font-label uppercase tracking-widest text-secondary mb-1">To</p>
              <input 
                className="w-full bg-transparent border-none p-0 focus:ring-0 font-headline font-semibold text-on-surface placeholder:text-outline-variant" 
                value={to}
                onChange={(e) => handleSearch(e.target.value, 'to')}
                onFocus={() => handleSearch(to, 'to')}
                placeholder="Where to?"
              />
            </div>
            {to !== '' && (
              <button onClick={() => setTo('')} className="text-secondary hover:text-primary">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Autocomplete Suggestions */}
          {activeInput && (suggestions.length > 0 || activeInput === 'from') && (
            <div className="absolute left-0 right-0 top-full mt-2 bg-surface-container-lowest rounded-[20px] shadow-xl border border-outline-variant/20 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              {activeInput === 'from' && from !== 'Current Location' && (
                <button
                  onClick={() => { setFrom('Current Location'); setActiveInput(null); }}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/10"
                >
                  <div className="bg-blue-50 p-2 rounded-full">
                    <Navigation className="w-4 h-4 text-blue-500 fill-blue-500" />
                  </div>
                  <div>
                    <p className="font-headline font-bold text-blue-600">{isSimulated ? 'Simulate My Location' : 'Use My Location'}</p>
                    <p className="text-[10px] font-label uppercase tracking-wider text-blue-400">{isSimulated ? 'Tallinn Center' : 'Real-time GPS'}</p>
                  </div>
                </button>
              )}
              {suggestions.map((stop) => (
                <button
                  key={stop.id}
                  onClick={() => selectSuggestion(stop)}
                  className="w-full flex items-center gap-4 px-6 py-4 hover:bg-surface-container-low transition-colors text-left border-b border-outline-variant/10 last:border-0"
                >
                  <div className="bg-surface-container-high p-2 rounded-full">
                    <MapPin className="w-4 h-4 text-secondary" />
                  </div>
                  <div>
                    <p className="font-headline font-bold text-on-surface">{stop.name}</p>
                    <p className="text-[10px] font-label uppercase tracking-wider text-secondary opacity-70">Stop ID: {stop.siriId || stop.id}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={findRoutes}
          disabled={isLoading || !from || !to}
          className="w-full mt-6 bg-primary text-white py-4 rounded-[20px] font-headline font-black text-lg shadow-lg active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-6 h-6 animate-spin" />
              Planning...
            </>
          ) : (
            <>
              <Search className="w-6 h-6" />
              Find Routes
            </>
          )}
        </button>
      </section>

      {/* Recent Searches */}
      {!activeInput && (
        <section className="mb-10">
          <h2 className="font-headline font-black text-primary text-xs uppercase tracking-[0.2em] mb-4 ml-2">Recent Journeys</h2>
          <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
            {['Telliskivi', 'Old Town', 'Pirita Rand'].map((place, i) => (
              <button 
                key={place} 
                onClick={() => { setTo(place); findRoutes(); }}
                className="flex-shrink-0 bg-surface-container-low px-4 py-3 rounded-[20px] border-l-4 border-primary-container min-w-[140px] text-left hover:bg-surface-container-high transition-colors"
              >
                <History className="text-secondary w-4 h-4 mb-2" />
                <p className="font-headline font-bold text-on-surface">{place}</p>
                <p className="font-label text-[10px] text-secondary">
                  {i === 0 ? 'Route 67, 68' : i === 1 ? 'Tram 3, 4' : 'Bus 1A, 8'}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Suggested Routes */}
      {showResults && (
        <section className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex justify-between items-end mb-2 px-2">
            <h2 className="font-headline font-black text-primary text-xs uppercase tracking-[0.2em]">Suggested Routes</h2>
            <button className="text-[10px] font-label font-bold text-primary flex items-center gap-1 hover:bg-primary/5 px-2 py-1 rounded-full transition-colors">
              <Filter className="w-3 h-3" />
              FILTERS
            </button>
          </div>

          {routes.map((route) => (
            <div 
              key={route.id} 
              onClick={() => setExpandedRoute(expandedRoute === route.id ? null : route.id)}
              className={cn(
                "bg-surface-container-lowest p-4 rounded-[20px] shadow-sm hover:shadow-md transition-all group cursor-pointer border border-outline-variant/10",
                expandedRoute === route.id && "ring-2 ring-primary border-transparent"
              )}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <p className="text-4xl font-black leading-none font-headline tracking-tighter text-primary group-hover:scale-105 transition-transform origin-left">
                    {route.duration}<span className="text-base font-bold ml-1">min</span>
                  </p>
                  <p className="font-label text-[10px] uppercase tracking-widest text-secondary font-bold mt-1">
                    {route.type.replace('-', ' ')} {route.via ? `• Via ${route.via}` : '• Direct'}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-headline font-bold text-base text-on-surface">{route.startTime} — {route.endTime}</p>
                  <p className="font-label text-[10px] text-secondary mt-0.5">
                    {route.leavesIn ? `Leaves in ${route.leavesIn} mins` : route.delay ? `Delay: ${route.delay}m` : 'On time'}
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {route.segments.map((segment, idx) => (
                    <React.Fragment key={idx}>
                      {segment.type === 'walk' ? (
                        <div className="flex items-center gap-1">
                          <Footprints className="text-secondary w-3.5 h-3.5" />
                          <p className="font-label text-[9px] text-secondary font-bold uppercase">{segment.distance}m</p>
                        </div>
                      ) : (
                        <div className={cn(
                          "h-7 px-2.5 rounded-full flex items-center justify-center gap-1",
                          getVehicleColorClass(segment.type)
                        )}>
                          {segment.type === 'walk' ? <Footprints className="w-3.5 h-3.5" /> : segment.type === 'bus' || segment.type === 'countybus' ? <Bus className="w-3.5 h-3.5" /> : <Tram className="w-3.5 h-3.5" />}
                          <span className="font-label font-bold text-[10px]">{segment.line}</span>
                        </div>
                      )}
                      {idx < route.segments.length - 1 && <div className="w-3 h-[2px] bg-outline-variant" />}
                    </React.Fragment>
                  ))}
                </div>
                <button 
                  onClick={handleGo}
                  className="bg-primary-fixed text-on-primary-fixed-variant px-3 py-1.5 rounded-full font-label font-bold text-[9px] uppercase tracking-widest hover:bg-primary-fixed-dim transition-colors"
                >
                  {route.type === 'fastest' ? 'Go' : 'Details'}
                </button>
              </div>

              {/* Expanded Details */}
              {expandedRoute === route.id && (
                <div className="mt-6 pt-6 border-t border-outline-variant/10 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="space-y-4">
                    {route.segments.map((segment, idx) => (
                      <div key={idx} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <div className={cn(
                            "w-8 h-8 rounded-full flex items-center justify-center",
                            segment.type === 'walk' ? "bg-surface-container-high" : 
                            getVehicleColorClass(segment.type)
                          )}>
                            {segment.type === 'walk' ? <Footprints className="w-4 h-4" /> : segment.type === 'bus' || segment.type === 'countybus' ? <Bus className="w-4 h-4" /> : <Tram className="w-4 h-4" />}
                          </div>
                          {idx < route.segments.length - 1 && <div className="w-0.5 h-full bg-outline-variant/30 my-1" />}
                        </div>
                        <div className="flex-1 pb-4">
                          <p className="font-headline font-bold text-on-surface">
                            {segment.type === 'walk' ? `Walk ${segment.distance}m` : `Take ${segment.type} ${segment.line}`}
                          </p>
                          <p className="text-xs text-secondary mt-1">
                            {segment.type === 'walk' ? 'Approximately 3-5 minutes' : `Next departure at ${route.startTime}`}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </section>
      )}
    </div>
  );
};
