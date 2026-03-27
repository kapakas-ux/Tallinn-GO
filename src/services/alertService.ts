export interface ActiveAlert {
  id: string;
  stopId: string;
  stopName: string;
  line: string;
  destination: string;
  departureTimestamp: number;
  minutesBefore: number;
}

const ALERTS_KEY = 'tallinn_go_active_alerts';
let memoryAlerts: ActiveAlert[] = [];

export const getActiveAlerts = (): ActiveAlert[] => {
  try {
    const stored = localStorage.getItem(ALERTS_KEY);
    let alerts: ActiveAlert[] = [];
    if (stored) {
      alerts = JSON.parse(stored);
    }
    
    // Merge with memory alerts in case localStorage failed to save some
    const allAlerts = [...alerts, ...memoryAlerts];
    // Deduplicate by ID
    const uniqueAlerts = Array.from(new Map(allAlerts.map(a => [a.id, a])).values());
    
    // Filter out expired alerts (already departed)
    const now = Date.now();
    const active = uniqueAlerts.filter(a => a.departureTimestamp > now);
    
    if (active.length !== alerts.length) {
      try {
        localStorage.setItem(ALERTS_KEY, JSON.stringify(active));
      } catch (e) {
        // Ignore setItem errors here
      }
    }
    
    return active;
  } catch (err) {
    console.warn('Failed to get active alerts from localStorage, using memory:', err);
    memoryAlerts = memoryAlerts.filter(a => a.departureTimestamp > Date.now());
    return memoryAlerts;
  }
};

export const addActiveAlert = (alert: ActiveAlert) => {
  try {
    const alerts = getActiveAlerts();
    // Prevent duplicates for same stop/line/time
    const exists = alerts.some(a => a.stopId === alert.stopId && a.line === alert.line && Math.abs(a.departureTimestamp - alert.departureTimestamp) < 60000);
    if (exists) return;

    alerts.push(alert);
    memoryAlerts.push(alert); // Always add to memory as fallback
    localStorage.setItem(ALERTS_KEY, JSON.stringify(alerts));
  } catch (err) {
    console.warn('Failed to add active alert to localStorage, relying on memory:', err);
  }
};

export const removeActiveAlert = (id: string) => {
  try {
    const alerts = getActiveAlerts();
    const filtered = alerts.filter(a => a.id !== id);
    memoryAlerts = memoryAlerts.filter(a => a.id !== id); // Always remove from memory
    localStorage.setItem(ALERTS_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn('Failed to remove active alert from localStorage, relying on memory:', err);
  }
};

export const isAlertActive = (stopId: string, line: string, minutes: number): boolean => {
  const alerts = getActiveAlerts();
  const targetTimestamp = Date.now() + minutes * 60 * 1000;
  // Check if any alert matches stop, line and is within 2 minutes of the target timestamp
  return alerts.some(a => 
    a.stopId === stopId && 
    a.line === line && 
    Math.abs(a.departureTimestamp - targetTimestamp) < 120000
  );
};
