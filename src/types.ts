export interface Stop {
  id: string;
  siriId?: string;
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
