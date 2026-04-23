// Sunrise / civil twilight calculator — no dependencies.
// Uses a compact NOAA-style approximation, accurate to ~1 minute.
// Returns the civil-twilight window (solar altitude = -6°) within which
// a pedestrian can see without extra lighting.

const DEG = Math.PI / 180;
const J1970 = 2440588;
const J2000 = 2451545;

function toJulian(date: Date): number {
  return date.getTime() / 86400000 - 0.5 + J1970;
}

function fromJulian(j: number): Date {
  return new Date((j + 0.5 - J1970) * 86400000);
}

export interface DaylightWindow {
  /** ms epoch — start of civil light (dawn). */
  dawn: number;
  /** ms epoch — end of civil light (dusk). */
  dusk: number;
  /** True if the sun never drops below -6° that day (polar summer). */
  alwaysLight: boolean;
  /** True if the sun never rises to -6° that day (polar winter). */
  alwaysDark: boolean;
}

/**
 * Compute the civil-twilight window (dawn → dusk) for a given local date and location.
 * lat in degrees (north positive), lng in degrees (east positive).
 */
export function getDaylightWindow(date: Date, lat: number, lng: number): DaylightWindow {
  const J = toJulian(date);
  const n = Math.round(J - J2000 + 0.0008 - lng / 360);

  const Jstar = n - lng / 360;
  const M = (357.5291 + 0.98560028 * Jstar) % 360;
  const Mrad = M * DEG;
  const C =
    1.9148 * Math.sin(Mrad) +
    0.02 * Math.sin(2 * Mrad) +
    0.0003 * Math.sin(3 * Mrad);
  const lambda = (M + C + 180 + 102.9372) % 360;
  const lambdaRad = lambda * DEG;

  const Jtransit =
    J2000 + Jstar + 0.0053 * Math.sin(Mrad) - 0.0069 * Math.sin(2 * lambdaRad);

  const delta = Math.asin(Math.sin(lambdaRad) * Math.sin(23.44 * DEG));
  // Civil twilight uses altitude -6°
  const h0 = -6 * DEG;
  const latRad = lat * DEG;

  const cosH =
    (Math.sin(h0) - Math.sin(latRad) * Math.sin(delta)) /
    (Math.cos(latRad) * Math.cos(delta));

  if (cosH > 1) {
    // Sun never gets to -6° → always dark (no civil light window)
    return {
      dawn: date.getTime(),
      dusk: date.getTime(),
      alwaysLight: false,
      alwaysDark: true,
    };
  }
  if (cosH < -1) {
    // Sun never goes below -6° → always light
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return {
      dawn: start.getTime(),
      dusk: end.getTime(),
      alwaysLight: true,
      alwaysDark: false,
    };
  }

  const H = Math.acos(cosH) / DEG;
  const Jset = Jtransit + H / 360;
  const Jrise = Jtransit - H / 360;

  return {
    dawn: fromJulian(Jrise).getTime(),
    dusk: fromJulian(Jset).getTime(),
    alwaysLight: false,
    alwaysDark: false,
  };
}

/** Convenience: is the given ms-epoch timestamp outside civil-light hours? */
export function isDarkAt(timestamp: number, lat: number, lng: number): boolean {
  const win = getDaylightWindow(new Date(timestamp), lat, lng);
  if (win.alwaysDark) return true;
  if (win.alwaysLight) return false;
  return timestamp < win.dawn || timestamp > win.dusk;
}

/**
 * Return the number of milliseconds of the given [start,end] interval that fall
 * outside civil light. Used to decide if a walking leg passes through darkness.
 */
export function darknessOverlapMs(
  startMs: number,
  endMs: number,
  lat: number,
  lng: number,
): number {
  if (endMs <= startMs) return 0;
  // Only need to consider the day(s) the interval spans. Usually one, at most two.
  let total = 0;
  const midOfInterval = new Date(startMs + (endMs - startMs) / 2);
  const days: Date[] = [new Date(midOfInterval)];
  // Check previous day too in case the interval crosses midnight window
  const prev = new Date(midOfInterval);
  prev.setDate(prev.getDate() - 1);
  days.unshift(prev);
  const next = new Date(midOfInterval);
  next.setDate(next.getDate() + 1);
  days.push(next);

  // For each day, the "dark" segments are [dayStart, dawn] ∪ [dusk, dayEnd]
  for (const d of days) {
    const win = getDaylightWindow(d, lat, lng);
    if (win.alwaysLight) continue;
    if (win.alwaysDark) {
      // The entire 24 h is dark — add intersection with that day
      const dayStart = new Date(d);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + 86400000;
      total += Math.max(
        0,
        Math.min(endMs, dayEnd) - Math.max(startMs, dayStart.getTime()),
      );
      continue;
    }
    const dayStart = new Date(d);
    dayStart.setHours(0, 0, 0, 0);
    const dayEndMs = dayStart.getTime() + 86400000;
    // Before dawn
    total += Math.max(
      0,
      Math.min(endMs, win.dawn) - Math.max(startMs, dayStart.getTime()),
    );
    // After dusk
    total += Math.max(0, Math.min(endMs, dayEndMs) - Math.max(startMs, win.dusk));
  }
  return total;
}
