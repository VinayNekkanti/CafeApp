export interface GeocodeResult {
  lat: number;
  lng: number;
  displayName: string;
}

export class GeocodeError extends Error {
  code: 'RATE_LIMIT' | 'NO_KEY' | 'API_ERROR' | 'NETWORK_ERROR' | 'NO_RESULTS';
  
  constructor(message: string, code: GeocodeError['code']) {
    super(message);
    this.name = 'GeocodeError';
    this.code = code;
  }
}

/**
 * Geocodes an address string using LocationIQ's forward geocoding API.
 * @param address The address or place query string.
 * @returns A promise resolving to a GeocodeResult object, or null if no results were found.
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  const apiKey = process.env.EXPO_PUBLIC_LOCATIONIQ_KEY;

  if (!apiKey || apiKey === 'pk.your_locationiq_token_here') {
    throw new GeocodeError('LocationIQ API key is missing or not configured.', 'NO_KEY');
  }

  try {
    const url = `https://us1.locationiq.com/v1/search?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(address)}&format=json&limit=1`;
    const response = await fetch(url);

    if (response.status === 429) {
      throw new GeocodeError('Rate limit exceeded (5,000 requests/day, 2 requests/second limit). Please slow down.', 'RATE_LIMIT');
    }

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new GeocodeError(`LocationIQ API responded with status ${response.status}`, 'API_ERROR');
    }

    const data = await response.json();

    if (!Array.isArray(data) || data.length === 0) {
      return null;
    }

    const result = data[0];
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    if (isNaN(lat) || isNaN(lng)) {
      throw new GeocodeError('Invalid coordinates received from geocoding service.', 'API_ERROR');
    }

    return {
      lat,
      lng,
      displayName: result.display_name,
    };
  } catch (error) {
    if (error instanceof GeocodeError) {
      throw error;
    }
    
    // Treat as general network connection error
    throw new GeocodeError(
      error instanceof Error ? error.message : 'Network error during address geocoding.',
      'NETWORK_ERROR'
    );
  }
}
