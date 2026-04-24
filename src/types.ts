export interface Stop {
  id: string;
  siriId?: string;
  gtfsId?: string;
  name: string;
  lat: number;
  lng: number;
  distance?: number;
  customName?: string;
  emoji?: string;
  desc?: string;
  modes?: ('bus' | 'tram' | 'trolley' | 'train' | 'regional')[];
}

export interface Arrival {
  line: string;
  destination: string;
  type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional';
  minutes: number;
  departureTimeSeconds?: number; // Unix seconds — used to compute live countdown
  time?: string;
  status: 'on-time' | 'delayed' | 'expected' | 'departed' | 'overdue';
  isRealtime?: boolean;
  info?: string;
  vehicleId?: string;
  vehicleIndex?: number;
  tripId?: string;
  /** True when this is the final departure of this line/destination for today (best-effort). */
  isLastOfDay?: boolean;
  /** Seconds the bus is running behind its original schedule. Positive = late. */
  delaySeconds?: number;
  /** Original scheduled departure as Unix seconds (before any GPS/realtime adjustment). */
  scheduledDepartureSeconds?: number;
}

export interface Vehicle {
  id: string;
  type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional';
  line: string;
  lat: number;
  lng: number;
  bearing: number;
  speed?: number;
  destination: string;
}

export interface RouteOption {
  id: string;
  duration: number;
  startTime: string;
  endTime: string;
  type: 'fastest' | 'direct' | 'less-walking';
  transfers: number;
  via?: string;
  segments: {
    type: 'bus' | 'tram' | 'trolley' | 'train' | 'regional' | 'walk';
    line?: string;
    distance?: number;
  }[];
  leavesIn?: number;
  delay?: number;
}

export type LegMode = 'WALK' | 'BUS' | 'TRAM' | 'RAIL' | 'SUBWAY' | 'FERRY' | 'CABLE_CAR' | 'GONDOLA' | 'FUNICULAR';

export interface PlanPlace {
  name: string;
  lat: number;
  lon: number;
}

export interface PlanLeg {
  startTime: number;        // ms epoch
  endTime: number;          // ms epoch
  mode: LegMode;
  distance: number;         // metres
  duration: number;         // seconds
  from: PlanPlace;
  to: PlanPlace;
  routeShortName?: string;  // e.g. "18"
  headsign?: string;
  legGeometry: { points: string; length: number }; // encoded polyline
  realTime?: boolean;
  agencyName?: string;      // operator name from GTFS
  competentAuthority?: string; // GTFS competent authority (e.g. "Tallinna linn", "Harjumaa", "REM")
  /** Service tier derived from competentAuthority + agency:
   *  - 'city': municipal transit (Tallinn, Tartu, etc.)
   *  - 'regional': county-subsidized bus ("Harjumaa", "Tartumaa", …)
   *  - 'commercial': intercity commercial carrier (Lux Express, GoBus intercity, …)
   *  Only set for transit legs (mode !== WALK). */
  tier?: 'city' | 'regional' | 'commercial';
}

export interface ItineraryFare {
  cents: number;            // total fare in cents
  currency: string;         // e.g. "EUR"
  approximate: boolean;     // true if summed from components (OTP couldn't compute total)
}

export interface PlanItinerary {
  duration: number;         // seconds
  startTime: number;        // ms epoch
  endTime: number;          // ms epoch
  walkTime: number;         // seconds
  walkDistance: number;     // metres
  transfers: number;
  legs: PlanLeg[];
  fare?: ItineraryFare | null;
}

export interface ServiceAlert {
  id: string;
  headerText: string;
  descriptionText: string;
  url?: string;
  effectiveStartDate?: number; // unix seconds
  effectiveEndDate?: number;   // unix seconds
  routes: { shortName: string; mode: string }[];
  type?: 'interruption' | 'announcement';
}
