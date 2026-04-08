import { Geolocation } from '@capacitor/geolocation';
import { Capacitor } from '@capacitor/core';

export interface Location {
  lat: number;
  lng: number;
}

// Tallinn Center (Viru Keskus area)
export const TALLINN_CENTER: Location = {
  lat: 59.4372,
  lng: 24.7552
};

// Check if a location is roughly in Estonia (simple bounding box)
export const isInEstonia = (lat: number, lng: number): boolean => {
  return lat > 57.5 && lat < 60.0 && lng > 21.5 && lng < 28.5;
};

export const getEffectiveLocation = (coords: { latitude: number; longitude: number } | null): Location => {
  if (!coords) return TALLINN_CENTER;
  
  return {
    lat: coords.latitude,
    lng: coords.longitude
  };
};

export const watchLocation = (callback: (location: Location, isSimulated: boolean) => void) => {
  const options = {
    enableHighAccuracy: true,
    timeout: 10000, // 10 seconds timeout
    maximumAge: 30000 // Allow 30s old cached location for faster initial fix
  };

  let hasReceivedPosition = false;
  let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

  // If no real position arrives within 15s, fall back to Tallinn center
  const startFallbackTimer = () => {
    if (fallbackTimer) clearTimeout(fallbackTimer);
    fallbackTimer = setTimeout(() => {
      if (!hasReceivedPosition) {
        console.warn('watchLocation: No GPS fix after 15s, falling back to Tallinn center');
        callback(TALLINN_CENTER, true);
      }
    }, 15_000);
  };

  const onPosition = (location: Location) => {
    hasReceivedPosition = true;
    if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
    callback(location, false);
  };

  if (Capacitor.isNativePlatform()) {
    // Use Capacitor Geolocation for native apps
    let watchId: string | null = null;

    const startWatching = async () => {
      try {
        console.log('watchLocation (native): Checking permissions...');
        const permissions = await Geolocation.checkPermissions();
        console.log('watchLocation (native): Current permissions:', JSON.stringify(permissions));
        
        if (permissions.location !== 'granted') {
          console.log('watchLocation (native): Requesting permissions...');
          const requestResult = await Geolocation.requestPermissions();
          console.log('watchLocation (native): Request result:', JSON.stringify(requestResult));
          if (requestResult.location !== 'granted') {
            console.warn('watchLocation (native): Permission denied by user');
            callback(TALLINN_CENTER, true);
            return;
          }
        }

        startFallbackTimer();

        // Get initial position quickly (even if cached)
        try {
          console.log('watchLocation (native): Getting initial position...');
          const initialPosition = await Geolocation.getCurrentPosition({
            ...options,
            enableHighAccuracy: false, // Faster first fix
            timeout: 5000
          });
          if (initialPosition) {
            console.log('watchLocation (native): Initial position received:', initialPosition.coords.latitude, initialPosition.coords.longitude);
            onPosition(getEffectiveLocation(initialPosition.coords));
          }
        } catch (e) {
          console.log('Initial fast location failed, waiting for watch...', e);
        }

        console.log('watchLocation (native): Starting watchPosition...');
        watchId = await Geolocation.watchPosition(
          options,
          (position) => {
            if (position) {
              console.log('watchLocation (native): Watch update:', position.coords.latitude, position.coords.longitude);
              onPosition(getEffectiveLocation(position.coords));
            }
          }
        );
      } catch (error) {
        console.warn('Capacitor Geolocation error:', error);
        callback(TALLINN_CENTER, true);
      }
    };

    startWatching();

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (watchId) {
        Geolocation.clearWatch({ id: watchId });
      }
    };
  } else {
    // Fallback to standard navigator.geolocation for web
    if (!navigator.geolocation) {
      callback(TALLINN_CENTER, true);
      return () => {};
    }

    startFallbackTimer();
    let consecutiveErrors = 0;

    // Get initial position quickly
    navigator.geolocation.getCurrentPosition(
      (position) => {
        onPosition(getEffectiveLocation(position.coords));
      },
      null,
      { ...options, enableHighAccuracy: false, timeout: 5000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        consecutiveErrors = 0;
        onPosition(getEffectiveLocation(position.coords));
      },
      (error) => {
        console.warn('Geolocation error:', error);
        if (error.code === error.PERMISSION_DENIED) {
          callback(TALLINN_CENTER, true);
        } else {
          // TIMEOUT or POSITION_UNAVAILABLE — fall back after 3 consecutive failures
          consecutiveErrors++;
          if (consecutiveErrors >= 3 && !hasReceivedPosition) {
            console.warn('watchLocation: 3 consecutive GPS errors, falling back to Tallinn center');
            callback(TALLINN_CENTER, true);
          }
        }
      },
      options
    );

    return () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      navigator.geolocation.clearWatch(watchId);
    };
  }
};
