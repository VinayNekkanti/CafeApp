/**
 * Calculates the distance between two coordinates in miles using the Haversine formula.
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 3958.8; // Radius of the Earth in miles
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in miles
}

/**
 * Formats a distance in miles into a readable string.
 */
export function formatDistance(miles: number): string {
  if (miles < 0.1) {
    return 'Less than 500 ft';
  }
  return `${miles.toFixed(1)} mi`;
}

/**
 * Estimates walking time in minutes based on distance (assumes 3 mph walking speed).
 */
export function estimateWalkingTime(miles: number): number {
  // 3 mph = 20 minutes per mile
  return Math.round(miles * 20);
}

/**
 * Estimates driving time in minutes based on distance (assumes 25 mph average city speed).
 */
export function estimateDrivingTime(miles: number): number {
  // 25 mph = 2.4 minutes per mile
  const time = Math.round(miles * 2.4);
  return time < 1 ? 1 : time;
}
