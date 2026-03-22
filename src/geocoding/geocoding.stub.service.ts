import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GeocodingResult,
  GeocodingService,
} from './geocoding.service';

type StubMode = 'always_fail' | 'mock_success' | 'accept_all';

type StubResponseMap = Record<string, { lat: number; lng: number }>;

const DEFAULT_BH_LAT = -19.9167;
const DEFAULT_BH_LNG = -43.9345;

@Injectable()
export class GeocodingStubService extends GeocodingService {
  private readonly logger = new Logger(GeocodingStubService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    const mode = this.getMode();
    const normalizedAddress = this.normalizeAddress(address);
    const responses = this.getResponses();

    if (mode === 'always_fail') {
      this.logger.warn(`Geocoding stub configured to fail for address: ${normalizedAddress}`);
      return null;
    }

    if (mode === 'accept_all') {
      const { lat, lng } = this.getDefaultCoordinates();
      return { lat, lng, normalizedAddress: address.trim() };
    }

    const match = responses[normalizedAddress];

    if (!match) {
      this.logger.warn(`Geocoding stub has no response for address: ${normalizedAddress}`);
      return null;
    }

    return {
      lat: match.lat,
      lng: match.lng,
      normalizedAddress: address.trim(),
    };
  }

  private getMode(): StubMode {
    const value = this.configService.get<string>('GEOCODING_STUB_MODE');
    if (value === 'mock_success') return 'mock_success';
    if (value === 'accept_all') return 'accept_all';
    if (value === 'always_fail') return 'always_fail';
    const nodeEnv = this.configService.get<string>('NODE_ENV');
    return nodeEnv === 'development' ? 'accept_all' : 'always_fail';
  }

  private getDefaultCoordinates(): { lat: number; lng: number } {
    const lat = this.configService.get<number>('GEOCODING_DEFAULT_LAT');
    const lng = this.configService.get<number>('GEOCODING_DEFAULT_LNG');
    if (lat != null && lng != null) return { lat, lng };
    return { lat: DEFAULT_BH_LAT, lng: DEFAULT_BH_LNG };
  }

  private getResponses(): StubResponseMap {
    const raw = this.configService.get<string>('GEOCODING_STUB_RESPONSES') ?? '{}';

    try {
      const parsed = JSON.parse(raw) as StubResponseMap;
      return Object.entries(parsed).reduce<StubResponseMap>((acc, [key, value]) => {
        acc[this.normalizeAddress(key)] = value;
        return acc;
      }, {});
    } catch (error) {
      this.logger.error('Invalid GEOCODING_STUB_RESPONSES JSON', error instanceof Error ? error.stack : undefined);
      return {};
    }
  }

  private normalizeAddress(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ');
  }
}
