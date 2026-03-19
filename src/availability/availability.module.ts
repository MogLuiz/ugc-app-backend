import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { AvailabilityRule } from './entities/availability-rule.entity';
import { AvailabilityRepository } from './availability.repository';
import { AvailabilityService } from './availability.service';
import { AvailabilityController } from './availability.controller';

@Module({
  imports: [TypeOrmModule.forFeature([AvailabilityRule]), AuthModule, UsersModule],
  controllers: [AvailabilityController],
  providers: [AvailabilityRepository, AvailabilityService],
  exports: [AvailabilityRepository, AvailabilityService],
})
export class AvailabilityModule {}
