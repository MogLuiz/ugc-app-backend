import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { JobTypesModule } from '../job-types/job-types.module';
import { CreatorJobType } from './entities/creator-job-type.entity';
import { CreatorJobTypesRepository } from './creator-job-types.repository';
import { CreatorJobTypesService } from './creator-job-types.service';
import { CreatorJobTypesController } from './creator-job-types.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([CreatorJobType]),
    AuthModule,
    UsersModule,
    JobTypesModule,
  ],
  controllers: [CreatorJobTypesController],
  providers: [CreatorJobTypesRepository, CreatorJobTypesService],
  exports: [CreatorJobTypesRepository, CreatorJobTypesService],
})
export class CreatorJobTypesModule {}
