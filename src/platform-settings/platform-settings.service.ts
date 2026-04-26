import { Injectable, NotFoundException } from '@nestjs/common';
import { PlatformSettingsRepository } from './platform-settings.repository';

export type PlatformSettingsSnapshot = {
  transportPricePerKm: number;
  transportMinimumFee: number;
  platformFeeBps: number;
};

@Injectable()
export class PlatformSettingsService {
  constructor(
    private readonly platformSettingsRepository: PlatformSettingsRepository,
  ) {}

  async getCurrent(): Promise<PlatformSettingsSnapshot | null> {
    const settings = await this.platformSettingsRepository.findCurrent();

    if (!settings) {
      return null;
    }

    return {
      transportPricePerKm: settings.transportPricePerKm,
      transportMinimumFee: settings.transportMinimumFee,
      platformFeeBps: settings.platformFeeBps,
    };
  }

  async getCurrentOrThrow(): Promise<PlatformSettingsSnapshot> {
    const settings = await this.getCurrent();

    if (!settings) {
      throw new NotFoundException(
        'Configurações da plataforma não encontradas para cálculo de transporte',
      );
    }

    return settings;
  }
}
