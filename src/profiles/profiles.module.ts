import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from './entities/profile.entity';
import { CreatorProfile } from './entities/creator-profile.entity';
import { CompanyProfile } from './entities/company-profile.entity';
import { ProfilesService } from './profiles.service';
import { ProfilesController } from './profiles.controller';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';
import { PortfolioModule } from '../portfolio/portfolio.module';
import { AvailabilityModule } from '../availability/availability.module';
import { GeocodingModule } from '../geocoding/geocoding.module';
import { CreatorJobTypesModule } from '../creator-job-types/creator-job-types.module';
import { ProfileLocationService } from './services/profile-location.service';
import { DistanceService } from '../contract-requests/services/distance.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Profile, CreatorProfile, CompanyProfile]),
    UsersModule,
    AuthModule,
    PortfolioModule,
    AvailabilityModule,
    GeocodingModule,
    CreatorJobTypesModule,
  ],
  controllers: [ProfilesController],
  providers: [ProfilesService, ProfileLocationService, DistanceService],
  exports: [ProfilesService, ProfileLocationService, DistanceService],
})
export class ProfilesModule {}
