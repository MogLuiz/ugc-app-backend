import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PlatformSetting } from './entities/platform-setting.entity';

@Injectable()
export class PlatformSettingsRepository {
  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
  ) {}

  async findCurrent(): Promise<PlatformSetting | null> {
    return this.repo
      .createQueryBuilder('platformSetting')
      .orderBy('platformSetting.created_at', 'DESC')
      .getOne();
  }
}
