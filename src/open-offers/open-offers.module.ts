import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { JobTypesModule } from '../job-types/job-types.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ContractRequestsModule } from '../contract-requests/contract-requests.module';
import { OpenOffersController } from './open-offers.controller';
import { OpenOffersService } from './open-offers.service';
import { OpenOffersRepository } from './open-offers.repository';
import { OpenOffer } from './entities/open-offer.entity';
import { OpenOfferApplication } from './entities/open-offer-application.entity';
import { DistanceService } from '../contract-requests/services/distance.service';
import { PricingService } from '../contract-requests/services/pricing.service';
import { TransportService } from '../contract-requests/services/transport.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([OpenOffer, OpenOfferApplication]),
    AuthModule,
    UsersModule,
    JobTypesModule,
    PlatformSettingsModule,
    GeocodingModule,
    SchedulingModule,
    ContractRequestsModule,
  ],
  controllers: [OpenOffersController],
  providers: [
    OpenOffersService,
    OpenOffersRepository,
    // Serviços de cálculo sem dependências de BD — re-declarados aqui para evitar
    // cross-module export desnecessário.
    DistanceService,
    PricingService,
    TransportService,
  ],
})
export class OpenOffersModule {}
