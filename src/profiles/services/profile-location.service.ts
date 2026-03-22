import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { GeocodingStatus } from '../../common/enums/geocoding-status.enum';
import { GeocodingService } from '../../geocoding/geocoding.service';
import { Profile } from '../entities/profile.entity';

type AddressPatch = {
  addressStreet?: string;
  addressNumber?: string;
  addressCity?: string;
  addressState?: string;
  addressZipCode?: string;
};

type ResolvedAddress = {
  addressStreet: string | null;
  addressNumber: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressZipCode: string | null;
};

@Injectable()
export class ProfileLocationService {
  private readonly logger = new Logger(ProfileLocationService.name);

  constructor(
    @InjectRepository(Profile)
    private readonly profileRepo: Repository<Profile>,
    private readonly geocodingService: GeocodingService,
    private readonly configService: ConfigService,
  ) {}

  hasAddressChange(profile: Profile, patch: AddressPatch): boolean {
    const currentHash = this.buildAddressHash(this.resolveAddress(profile, {}));
    const nextHash = this.buildAddressHash(this.resolveAddress(profile, patch));
    return currentHash !== nextHash;
  }

  /**
   * Indica se o perfil tem endereço suficiente para geocodificar (usado para
   * usuários legados que têm endereço mas ainda não possuem coordenadas).
   */
  canResolveAndGeocode(profile: Profile): boolean {
    const resolved = this.resolveAddress(profile, {});
    return Boolean(
      this.buildAddressHash(resolved) &&
        this.canGeocode(resolved) &&
        this.buildGeocodingInput(resolved),
    );
  }

  /**
   * Garante que addressHash e geocodingStatus estão preenchidos quando o
   * endereço não mudou mas o perfil ainda não tem coordenadas (usuários legados).
   * Necessário para o race check de syncProfileCoordinates passar.
   */
  ensureAddressHashForGeocoding(profile: Profile): void {
    const resolved = this.resolveAddress(profile, {});
    const hash = this.buildAddressHash(resolved);
    if (hash && profile.addressHash !== hash) {
      profile.addressHash = hash;
      if (profile.geocodingStatus !== GeocodingStatus.VALID) {
        profile.geocodingStatus = this.canGeocode(resolved)
          ? GeocodingStatus.PENDING
          : GeocodingStatus.INVALID;
      }
    }
  }

  prepareAddressForGeocoding(profile: Profile): void {
    const resolved = this.resolveAddress(profile, {});
    profile.addressHash = this.buildAddressHash(resolved);
    profile.formattedAddress = null;
    profile.latitude = null;
    profile.longitude = null;
    profile.geocodedAt = null;
    profile.hasValidCoordinates = false;
    profile.geocodingStatus = this.canGeocode(resolved)
      ? GeocodingStatus.PENDING
      : GeocodingStatus.INVALID;
  }

  async syncProfileCoordinates(userId: string): Promise<string | null> {
    const snapshot = await this.profileRepo.findOne({ where: { userId } });
    if (!snapshot) {
      return null;
    }

    const resolved = this.resolveAddress(snapshot, {});
    const addressHash = this.buildAddressHash(resolved);
    if (!addressHash) {
      await this.markAsInvalid(snapshot.userId);
      return 'Preencha rua ou CEP, cidade e estado para validar o endereço.';
    }

    const geocodingInput = this.buildGeocodingInput(resolved);
    if (!geocodingInput) {
      await this.markAsInvalid(snapshot.userId);
      return 'Preencha rua ou CEP, cidade e estado para validar o endereço.';
    }

    const geocoded = await this.geocodeWithTimeout(geocodingInput);
    const current = await this.profileRepo.findOne({ where: { userId } });
    if (!current || current.addressHash !== addressHash) {
      return null;
    }

    if (!geocoded) {
      await this.markAsInvalid(current.userId);
      this.logger.warn(`Falha ao geocodificar endereço do perfil ${current.userId}`);
      return 'Nao foi possivel validar o endereco informado. Revise os dados e tente novamente.';
    }

    current.formattedAddress = geocoded.normalizedAddress ?? geocodingInput;
    current.latitude = geocoded.lat;
    current.longitude = geocoded.lng;
    current.geocodingStatus = GeocodingStatus.VALID;
    current.geocodedAt = new Date();
    current.hasValidCoordinates = true;
    await this.profileRepo.save(current);
    return null;
  }

  private async markAsInvalid(userId: string): Promise<void> {
    const profile = await this.profileRepo.findOne({ where: { userId } });
    if (!profile) return;
    profile.formattedAddress = null;
    profile.latitude = null;
    profile.longitude = null;
    profile.geocodedAt = null;
    profile.hasValidCoordinates = false;
    profile.geocodingStatus = GeocodingStatus.INVALID;
    await this.profileRepo.save(profile);
  }

  private async geocodeWithTimeout(address: string) {
    const timeoutMs = this.configService.get<number>('GEOCODING_TIMEOUT_MS') ?? 3000;
    return Promise.race([
      this.geocodingService.geocodeAddress(address),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
  }

  private resolveAddress(profile: Profile, patch: AddressPatch): ResolvedAddress {
    return {
      addressStreet: this.resolveValue(profile, patch, 'addressStreet'),
      addressNumber: this.resolveValue(profile, patch, 'addressNumber'),
      addressCity: this.resolveValue(profile, patch, 'addressCity'),
      addressState: this.resolveValue(profile, patch, 'addressState'),
      addressZipCode: this.resolveValue(profile, patch, 'addressZipCode'),
    };
  }

  private resolveValue(
    profile: Profile,
    patch: AddressPatch,
    key: keyof AddressPatch,
  ): string | null {
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      return this.normalizePart(patch[key]);
    }

    return this.normalizePart(profile[key]);
  }

  private canGeocode(address: ResolvedAddress): boolean {
    return Boolean(
      (address.addressStreet || address.addressZipCode) &&
        address.addressCity &&
        address.addressState,
    );
  }

  private buildGeocodingInput(address: ResolvedAddress): string | null {
    if (!this.canGeocode(address)) {
      return null;
    }

    return [
      [address.addressStreet, address.addressNumber].filter(Boolean).join(', '),
      address.addressCity,
      address.addressState,
      address.addressZipCode,
      'Brasil',
    ]
      .filter(Boolean)
      .join(', ');
  }

  private buildAddressHash(address: ResolvedAddress): string | null {
    const canonical = [
      address.addressStreet,
      address.addressNumber,
      address.addressCity,
      address.addressState,
      address.addressZipCode,
    ]
      .map((part) => this.normalizePart(part))
      .join('|');

    if (!canonical.replace(/\|/g, '').trim()) {
      return null;
    }

    return createHash('sha256').update(canonical).digest('hex');
  }

  private normalizePart(value: string | null | undefined): string | null {
    const normalized = value?.trim().replace(/\s+/g, ' ') ?? '';
    return normalized ? normalized : null;
  }
}
