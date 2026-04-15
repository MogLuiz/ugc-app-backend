import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { SentryUserContextInterceptor } from './common/interceptors/sentry-user-context.interceptor';
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
import { ContractRequestsModule } from './contract-requests/contract-requests.module';
import { ConversationsModule } from './conversations/conversations.module';
import { CreatorModule } from './creator/creator.module';
import { ReferralsModule } from './referrals/referrals.module';
import { OpenOffersModule } from './open-offers/open-offers.module';
import { PaymentsModule } from './payments/payments.module';

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule,
    DatabaseModule,
    EventEmitterModule.forRoot(),
    AuthModule,
    UsersModule,
    ProfilesModule,
    PortfolioModule,
    AvailabilityModule,
    JobTypesModule,
    CreatorJobTypesModule,
    BookingsModule,
    ContractRequestsModule,
    ConversationsModule,
    CreatorModule,
    ReferralsModule,
    OpenOffersModule,
    PaymentsModule,
    UploadsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
    { provide: APP_INTERCEPTOR, useClass: SentryUserContextInterceptor },
  ],
})
export class AppModule {}
