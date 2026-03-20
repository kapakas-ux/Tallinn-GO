import React, { useState, useEffect } from 'react';
import { Search, Star, Navigation as NearMe, ChevronRight, Loader2, X, Bus, Train, Zap, Trash2 } from 'lucide-react';
import { MOCK_STOPS } from '../mockData';
import { fetchStops, fetchDepartures, fetchRoutes } from '../services/transportService';
import { getFavorites, toggleFavorite as toggleFavService, isFavorite } from '../services/favoritesService';
import { Stop, Arrival } from '../types';
import { cn } from '../lib/utils';

export const Stops = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [allStops, setAllStops] = useState<Stop[]>([]);
  const [filteredStops, setFilteredStops] = useState<Stop[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [departures, setDepartures] = useState<Arrival[]>([]);
  const [isDeparturesLoading, setIsDeparturesLoading] = useState(false);
  const [favorites, setFavorites] = useState<Stop[]>([]);
  const [isEditMode, setIsEditMode] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    fetchStops().then(stops => {
      if (mounted) {
        setAllStops(stops);
        setIsLoading(false);
      }
    });
    fetchRoutes().catch(err => console.error('Error fetching routes:', err));
    setFavorites(getFavorites());
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredStops([]);
      return;
    }
    const query = searchQuery.toLowerCase();
    const results = allStops.filter(stop => 
      stop.name.toLowerCase().includes(query) || stop.id.includes(query)
    ).slice(0, 20); // limit to 20 results for performance
    setFilteredStops(results);
  }, [searchQuery, allStops]);

  const handleStopClick = async (stop: Stop) => {
    setSelectedStop(stop);
    setIsDeparturesLoading(true);
    setDepartures([]);
    try {
      // Fetching with time=0 to get full day schedule if possible
      const deps = await fetchDepartures(stop.id, stop.siriId, '0');
      setDepartures(deps);
    } catch (err) {
      console.error("Failed to fetch departures", err);
    } finally {
      setIsDeparturesLoading(false);
    }
  };

  const toggleFavorite = (stop: Stop) => {
    const newFavs = toggleFavService(stop);
    setFavorites(newFavs);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'tram': return <Train className="w-4 h-4" />;
      case 'trolley': return <Zap className="w-4 h-4" />;
      default: return <Bus className="w-4 h-4" />;
    }
  };

  return (
    <div className="pb-32 relative">
      {/* Search Section */}
      <section className="px-6 pt-8 pb-10">
        <div className="relative group">
          <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none">
            <Search className="text-secondary w-5 h-5" />
          </div>
          <input
            className="w-full bg-surface-container-highest border-none h-16 pl-14 pr-6 rounded-full font-headline font-semibold text-on-surface focus:ring-2 focus:ring-primary-fixed transition-all placeholder:text-on-surface-variant/50"
            placeholder="Search for stops or routes..."
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isLoading && allStops.length === 0 && (
            <div className="absolute inset-y-0 right-5 flex items-center pointer-events-none">
              <Loader2 className="w-5 h-5 animate-spin text-secondary" />
            </div>
          )}
        </div>
      </section>

      {searchQuery.trim() ? (
        /* Search Results Section */
        <section className="px-6 mb-12">
          <h2 className="font-headline text-2xl font-extrabold tracking-tight mb-6">Search Results</h2>
          {filteredStops.length > 0 ? (
            <div className="space-y-3">
              {filteredStops.map((stop) => (
                <div
                  key={stop.id}
                  onClick={() => handleStopClick(stop)}
                  className="flex items-center justify-between p-4 bg-surface-container-lowest rounded-2xl shadow-sm hover:bg-surface-container-low transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-surface-container-high rounded-full flex items-center justify-center text-primary">
                      <NearMe className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-headline font-bold text-lg text-primary">{stop.name}</h4>
                      <p className="font-label text-xs text-secondary mt-0.5">Stop ID: {stop.id}</p>
                    </div>
                  </div>
                  <ChevronRight className="text-outline-variant w-5 h-5" />
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 text-secondary">
              <p>No stops found matching "{searchQuery}"</p>
            </div>
          )}
        </section>
      ) : (
        <>
          {/* Favorites Section */}
          <section className="px-6 mb-12">
            <div className="flex items-end justify-between mb-6">
              <div>
                <span className="font-label text-xs uppercase tracking-widest text-secondary mb-1 block">
                  Quick Access
                </span>
                <h2 className="font-headline text-3xl font-extrabold tracking-tight">Favorites</h2>
              </div>
              {favorites.length > 0 && (
                <button 
                  onClick={() => setIsEditMode(!isEditMode)}
                  className="text-primary font-bold text-sm hover:underline"
                >
                  {isEditMode ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
            
            {favorites.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {favorites.map((stop) => (
                  <div 
                    key={stop.id}
                    onClick={() => !isEditMode && handleStopClick(stop)}
                    className={cn(
                      "p-6 rounded-[20px] shadow-sm flex flex-col justify-between min-h-[160px] relative overflow-hidden group transition-all",
                      isEditMode ? "bg-surface-container-high ring-2 ring-primary/20" : "bg-surface-container-lowest hover:bg-surface-container-low cursor-pointer"
                    )}
                  >
                    <div className="absolute top-0 right-0 p-4">
                      {isEditMode ? (
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(stop);
                          }}
                          className="bg-error/10 p-2 rounded-full text-error hover:bg-error/20 transition-colors"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      ) : (
                        <Star className="text-amber-400 w-6 h-6 fill-current" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-headline text-xl font-bold text-on-surface">{stop.name}</h3>
                      <p className="font-label text-xs text-secondary mt-1">Stop ID: {stop.id}</p>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                          <NearMe className="w-4 h-4" />
                        </div>
                        <span className="font-label text-xs font-bold text-primary uppercase tracking-wider">View Schedule</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-surface-container-lowest p-8 rounded-[32px] border-2 border-dashed border-outline-variant/20 text-center">
                <div className="w-16 h-16 bg-surface-container-high rounded-full flex items-center justify-center mx-auto mb-4 text-secondary/40">
                  <Star className="w-8 h-8" />
                </div>
                <h3 className="font-headline font-bold text-primary mb-2">No favorites yet</h3>
                <p className="text-secondary text-sm max-w-[200px] mx-auto">
                  Search for a stop and tap the star icon to add it here.
                </p>
              </div>
            )}
          </section>

          {/* Nearby Section */}
          <section className="mb-12">
            <div className="px-6 flex items-end justify-between mb-6">
              <div>
                <span className="font-label text-xs uppercase tracking-widest text-secondary mb-1 block">
                  Live Coverage
                </span>
                <h2 className="font-headline text-3xl font-extrabold tracking-tight">Nearby Stops</h2>
              </div>
            </div>
            <div className="relative mx-6 h-64 rounded-full overflow-hidden mb-8 bg-surface-container-high group">
              <img
                alt="Map of Tallinn"
                className="w-full h-full object-cover grayscale opacity-50 group-hover:grayscale-0 transition-all duration-700"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAfGLmen7Jhp-hiJshnfrej2sODBX3f5pj_iAQQOWHlEZytv_kb5XruuPpLfcbEflz8nnW3oEbseUsVjTlrmDseNQGTtzrUJJjvE6kG4vWAsnYY3chLz9NDTdGZj6clzOlS1Tc-o9D1Y_xZAL7kEkduFhD-UGjoaFokszm1ka2sfVox1nnPrjuxgoQyJoxlH8TpaH-R3ac7VEQ5gSZUaEkYAlrXw0gwxrVadbRJNNbsBrFxct7yY1BvR8XtI510BjnQD_Jav8H_Q1Jp"
              />
              <div className="absolute inset-0 p-6 flex flex-col justify-end">
                <div className="bg-surface/80 backdrop-blur-md p-4 rounded-xl flex items-center justify-between shadow-lg max-w-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center text-on-primary">
                      <NearMe className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="font-headline font-bold text-sm">Estonia puiestee</p>
                      <p className="font-label text-[10px] text-secondary">250m away</p>
                    </div>
                  </div>
                  <ChevronRight className="text-primary w-5 h-5" />
                </div>
              </div>
            </div>

            <div className="space-y-4 px-6">
              {MOCK_STOPS.slice(1, 4).map((stop, idx) => (
                <div
                  key={stop.id}
                  className="flex items-center py-2 group hover:bg-surface-container-low px-4 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="mr-6">
                    <span className="font-label text-xs font-bold text-outline-variant">0{idx + 1}</span>
                  </div>
                  <div className="flex-1">
                    <h4 className="font-headline font-bold text-lg">{stop.name}</h4>
                    <div className="flex gap-2 mt-1">
                      <span className="font-label text-[10px] bg-surface-container-high px-2 py-0.5 rounded text-secondary font-bold uppercase">
                        {idx === 0 ? "Bus 1, 3, 40" : idx === 1 ? "Tram 1, 2, 3, 4" : "Bus 5, 8, 73"}
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-headline font-black text-xl text-on-surface">
                      {idx * 3 + 2} <span className="text-[10px] font-label uppercase">min</span>
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Departures Modal */}
      {selectedStop && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setSelectedStop(null)}
          />
          <div className="relative w-full max-w-lg bg-surface rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in slide-in-from-bottom duration-300">
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between bg-surface-container-lowest">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => toggleFavorite(selectedStop)}
                  className={cn(
                    "h-12 w-12 rounded-2xl flex items-center justify-center transition-all shadow-sm",
                    isFavorite(selectedStop.id) 
                      ? "bg-amber-50 text-amber-400 shadow-amber-200/50" 
                      : "bg-surface-container-high text-secondary hover:text-amber-400"
                  )}
                >
                  <Star className={cn("w-6 h-6", isFavorite(selectedStop.id) && "fill-current")} />
                </button>
                <div>
                  <h3 className="font-headline text-2xl font-black text-primary tracking-tight">{selectedStop.name}</h3>
                  <p className="font-label text-xs text-secondary uppercase tracking-widest font-bold">Stop ID: {selectedStop.id}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedStop(null)}
                className="h-10 w-10 rounded-full bg-surface-container-high flex items-center justify-center text-primary hover:bg-surface-container-highest transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
              {isDeparturesLoading ? (
                <div className="flex flex-col items-center justify-center py-20 text-secondary">
                  <Loader2 className="w-10 h-10 animate-spin mb-4" />
                  <p className="font-label font-bold uppercase tracking-widest text-xs">Fetching full schedule...</p>
                </div>
              ) : departures.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">Daily Departures</span>
                    <span className="font-label text-[10px] font-bold uppercase tracking-widest text-secondary">{departures.length} found</span>
                  </div>
                  {departures.map((arr, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-surface-container-low rounded-2xl border border-outline-variant/5">
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          "h-10 w-10 rounded-full flex items-center justify-center text-white",
                          arr.type === 'tram' ? "bg-primary" : arr.type === 'trolley' ? "bg-secondary" : "bg-tertiary"
                        )}>
                          <span className="font-label font-black text-sm">{arr.line}</span>
                        </div>
                        <div>
                          <p className="font-headline font-bold text-primary">{arr.destination}</p>
                          <div className="flex items-center gap-1.5 text-secondary">
                            {getIcon(arr.type)}
                            <span className="font-label text-[10px] font-bold uppercase tracking-widest">{arr.type}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-headline font-black text-xl text-primary">{arr.time || `${arr.minutes}m`}</p>
                        {arr.minutes <= 30 && (
                          <p className="font-label text-[10px] font-bold text-error uppercase tracking-widest">
                            In {arr.minutes} min
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-20 text-center text-secondary">
                  <p className="font-headline font-bold">No departures found for today.</p>
                </div>
              )}
            </div>
            
            <div className="p-6 bg-surface-container-lowest border-t border-outline-variant/10">
              <button 
                onClick={() => setSelectedStop(null)}
                className="w-full py-4 bg-primary text-on-primary rounded-full font-headline font-bold text-lg shadow-lg active:scale-95 transition-all"
              >
                Close Schedule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
