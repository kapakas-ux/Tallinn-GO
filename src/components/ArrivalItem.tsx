import React, { useState, useEffect } from 'react';
import { Arrival, Stop, Vehicle } from '../types';
import { getRouteStopsForArrival, fetchTripStoptimes, TripStoptime, getVehicleForArrival } from '../services/transportService';
import { cn, getVehicleColorClass } from '../lib/utils';
import { CheckCircle2, ChevronDown, ChevronUp, MapPin, Bell } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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

export function getLiveMinutes(arrival: Arrival): number {
  if (arrival.departureTimeSeconds) {
    const diffSec = arrival.departureTimeSeconds - Date.now() / 1000;
    return Math.max(0, Math.floor(diffSec / 60));
  }
  return arrival.minutes;
}

// Walking speed ≈ 5 km/h matches formatWalkingTime in lib/utils.ts
const WALK_METERS_PER_SECOND = 83.33 / 60;

type CatchTier = 'walk' | 'jog' | 'sprint' | 'missed';

/** Decide how fast the user would need to move to catch this arrival. */
function computeCatchTier(distanceKm: number, arrival: Arrival): { tier: CatchTier; bufferSec: number } | null {
  if (!distanceKm || distanceKm <= 0) return null;
  const distanceM = distanceKm * 1000;
  // If the stop is practically underfoot, nothing to show.
  if (distanceM < 30) return null;
  const walkSec = distanceM / WALK_METERS_PER_SECOND;
  const secondsUntil = arrival.departureTimeSeconds
    ? arrival.departureTimeSeconds - Date.now() / 1000
    : arrival.minutes * 60;
  const buffer = secondsUntil - walkSec;
  let tier: CatchTier;
  if (buffer >= 60) tier = 'walk';
  else if (buffer >= 15) tier = 'jog';
  else if (buffer >= -15) tier = 'sprint';
  else tier = 'missed';

  // Late-bus bonus: if the tracked bus is running ≥2 min late, OR the arrival
  // is marked overdue (schedule passed but we have no GPS yet), the user has
  // extra runway. Upgrade the tier so we don't scare people with a "MISSED"
  // label when the bus hasn't even reached the stop. Never downgrade.
  const isOverdue = arrival.status === 'overdue';
  if (tier !== 'walk' && ((arrival.delaySeconds ?? 0) >= 120 || isOverdue)) {
    if (tier === 'missed') tier = 'sprint';
    else if (tier === 'sprint') tier = 'jog';
    else if (tier === 'jog') tier = 'walk';
  }
  return { tier, bufferSec: buffer };
}

const CATCH_TIER_STYLES: Record<CatchTier, { emoji: string; labelKey: string; className: string }> = {
  walk:   { emoji: '🚶', labelKey: 'arrivals.catchWalk',   className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/20' },
  jog:    { emoji: '🏃', labelKey: 'arrivals.catchJog',    className: 'bg-amber-500/10  text-amber-600  dark:text-amber-400  ring-1 ring-amber-500/20' },
  sprint: { emoji: '⚡', labelKey: 'arrivals.catchSprint', className: 'bg-red-500/10    text-red-600    dark:text-red-400    ring-1 ring-red-500/30 animate-pulse' },
  missed: { emoji: '⏳', labelKey: 'arrivals.catchMissed', className: 'bg-surface-container-high text-on-surface-variant line-through' },
};


/** Compact time label: "Now", "5 min", or "14:35" for >59 min */
export function CompactTime({ arrival, nowLabel }: { arrival: Arrival; nowLabel: string }) {
  const { t } = useTranslation();
  const mins = getLiveMinutes(arrival);
  if (arrival.status === 'departed') return <>–</>;
  if (arrival.status === 'overdue') return <>{t('arrivals.due')}</>;
  if (mins === 0) return <>{nowLabel}</>;
  if (mins >= 60 && arrival.time) return <>{arrival.time}</>;
  return <>{mins}<span className={cn("font-medium", arrival.isRealtime ? "text-emerald-500 animate-pulse" : "text-secondary")}> min</span></>;
}

export function ArrivalItem({ arrival, stop, variant = 'main', onAlertClick, isAlertActive, expandable = true }: ArrivalItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [routeStops, setRouteStops] = useState<Stop[]>([]);
  const [tripStoptimes, setTripStoptimes] = useState<TripStoptime[]>([]);
  const [matchedVehicle, setMatchedVehicle] = useState<Vehicle | null>(null);
  const [loading, setLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const [liveMinutes, setLiveMinutes] = useState(() => getLiveMinutes(arrival));

  // Tick every 15 seconds to keep the countdown accurate
  useEffect(() => {
    setLiveMinutes(getLiveMinutes(arrival));
    const id = setInterval(() => setLiveMinutes(getLiveMinutes(arrival)), 15_000);
    return () => clearInterval(id);
  }, [arrival]);

  // Reset state if the arrival represents a different vehicle trip
  useEffect(() => {
    setExpanded(false);
    setRouteStops([]);
    setTripStoptimes([]);
    setMatchedVehicle(null);
    setHasFetched(false);
  }, [arrival.type, arrival.line, arrival.destination, arrival.vehicleIndex]);

  useEffect(() => {
    if (!expanded || hasFetched) return;

    let isMounted = true;

    const fetchData = async () => {
      try {
        setLoading(true);
        const [stops, stoptimes, vehicle] = await Promise.all([
          getRouteStopsForArrival(arrival),
          arrival.tripId ? fetchTripStoptimes(arrival.tripId) : Promise.resolve([]),
          getVehicleForArrival(arrival, stop),
        ]);
        if (!isMounted) return;
        setRouteStops(stops);
        setTripStoptimes(stoptimes);
        setMatchedVehicle(vehicle);
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

    // Refresh vehicle position every 10s while expanded
    const refreshId = setInterval(async () => {
      const v = await getVehicleForArrival(arrival, stop);
      if (isMounted) setMatchedVehicle(v);
    }, 10_000);

    return () => {
      isMounted = false;
      clearInterval(refreshId);
    };
  }, [expanded, arrival, hasFetched]);

  const isCompact = variant === 'compact';
  const catchInfo = (arrival.status !== 'departed' && stop?.distance !== undefined && liveMinutes < 60)
    ? computeCatchTier(stop.distance, arrival)
    : null;
  const showLastChip = arrival.isLastOfDay && arrival.status !== 'departed' && liveMinutes < 180;
  const delayMinutes = (arrival.delaySeconds ?? 0) >= 120
    ? Math.round((arrival.delaySeconds ?? 0) / 60)
    : 0;
  const showDelayChip = delayMinutes > 0 && arrival.status !== 'departed';

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
              {arrival.destination || t('arrivals.unknownDestination')}
            </span>
            {!isCompact && (
              <span className="font-label text-[9px] text-secondary font-bold uppercase tracking-widest">
                {(arrival.type === 'regional' ? 'Bus' : arrival.type.charAt(0).toUpperCase() + arrival.type.slice(1))} • {arrival.type === 'regional' ? t('arrivals.regional') : t('arrivals.local')}
              </span>
            )}
            {(catchInfo || showLastChip || showDelayChip) && (
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                {catchInfo && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-wider",
                      CATCH_TIER_STYLES[catchInfo.tier].className
                    )}
                    title={t('arrivals.catchTooltip', {
                      minutes: Math.max(0, Math.round(catchInfo.bufferSec / 60)),
                    })}
                  >
                    <span aria-hidden>{CATCH_TIER_STYLES[catchInfo.tier].emoji}</span>
                    {t(CATCH_TIER_STYLES[catchInfo.tier].labelKey)}
                  </span>
                )}
                {showDelayChip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-wider bg-amber-500/15 text-amber-600 ring-1 ring-amber-500/30 dark:text-amber-400">
                    <span aria-hidden>⏱️</span>
                    {t('arrivals.delayedBy', { min: delayMinutes })}
                  </span>
                )}
                {showLastChip && (
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-label font-bold uppercase tracking-wider bg-primary/10 text-primary ring-1 ring-primary/20">
                    <span aria-hidden>🌙</span>
                    {t('arrivals.lastOfDay')}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          {arrival.status === 'departed' ? (
            <CheckCircle2 className="text-on-surface-variant w-4 h-4" />
          ) : (
            <div className="flex items-center gap-2">
              {onAlertClick && liveMinutes >= 15 && (
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
                <span className={cn("font-headline font-black text-primary flex items-baseline gap-1", isCompact ? "text-lg" : "text-xl")}>
                  {arrival.status === 'overdue'
                    ? t('arrivals.due')
                    : liveMinutes === 0
                      ? t('arrivals.now')
                      : (liveMinutes <= 59
                        ? <>{liveMinutes}<span className={cn("text-sm font-medium", arrival.isRealtime ? "text-emerald-500 animate-pulse" : "text-secondary")}>{t('arrivals.min')}</span></>
                        : (arrival.time ?? <>{liveMinutes}<span className={cn("text-sm font-medium", arrival.isRealtime ? "text-emerald-500 animate-pulse" : "text-secondary")}>{t('arrivals.min')}</span></>))}
                </span>
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
            <div className="text-center text-sm text-secondary py-4">{t('arrivals.loadingRoute')}</div>
          ) : routeStops.length === 0 ? (
            <div className="text-center text-sm text-secondary py-4">{t('arrivals.routeNotAvailable')}</div>
          ) : (
            <div className="flex flex-col gap-4">
              <div className="h-48 rounded-xl overflow-hidden bg-surface-container relative">
                <VehicleMap routeStops={routeStops} targetStop={stop} vehicle={matchedVehicle ?? undefined} />
              </div>
              
              <div 
                className="flex flex-col gap-2 max-h-48 overflow-y-auto pr-2 relative bg-surface rounded-xl p-2" 
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
                <div className="text-xs font-bold text-secondary uppercase tracking-wider mb-1 sticky top-0 bg-surface z-10 py-1">{t('arrivals.routeStops')}</div>
                {tripStoptimes.length > 0 ? (
                  /* Use trip stoptimes (has schedule times) */
                  tripStoptimes.map((st, i) => {
                    const isTarget = stop && (
                      st.stopId === stop.id ||
                      st.stopId === stop.gtfsId ||
                      st.stopId.startsWith(stop.id.split('-')[0]) ||
                      st.stopName.toLowerCase() === stop.name.toLowerCase()
                    );
                    return (
                      <div 
                        key={i} 
                        data-target={isTarget ? "true" : "false"}
                        className={cn("flex items-center gap-3 text-sm", isTarget ? "font-bold text-primary" : "text-secondary")}
                      >
                        <div className={cn("w-2 h-2 rounded-full relative shrink-0", isTarget ? "bg-primary animate-pulse" : "bg-primary/20")}>
                          {i !== tripStoptimes.length - 1 && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-primary/10" />
                          )}
                        </div>
                        <span className="truncate flex-1">{st.stopName}</span>
                        <span className={cn("font-label text-[11px] tabular-nums shrink-0", isTarget ? "text-primary font-bold" : "text-secondary/70")}>
                          {st.departureTime}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  /* Fallback: route stops without times */
                  routeStops.map((routeStop, i) => {
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
                        <div className={cn("w-2 h-2 rounded-full relative shrink-0", isTarget ? "bg-primary animate-pulse" : "bg-primary/20")}>
                          {i !== routeStops.length - 1 && (
                            <div className="absolute top-2 left-1/2 -translate-x-1/2 w-0.5 h-6 bg-primary/10" />
                          )}
                        </div>
                        <span className="truncate">{routeStop.name}</span>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
