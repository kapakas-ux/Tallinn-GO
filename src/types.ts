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
  status: 'on-time' | 'delayed' | 'expected' | 'departed';
  isRealtime?: boolean;
  info?: string;
  vehicleId?: string;
  vehicleIndex?: number;
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
  stopId?: string;
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
}

export interface PlanItinerary {
  duration: number;         // seconds
  startTime: number;        // ms epoch
  endTime: number;          // ms epoch
  walkTime: number;         // seconds
  walkDistance: number;     // metres
  transfers: number;
  legs: PlanLeg[];
}
