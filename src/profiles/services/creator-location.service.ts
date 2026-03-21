import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../entities/profile.entity';
import { CreatorProfile } from '../entities/creator-profile.entity';
import { GeocodingService } from '../../geocoding/geocoding.service';

@Injectable()
export class CreatorLocationService {
  private readonly logger = new Logger(CreatorLocationService.name);

  constructor(
    @InjectRepository(CreatorProfile)
    private readonly creatorProfileRepo: Repository<CreatorProfile>,
    private readonly geocodingService: GeocodingService,
  ) {}

  async syncCoordinatesFromProfile(userId: string, profile: Profile): Promise<void> {
    let creatorProfile = await this.creatorProfileRepo.findOne({ where: { userId } });

    if (!creatorProfile) {
      creatorProfile = this.creatorProfileRepo.create({ userId });
    }

    const address = this.buildAddress(profile);
    if (!address) {
      creatorProfile.latitude = null;
      creatorProfile.longitude = null;
      await this.creatorProfileRepo.save(creatorProfile);
      return;
    }

    const geocoded = await this.geocodingService.geocodeAddress(address);
    if (!geocoded) {
      this.logger.warn(`Failed to geocode creator address for user ${userId}`);
      creatorProfile.latitude = null;
      creatorProfile.longitude = null;
      await this.creatorProfileRepo.save(creatorProfile);
      return;
    }

    creatorProfile.latitude = geocoded.lat;
    creatorProfile.longitude = geocoded.lng;
    await this.creatorProfileRepo.save(creatorProfile);
  }

  private buildAddress(profile: Profile): string | null {
    const parts = [
      profile.addressStreet,
      profile.addressNumber,
      profile.addressCity,
      profile.addressState,
      profile.addressZipCode,
      'Brasil',
    ]
      .map((part) => part?.trim())
      .filter(Boolean);

    if (!profile.addressStreet || !profile.addressCity || !profile.addressState) {
      return null;
    }

    return parts.join(', ');
  }
}
