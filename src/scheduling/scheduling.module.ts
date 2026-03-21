import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from '../bookings/entities/booking.entity';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';
import { BookingsRepository } from '../bookings/bookings.repository';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { SchedulingConflictService } from './scheduling-conflict.service';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, ContractRequest])],
  providers: [
    BookingsRepository,
    ContractRequestsRepository,
    SchedulingConflictService,
  ],
  exports: [
    BookingsRepository,
    ContractRequestsRepository,
    SchedulingConflictService,
  ],
})
export class SchedulingModule {}
