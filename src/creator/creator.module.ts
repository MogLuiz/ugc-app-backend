import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { CreatorController } from './creator.controller';
import { CreatorService } from './creator.service';

@Module({
  imports: [AuthModule, UsersModule, SchedulingModule],
  controllers: [CreatorController],
  providers: [CreatorService],
})
export class CreatorModule {}
