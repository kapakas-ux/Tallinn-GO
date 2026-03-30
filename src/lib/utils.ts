import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDistance(meters: number): string {
  if (meters >= 1000) {
    return `${(meters / 1000).toFixed(1)} km`;
  }
  return `${Math.round(meters)} m`;
}

export function getVehicleColorClass(type: string): string {
  switch (type) {
    case 'tram': return 'bg-tram text-white';
    case 'trolley': return 'bg-trolley text-white';
    case 'train': return 'bg-train text-white';
    case 'countybus': return 'bg-countybus text-white';
    default: return 'bg-bus text-white';
  }
}

export function formatWalkingTime(meters: number): string {
  const minutes = Math.round(meters / 83.33);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) return `${hours} h`;
    return `${hours} h ${remainingMinutes} min`;
  }
  return `${minutes} min`;
}
