export interface Stop {
  id: string;
  siriId?: string;
  name: string;
  lat: number;
  lng: number;
  distance?: number;
  customName?: string;
  emoji?: string;
}

export interface Arrival {
  line: string;
  destination: string;
  type: 'bus' | 'tram' | 'trolley';
  minutes: number;
  time?: string;
  status: 'on-time' | 'delayed' | 'expected' | 'departed';
  info?: string;
}

export interface Vehicle {
  id: string;
  type: 'bus' | 'tram' | 'trolley';
  line: string;
  lat: number;
  lng: number;
  bearing: number;
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
    type: 'bus' | 'tram' | 'trolley' | 'walk';
    line?: string;
    distance?: number;
  }[];
  leavesIn?: number;
  delay?: number;
}
