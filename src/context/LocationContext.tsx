import * as Location from 'expo-location';
import React, { createContext, useContext, useEffect, useState } from 'react';
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
          setLocation({
            latitude: currentLoc.coords.latitude,
            longitude: currentLoc.coords.longitude,
            isFallback: false,
            permissionGranted: true,
          });
        } else {
          setLocation({
            latitude: UCI_FALLBACK_LOCATION.latitude,
            longitude: UCI_FALLBACK_LOCATION.longitude,
            isFallback: true,
            permissionGranted: true,
          });
        }
      } else {
        // Not granted yet, or denied
        setLocation({
          latitude: UCI_FALLBACK_LOCATION.latitude,
          longitude: UCI_FALLBACK_LOCATION.longitude,
          isFallback: true,
          permissionGranted: false,
        });
      }
    } catch (err) {
      console.warn('Error fetching location, using UCI fallback:', err);
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
    setLoading(true);
    try {
      const permissionResult = await withTimeout(
        Location.requestForegroundPermissionsAsync(),
        10000,
        { status: 'undetermined' } as Location.PermissionResponse
      );

      if (permissionResult.status === 'granted') {
        const currentLoc = await withTimeout(
          Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }),
          5000,
          null
        );

        if (currentLoc) {
          setLocation({
            latitude: currentLoc.coords.latitude,
            longitude: currentLoc.coords.longitude,
            isFallback: false,
            permissionGranted: true,
          });
        } else {
          setLocation({
            latitude: UCI_FALLBACK_LOCATION.latitude,
            longitude: UCI_FALLBACK_LOCATION.longitude,
            isFallback: true,
            permissionGranted: true,
          });
        }
      } else {
        setLocation({
          latitude: UCI_FALLBACK_LOCATION.latitude,
          longitude: UCI_FALLBACK_LOCATION.longitude,
          isFallback: true,
          permissionGranted: false,
        });
      }
    } catch (err) {
      console.error('Error requesting location permission:', err);
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
