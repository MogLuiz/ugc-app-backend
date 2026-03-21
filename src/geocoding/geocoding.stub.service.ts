import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  GeocodingResult,
  GeocodingService,
} from './geocoding.service';

type StubMode = 'always_fail' | 'mock_success';

type StubResponseMap = Record<string, { lat: number; lng: number }>;

@Injectable()
export class GeocodingStubService extends GeocodingService {
  private readonly logger = new Logger(GeocodingStubService.name);

  constructor(private readonly configService: ConfigService) {
    super();
  }

  async geocodeAddress(address: string): Promise<GeocodingResult | null> {
    const mode = this.getMode();
    const normalizedAddress = this.normalizeAddress(address);

    if (mode === 'always_fail') {
      this.logger.warn(`Geocoding stub configured to fail for address: ${normalizedAddress}`);
      return null;
    }

    const responses = this.getResponses();
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
    const value = this.configService.get<string>('GEOCODING_STUB_MODE') ?? 'always_fail';
    return value === 'mock_success' ? 'mock_success' : 'always_fail';
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
