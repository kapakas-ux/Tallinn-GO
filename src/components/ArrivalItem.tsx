import React, { useState, useEffect } from 'react';
import { Arrival, Stop } from '../types';
import { getRouteStopsForArrival } from '../services/transportService';
import { cn, getVehicleColorClass } from '../lib/utils';
import { CheckCircle2, ChevronDown, ChevronUp, MapPin, Bell } from 'lucide-react';
import { VehicleMap } from './VehicleMap';

interface ArrivalItemProps {
  key?: React.Key;
  arrival: Arrival;
  stop?: Stop;
  variant?: 'main' | 'compact';
  onAlertClick?: (e: React.MouseEvent) => void;
  isAlertActive?: boolean;
  expandable?: boolean;
}

export function ArrivalItem({ arrival, stop, variant = 'main', onAlertClick, isAlertActive, expandable = true }: ArrivalItemProps) {
  const [expanded, setExpanded] = useState(false);
  const [routeStops, setRouteStops] = useState<Stop[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  // Reset state if the arrival represents a different vehicle trip
  useEffect(() => {
    setExpanded(false);
    setRouteStops([]);
    setHasFetched(false);
  }, [arrival.type, arrival.line, arrival.destination, arrival.vehicleIndex]);

  useEffect(() => {
    if (!expanded || hasFetched) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const stops = await getRouteStopsForArrival(arrival);
        if (!isMounted) return;
        setRouteStops(stops);
      } catch (error) {
        console.error("Error fetching route:", error);
      } finally {
        if (isMounted) {
          setLoading(false);
          setHasFetched(true);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [expanded, arrival, hasFetched]);

  const isCompact = variant === 'compact';

  return (
    <div className="flex flex-col gap-2">
      <div
        onClick={() => expandable && setExpanded(!expanded)}
        className={cn(
          "group flex items-center justify-between transition-all cursor-pointer",
          isCompact ? "py-2" : "p-3 rounded-[20px]",
          !isCompact && arrival.status === 'departed' 
            ? "bg-surface-container-high/30 opacity-60" 
            : !isCompact ? "bg-surface-container-lowest editorial-shadow hover:translate-x-2" : "hover:bg-surface-container-lowest/50 rounded-lg px-2 -mx-2"
        )}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "rounded-full flex items-center justify-center font-label font-bold",
            isCompact ? "h-8 w-8 text-xs" : "h-10 w-10 text-base",
            getVehicleColorClass(arrival.type)
          )}>
            {arrival.line}
          </div>
          <div className="flex flex-col">
            <span className={cn(
              "font-headline font-extrabold text-primary",
              isCompact ? "text-sm" : "text-sm",
              arrival.status === 'departed' && "line-through text-on-surface-variant"
            )}>
              {arrival.destination}
            </span>
            {!isCompact && (
              <span className="font-label text-[9px] text-secondary font-bold uppercase tracking-widest">
                {arrival.type.charAt(0).toUpperCase() + arrival.type.slice(1)} • {arrival.info || 'Local'}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {arrival.status === 'departed' ? (
            <CheckCircle2 className="text-on-surface-variant w-4 h-4" />
          ) : (
            <div className="flex items-center gap-2">
              {onAlertClick && arrival.minutes > 15 && (
                <button 
                  onClick={(e) => {
                    e.stopPropagation();
                    onAlertClick(e);
                  }}
                  className={cn(
                    "p-1.5 rounded-full transition-all active:scale-90",
                    isAlertActive 
                      ? "bg-amber-500 text-white" 
                      : "bg-surface-container-high text-secondary hover:text-primary"
                  )}
                >
                  <Bell className="w-3.5 h-3.5" />
                </button>
              )}
              <div className="flex items-baseline gap-1">
                {arrival.isRealtime && (
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse mr-0.5 self-center" />
                )}
                <span className={cn("font-headline font-black text-primary", isCompact ? "text-lg" : "text-xl")}>
                  {arrival.minutes > 60 && arrival.time ? arrival.time : (arrival.minutes === 0 ? 'Now' : arrival.minutes)}
                </span>
                {arrival.minutes > 0 && !(arrival.minutes > 60 && arrival.time) && (
                  <span className={cn("font-bold text-secondary uppercase", isCompact ? "text-[10px]" : "text-[10px] ml-0.5")}>min</span>
                )}
              </div>
              {expandable && (expanded ? <ChevronUp className="w-4 h-4 text-secondary" /> : <ChevronDown className="w-4 h-4 text-secondary" />)}
            </div>
          )}
        </div>
      </div>

      {expanded && expandable && (
        <div className={cn(
          "bg-surface-container-lowest rounded-[20px] p-4 animate-in slide-in-from-top-2",
          !isCompact && "editorial-shadow"
        )}>
          {loading ? (
            <div className="text-center text-sm text-secondary py-4">Loading route...</div>
          ) : routeStops.length === 0 ? (
            <div className="text-center text-sm text-secondary py-4">Route data not available</div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="h-48 rounded-xl overflow-hidden bg-surface-container relative">
                <VehicleMap routeStops={routeStops} targetStop={stop} />
              </div>
              
              <div 
                className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 relative" 
                ref={(el) => {
                  if (el) {
                    setTimeout(() => {
                      const target = el.querySelector('[data-target="true"]') as HTMLElement;
                      if (target) {
                        el.scrollTo({
                          top: target.offsetTop - el.offsetTop - 40,
                          behavior: 'smooth'
                        });
                      }
                    }, 100);
                  }
                }}
              >
                <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 sticky top-0 bg-surface-container-lowest z-10 py-1">Route Stops</div>
                {routeStops.map((routeStop, i) => {
                  const isTarget = stop && (
                    routeStop.id === stop.id || 
                    routeStop.id.startsWith(stop.id.split('-')[0] + '-') ||
                    routeStop.name.toLowerCase() === stop.name.toLowerCase()
                  );
                  return (
                    <div 
                      key={i} 
                      data-target={isTarget ? "true" : "false"}
                      className={cn("flex items-center gap-3 text-sm", isTarget ? "font-bold text-primary" : "text-secondary")}
                    >
                      <div className={cn("w-2 h-2 rounded-full relative", isTarget ? "bg-primary animate-pulse" : "bg-primary/20")}>
                        {i !== routeStops.length - 1 && (
                          <div className="absolute top-2 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-primary/10" />
                        )}
                      </div>
                      <span className="truncate">{routeStop.name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
