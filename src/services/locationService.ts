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
            callback(getEffectiveLocation(initialPosition.coords), false);
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
              callback(getEffectiveLocation(position.coords), false);
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

    // Get initial position quickly
    navigator.geolocation.getCurrentPosition(
      (position) => {
        callback(getEffectiveLocation(position.coords), false);
      },
      null,
      { ...options, enableHighAccuracy: false, timeout: 5000 }
    );

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        callback(getEffectiveLocation(position.coords), false);
      },
      (error) => {
        console.warn('Geolocation error:', error);
        // Don't immediately fallback to center on every error (like timeout)
        // only if it's a permanent failure
        if (error.code === error.PERMISSION_DENIED) {
          callback(TALLINN_CENTER, true);
        }
      },
      options
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }
};
