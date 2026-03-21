export type GeocodingResult = {
  lat: number;
  lng: number;
  normalizedAddress?: string;
};

export abstract class GeocodingService {
  abstract geocodeAddress(address: string): Promise<GeocodingResult | null>;
}
