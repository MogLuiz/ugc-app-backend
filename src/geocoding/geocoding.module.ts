import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GeocodingService } from './geocoding.service';
import { GeocodingStubService } from './geocoding.stub.service';
import { GoogleGeocodingService } from './google-geocoding.service';

@Module({
  providers: [
    GeocodingStubService,
    GoogleGeocodingService,
    {
      provide: GeocodingService,
      useFactory: (configService: ConfigService, google: GoogleGeocodingService, stub: GeocodingStubService) => {
        const apiKey = configService.get<string>('GOOGLE_MAPS_API_KEY');
        return apiKey ? google : stub;
      },
      inject: [ConfigService, GoogleGeocodingService, GeocodingStubService],
    },
  ],
  exports: [GeocodingService],
})
export class GeocodingModule {}
