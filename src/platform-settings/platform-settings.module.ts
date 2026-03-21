import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlatformSetting } from './entities/platform-setting.entity';
import { PlatformSettingsRepository } from './platform-settings.repository';
import { PlatformSettingsService } from './platform-settings.service';

@Module({
  imports: [TypeOrmModule.forFeature([PlatformSetting])],
  providers: [PlatformSettingsRepository, PlatformSettingsService],
  exports: [PlatformSettingsService],
})
export class PlatformSettingsModule {}
