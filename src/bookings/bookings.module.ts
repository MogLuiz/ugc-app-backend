import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AvailabilityModule } from '../availability/availability.module';
import { JobTypesModule } from '../job-types/job-types.module';
import { Booking } from './entities/booking.entity';
import { BookingsRepository } from './bookings.repository';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { BookingValidationService } from './services/booking-validation.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Booking]),
    AuthModule,
    UsersModule,
    AvailabilityModule,
    JobTypesModule,
  ],
  controllers: [BookingsController],
  providers: [BookingsRepository, BookingsService, BookingValidationService],
  exports: [BookingsService],
})
export class BookingsModule {}
