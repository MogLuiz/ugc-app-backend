import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformSettingsRepository } from './platform-settings.repository';

export type PlatformSettingsSnapshot = {
  transportPricePerKm: number;
  transportMinimumFee: number;
};

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly platformSettingsRepository: PlatformSettingsRepository,
  ) {}

  async getCurrentOrThrow(): Promise<PlatformSettingsSnapshot> {
    const settings = await this.platformSettingsRepository.findCurrent();

    if (!settings) {
      throw new NotFoundException(
        'Configurações da plataforma não encontradas para cálculo de transporte',
      );
    }

    return {
      transportPricePerKm: settings.transportPricePerKm,
      transportMinimumFee: settings.transportMinimumFee,
    };
  }
}
