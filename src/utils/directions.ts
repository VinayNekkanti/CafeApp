import { Alert, Linking, Platform } from 'react-native';

export interface LocationCoords {
  latitude: number;
  longitude: number;
}

export interface CafeDirectionsTarget {
  name: string;
  latitude: number;
  longitude: number;
  address?: string;
}

/**
 * Opens native or web map application with turn-by-turn directions
 * from the user's current GPS/fallback location to the selected café.
 */
export function openCafeDirections(
  cafe: CafeDirectionsTarget,
  userLocation?: LocationCoords | null
) {
  if (!cafe || typeof cafe.latitude !== 'number' || typeof cafe.longitude !== 'number') {
    Alert.alert('Location Error', 'Café coordinates are missing or invalid.');
    return;
  }

  const destLatLng = `${cafe.latitude},${cafe.longitude}`;
  const label = encodeURIComponent(cafe.name);

  const hasUserLoc = Boolean(
    userLocation &&
      typeof userLocation.latitude === 'number' &&
      typeof userLocation.longitude === 'number' &&
      userLocation.latitude !== 0
  );

  const originLatLng = hasUserLoc
    ? `${userLocation!.latitude},${userLocation!.longitude}`
    : '';

  let url = '';

  if (Platform.OS === 'ios') {
    url = originLatLng
      ? `http://maps.apple.com/?saddr=${originLatLng}&daddr=${destLatLng}&q=${label}`
      : `http://maps.apple.com/?daddr=${destLatLng}&q=${label}`;
  } else if (Platform.OS === 'android') {
    url = originLatLng
      ? `https://www.google.com/maps/dir/?api=1&origin=${originLatLng}&destination=${destLatLng}`
      : `geo:0,0?q=${destLatLng}(${label})`;
  } else {
    // Web / Fallback
    url = originLatLng
      ? `https://www.google.com/maps/dir/?api=1&origin=${originLatLng}&destination=${destLatLng}`
      : `https://www.google.com/maps/dir/?api=1&destination=${destLatLng}`;
  }

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  Linking.openURL(url).catch((err) => {
    console.warn('Failed to open directions URL:', url, err);
    Alert.alert(
      'Cannot Open Maps',
      'Could not launch map directions application on your device.'
    );
  });
}
