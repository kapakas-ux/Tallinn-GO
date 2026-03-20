import React from 'react';
import { MapPin, Navigation, ArrowUpDown, History, Filter, Bus, TrainFront as Tram, MoveRight, Footprints } from 'lucide-react';
import { MOCK_ROUTES } from '../mockData';
import { cn } from '../lib/utils';

export const Planner = () => {
  return (
    <div className="max-w-2xl mx-auto px-6 pb-32 pt-4">
      {/* Search Input Section */}
      <section className="relative bg-surface-container-low p-6 rounded-3xl mb-8">
        <div className="flex flex-col gap-3 relative">
          <div className="flex items-center gap-4 bg-surface-container-lowest p-4 rounded-xl shadow-sm">
            <Navigation className="text-primary w-5 h-5" />
            <div className="flex-1">
              <p className="text-[10px] font-label uppercase tracking-widest text-secondary mb-1">Current Location</p>
              <input 
                className="w-full bg-transparent border-none p-0 focus:ring-0 font-headline font-semibold text-on-surface" 
                defaultValue="Tallinn City Center"
              />
            </div>
          </div>
          
          <button className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-primary text-white p-3 rounded-full shadow-lg active:scale-90 transition-all">
            <ArrowUpDown className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4 bg-surface-container-lowest p-4 rounded-xl shadow-sm">
            <MapPin className="text-error w-5 h-5" />
            <div className="flex-1">
              <p className="text-[10px] font-label uppercase tracking-widest text-secondary mb-1">Destination</p>
              <input 
                className="w-full bg-transparent border-none p-0 focus:ring-0 font-headline font-semibold text-on-surface" 
                defaultValue="Tallinn Airport (TLL)"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Recent Searches */}
      <section className="mb-10">
        <h2 className="font-headline font-black text-primary text-xs uppercase tracking-[0.2em] mb-4 ml-2">Recent Journeys</h2>
        <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2">
          {['Telliskivi', 'Old Town', 'Pirita Rand'].map((place, i) => (
            <div key={place} className="flex-shrink-0 bg-surface-container-low px-5 py-4 rounded-xl border-l-4 border-primary-container min-w-[160px]">
              <History className="text-secondary w-4 h-4 mb-2" />
              <p className="font-headline font-bold text-on-surface">{place}</p>
              <p className="font-label text-[10px] text-secondary">
                {i === 0 ? 'Route 67, 68' : i === 1 ? 'Tram 3, 4' : 'Bus 1A, 8'}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Suggested Routes */}
      <section className="space-y-6">
        <div className="flex justify-between items-end mb-2 px-2">
          <h2 className="font-headline font-black text-primary text-xs uppercase tracking-[0.2em]">Suggested Routes</h2>
          <button className="text-[10px] font-label font-bold text-primary flex items-center gap-1">
            <Filter className="w-3 h-3" />
            FILTERS
          </button>
        </div>

        {MOCK_ROUTES.map((route) => (
          <div key={route.id} className="bg-surface-container-lowest p-6 rounded-3xl shadow-sm hover:shadow-md transition-shadow group cursor-pointer">
            <div className="flex justify-between items-start mb-6">
              <div className="flex flex-col">
                <p className="text-[3.5rem] font-black leading-none font-headline tracking-tighter text-primary group-hover:scale-105 transition-transform origin-left">
                  {route.duration}<span className="text-xl font-bold ml-1">min</span>
                </p>
                <p className="font-label text-[11px] uppercase tracking-widest text-secondary font-bold mt-2">
                  {route.type.replace('-', ' ')} {route.via ? `• Via ${route.via}` : '• Direct'}
                </p>
              </div>
              <div className="text-right">
                <p className="font-headline font-bold text-lg text-on-surface">{route.startTime} — {route.endTime}</p>
                <p className="font-label text-xs text-secondary mt-1">
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
                        <Footprints className="text-secondary w-4 h-4" />
                        <p className="font-label text-[10px] text-secondary font-bold uppercase">{segment.distance}m</p>
                      </div>
                    ) : (
                      <div className="bg-tertiary text-white h-8 px-3 rounded-full flex items-center justify-center gap-1">
                        {segment.type === 'bus' ? <Bus className="w-4 h-4" /> : <Tram className="w-4 h-4" />}
                        <span className="font-label font-bold text-xs">{segment.line}</span>
                      </div>
                    )}
                    {idx < route.segments.length - 1 && <div className="w-4 h-[2px] bg-outline-variant" />}
                  </React.Fragment>
                ))}
              </div>
              <button className="bg-primary-fixed text-on-primary-fixed-variant px-4 py-2 rounded-full font-label font-bold text-[10px] uppercase tracking-widest">
                {route.type === 'fastest' ? 'Go' : 'Details'}
              </button>
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};
