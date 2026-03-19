import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ProfilesModule } from './profiles/profiles.module';
import { UploadsModule } from './uploads/uploads.module';
import { HealthModule } from './health/health.module';
import { PortfolioModule } from './portfolio/portfolio.module';
import { AvailabilityModule } from './availability/availability.module';
import { JobTypesModule } from './job-types/job-types.module';
import { BookingsModule } from './bookings/bookings.module';
import { CreatorJobTypesModule } from './creator-job-types/creator-job-types.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    UsersModule,
    ProfilesModule,
    PortfolioModule,
    AvailabilityModule,
    JobTypesModule,
    CreatorJobTypesModule,
    BookingsModule,
    UploadsModule,
    HealthModule,
  ],
})
export class AppModule {}
