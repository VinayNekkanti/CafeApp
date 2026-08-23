import { Cafe } from '../types';

export interface RouteCoordinates {
  latitude: number;
  longitude: number;
}

export interface RouteResult {
  coordinates: RouteCoordinates[];
  distanceMiles: number;
  durationMinutes: number;
  travelMode: 'driving' | 'walking';
  cafe: Cafe;
}

/**
 * Fetches turn-by-turn road route geometry and distance/duration metrics
 * using LocationIQ Directions API with OSRM fallback.
 */
export async function fetchRoute(
  origin: RouteCoordinates,
  destCafe: Cafe,
  mode: 'driving' | 'walking' = 'driving'
): Promise<RouteResult> {
  const originStr = `${origin.longitude},${origin.latitude}`;
  const destStr = `${destCafe.longitude},${destCafe.latitude}`;

  const apiKey = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY;
  const isKeyValid = apiKey && apiKey !== 'pk.your_locationiq_token_here' && !apiKey.startsWith('pk.your_');

  let data: any = null;

  // 1. Primary: LocationIQ Directions API
  if (isKeyValid) {
    try {
      const locationIqUrl = `https://us1.locationiq.com/v1/directions/${mode}/${originStr};${destStr}?key=${encodeURIComponent(
        apiKey
      )}&overview=full&geometries=geojson`;

      const response = await fetch(locationIqUrl);
      if (response.ok) {
        data = await response.json();
      }
    } catch (err) {
      console.warn('LocationIQ routing request failed, trying OSRM fallback:', err);
    }
  }

  // 2. Fallback: Public OSRM API (Zero-config backup)
  if (!data || !data.routes || data.routes.length === 0) {
    try {
      const osrmUrl = `https://router.project-osrm.org/route/v1/${mode}/${originStr};${destStr}?overview=full&geometries=geojson`;
      const response = await fetch(osrmUrl);
      if (response.ok) {
        data = await response.json();
      }
    } catch (err) {
      console.error('OSRM routing request failed:', err);
    }
  }

  if (!data || !data.routes || !Array.isArray(data.routes) || data.routes.length === 0) {
    throw new Error('Unable to calculate route between points right now.');
  }

  const mainRoute = data.routes[0];
  const rawCoords = mainRoute.geometry?.coordinates || [];

  if (!Array.isArray(rawCoords) || rawCoords.length === 0) {
    throw new Error('Malformed route geometry received.');
  }

  // Transform GeoJSON [longitude, latitude] into { latitude, longitude }
  const coordinates: RouteCoordinates[] = rawCoords.map((pt: [number, number]) => ({
    latitude: pt[1],
    longitude: pt[0],
  }));

  // Convert distance in meters to miles (1 meter = 0.000621371 miles)
  const meters = mainRoute.distance || 0;
  const distanceMiles = parseFloat((meters * 0.000621371).toFixed(1));

  // Convert duration in seconds to minutes
  const seconds = mainRoute.duration || 0;
  const durationMinutes = Math.max(1, Math.round(seconds / 60));

  return {
    coordinates,
    distanceMiles,
    durationMinutes,
    travelMode: mode,
    cafe: destCafe,
  };
}
