import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { JobTypesModule } from '../job-types/job-types.module';
import { CreatorJobTypesModule } from '../creator-job-types/creator-job-types.module';
import { PlatformSettingsModule } from '../platform-settings/platform-settings.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ContractRequestsController } from './contract-requests.controller';
import { ContractRequestsService } from './contract-requests.service';
import { DistanceService } from './services/distance.service';
import { PricingService } from './services/pricing.service';
import { TransportService } from './services/transport.service';

@Module({
  imports: [
    AuthModule,
    UsersModule,
    JobTypesModule,
    CreatorJobTypesModule,
    PlatformSettingsModule,
    GeocodingModule,
    SchedulingModule,
    ConversationsModule,
  ],
  controllers: [ContractRequestsController],
  providers: [ContractRequestsService, DistanceService, TransportService, PricingService],
  exports: [ContractRequestsService],
})
export class ContractRequestsModule {}
