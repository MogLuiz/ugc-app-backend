import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingResult, GeocodingService } from './geocoding.service';

type GoogleGeocodeResponse = {
  status: string;
  results: Array<{
    formatted_address: string;
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
};

@Injectable()
export class GoogleGeocodingService extends GeocodingService {
  private readonly logger = new Logger(GoogleGeocodingService.name);
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService) {
    super();
    this.apiKey = this.configService.get<string>('GOOGLE_MAPS_API_KEY') ?? '';
  }

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    try {
      const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
      url.searchParams.set('address', address);
      url.searchParams.set('key', this.apiKey);
      url.searchParams.set('region', 'BR');
      url.searchParams.set('language', 'pt-BR');

      const response = await fetch(url.toString());
      if (!response.ok) {
        this.logger.warn(`Google Geocoding HTTP error: ${response.status}`);
        return null;
      }

      const data = (await response.json()) as GoogleGeocodeResponse;

      if (data.status !== 'OK' || data.results.length === 0) {
        this.logger.warn(`Google Geocoding returned status ${data.status} for: ${address}`);
        return null;
      }

      const result = data.results[0];
      return {
        lat: result.geometry.location.lat,
        lng: result.geometry.location.lng,
        normalizedAddress: result.formatted_address,
      };
    } catch (error) {
      this.logger.error(
        `Google Geocoding error for address "${address}"`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }
}
