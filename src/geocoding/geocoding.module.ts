import { Module } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';
import { GeocodingStubService } from './geocoding.stub.service';

@Module({
  providers: [
    GeocodingStubService,
    {
      provide: GeocodingService,
      useExisting: GeocodingStubService,
    },
  ],
  exports: [GeocodingService],
})
export class GeocodingModule {}
