import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { JobType } from './entities/job-type.entity';
import { JobTypesRepository } from './job-types.repository';
import { JobTypesService } from './job-types.service';
import { JobTypesController } from './job-types.controller';

@Module({
  imports: [TypeOrmModule.forFeature([JobType]), AuthModule],
  controllers: [JobTypesController],
  providers: [JobTypesRepository, JobTypesService],
  exports: [JobTypesRepository, JobTypesService],
})
export class JobTypesModule {}
