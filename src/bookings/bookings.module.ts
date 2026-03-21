import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AvailabilityModule } from '../availability/availability.module';
import { JobTypesModule } from '../job-types/job-types.module';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingValidationService } from './services/booking-validation.service';
import { SchedulingModule } from '../scheduling/scheduling.module';

@Module({
  imports: [AuthModule, UsersModule, AvailabilityModule, JobTypesModule, SchedulingModule],
  controllers: [BookingsController],
  providers: [BookingsService, BookingValidationService],
  exports: [BookingsService],
})
export class BookingsModule {}
