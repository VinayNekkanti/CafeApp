import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { LocationState } from '../types';

// UC Irvine fallback coordinates
export const UCI_FALLBACK_LOCATION = {
  latitude: 33.6405,
  longitude: -117.8443,
};

interface LocationContextType {
  location: LocationState;
  loading: boolean;
  requestLocationPermission: () => Promise<void>;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [location, setLocation] = useState<LocationState>({
    latitude: UCI_FALLBACK_LOCATION.latitude,
    longitude: UCI_FALLBACK_LOCATION.longitude,
    isFallback: true,
    permissionGranted: false,
  });
  const [loading, setLoading] = useState(true);

  const withTimeout = async <T,>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> => {
    let timeoutId: any;
    const timeoutPromise = new Promise<T>((resolve) => {
      timeoutId = setTimeout(() => resolve(fallbackValue), ms);
    });
    return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
  };

  const fetchLocation = async () => {
    setLoading(true);
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            console.log(
              `[Location Debug] Phase: initial fetch (web), Status: granted, Coordinates: lat=${pos.coords.latitude}, lon=${pos.coords.longitude}`
            );
            setLocation({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              isFallback: false,
              permissionGranted: true,
            });
            setLoading(false);
          },
          (err) => {
            console.log(`[Location Debug] Phase: initial fetch (web), Error code: ${err.code}, message: ${err.message}`);
            setLocation({
              latitude: UCI_FALLBACK_LOCATION.latitude,
              longitude: UCI_FALLBACK_LOCATION.longitude,
              isFallback: true,
              permissionGranted: false,
            });
            setLoading(false);
          },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 60000 }
        );
        return;
      }

      const permissionResult = await withTimeout(
        Location.getForegroundPermissionsAsync(),
        2000,
        { status: 'undetermined' } as Location.PermissionResponse
      );

      if (permissionResult.status === 'granted') {
        const currentLoc = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          3000,
          null
        );

        if (currentLoc) {
          console.log(
            `[Location Debug] Phase: initial fetch (native), Status: granted, Coordinates: lat=${currentLoc.coords.latitude}, lon=${currentLoc.coords.longitude}`
          );
          setLocation({
            latitude: currentLoc.coords.latitude,
            longitude: currentLoc.coords.longitude,
            isFallback: false,
            permissionGranted: true,
          });
        } else {
          console.log('[Location Debug] Phase: initial fetch (native), Status: granted but position timeout');
          setLocation({
            latitude: UCI_FALLBACK_LOCATION.latitude,
            longitude: UCI_FALLBACK_LOCATION.longitude,
            isFallback: true,
            permissionGranted: true,
          });
        }
      } else {
        console.log(`[Location Debug] Phase: initial fetch (native), Status: ${permissionResult.status}`);
        setLocation({
          latitude: UCI_FALLBACK_LOCATION.latitude,
          longitude: UCI_FALLBACK_LOCATION.longitude,
          isFallback: true,
          permissionGranted: false,
        });
      }
    } catch (err) {
      console.warn('[Location Debug] Phase: initial fetch, Error:', err);
      setLocation({
        latitude: UCI_FALLBACK_LOCATION.latitude,
        longitude: UCI_FALLBACK_LOCATION.longitude,
        isFallback: true,
        permissionGranted: false,
      });
    } finally {
      setLoading(false);
    }
  };

  const requestLocationPermission = async () => {
    console.log('[Location Debug] Enable pressed');
    setLoading(true);

    const handleWebError = async (err: GeolocationPositionError) => {
      console.log(`[Location Debug] Phase: browser geolocation, Error code: ${err.code}, message: ${err.message}`);
      console.log('[Location Debug] Phase: state update, Status: using UCI fallback');

      setLocation({
        latitude: UCI_FALLBACK_LOCATION.latitude,
        longitude: UCI_FALLBACK_LOCATION.longitude,
        isFallback: true,
        permissionGranted: false,
      });
      setLoading(false);

      if (err.code === 1) { // PERMISSION_DENIED
        const msg = 'Location is blocked for this site. Enable Location in your browser site permissions and try again.';
        if (typeof window !== 'undefined') window.alert(msg);
      } else if (err.code === 2) { // POSITION_UNAVAILABLE
        const msg = "Hardware GPS is unavailable on this desktop browser. Defaulting to UC Irvine campus area. (Tip: Use Chrome DevTools → Sensors to simulate exact GPS coordinates).";
        if (typeof window !== 'undefined') window.alert(msg);
      } else if (err.code === 3) { // TIMEOUT
        const msg = "We couldn't determine your location within the time limit. Using UC Irvine campus fallback.";
        if (typeof window !== 'undefined') window.alert(msg);
      } else {
        const msg = 'Unable to retrieve location. Continuing with UC Irvine campus fallback.';
        if (typeof window !== 'undefined') window.alert(msg);
      }
    };

    const handleWebSuccess = (pos: GeolocationPosition) => {
      console.log('[Location Debug] Phase: permission request, Status: granted');
      console.log(
        `[Location Debug] Phase: state update, Success: lat=${pos.coords.latitude}, lon=${pos.coords.longitude}`
      );
      setLocation({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        isFallback: false,
        permissionGranted: true,
      });
      setLoading(false);
    };

    // Web browser handling: navigator.geolocation with high-accuracy to coarse-accuracy fallback
    if (Platform.OS === 'web') {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        console.log('[Location Debug] Phase: browser support check, Error: Geolocation unsupported');
        setLocation({
          latitude: UCI_FALLBACK_LOCATION.latitude,
          longitude: UCI_FALLBACK_LOCATION.longitude,
          isFallback: true,
          permissionGranted: false,
        });
        setLoading(false);
        if (typeof window !== 'undefined') {
          window.alert("Location services aren't available in this browser.");
        }
        return;
      }

      // First attempt: High accuracy (GPS)
      navigator.geolocation.getCurrentPosition(
        handleWebSuccess,
        (firstErr) => {
          console.log(`[Location Debug] Phase: high-accuracy attempt failed (code ${firstErr.code}: ${firstErr.message})`);
          if (firstErr.code === 2 || firstErr.code === 3) {
            console.log('[Location Debug] Phase: retrying with coarse accuracy (enableHighAccuracy: false)');
            // Fallback attempt: Coarse accuracy (IP/Wi-Fi)
            navigator.geolocation.getCurrentPosition(
              handleWebSuccess,
              handleWebError,
              { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
            );
          } else {
            handleWebError(firstErr);
          }
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 30000 }
      );
      return;
    }

    // Native Handling (iOS / Android)
    try {
      console.log('[Location Debug] Phase: permission request (native)');
      const permissionResult = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        10000,
        { status: 'undetermined' } as Location.PermissionResponse
      );

      console.log(`[Location Debug] Phase: permission request (native), Status: ${permissionResult.status}`);

      if (permissionResult.status === 'granted') {
        console.log('[Location Debug] Phase: getCurrentPositionAsync (native)');
        const currentLoc = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          5000,
          null
        );

        if (currentLoc) {
          console.log(
            `[Location Debug] Phase: state update (native), Success: lat=${currentLoc.coords.latitude}, lon=${currentLoc.coords.longitude}`
          );
          setLocation({
            latitude: currentLoc.coords.latitude,
            longitude: currentLoc.coords.longitude,
            isFallback: false,
            permissionGranted: true,
          });
        } else {
          console.log('[Location Debug] Phase: getCurrentPositionAsync (native), Status: position timeout');
          setLocation({
            latitude: UCI_FALLBACK_LOCATION.latitude,
            longitude: UCI_FALLBACK_LOCATION.longitude,
            isFallback: true,
            permissionGranted: true,
          });
          Alert.alert(
            'Location Timeout',
            "We couldn't determine your location within the time limit. Try again or continue using the UC Irvine fallback."
          );
        }
      } else {
        console.log('[Location Debug] Phase: state update (native), Status: permission denied');
        setLocation({
          latitude: UCI_FALLBACK_LOCATION.latitude,
          longitude: UCI_FALLBACK_LOCATION.longitude,
          isFallback: true,
          permissionGranted: false,
        });
        Alert.alert(
          'Location Permission Denied',
          'Location permission was denied. Showing cafés near UC Irvine instead.'
        );
      }
    } catch (err) {
      console.warn('[Location Debug] Phase: native location request error:', err);
      setLocation({
        latitude: UCI_FALLBACK_LOCATION.latitude,
        longitude: UCI_FALLBACK_LOCATION.longitude,
        isFallback: true,
        permissionGranted: false,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  return (
    <LocationContext.Provider value={{ location, loading, requestLocationPermission }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (context === undefined) {
    throw new Error('useLocation must be used within a LocationProvider');
  }
  return context;
};
