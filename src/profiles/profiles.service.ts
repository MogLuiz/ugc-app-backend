import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import type { AuthUser } from '../common/interfaces/auth-user.interface';
import { User } from '../users/entities/user.entity';
import { Profile } from './entities/profile.entity';
import { CreatorProfile } from './entities/creator-profile.entity';
import { CompanyProfile } from './entities/company-profile.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersRepository } from '../users/users.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateCreatorProfileDto } from './dto/update-creator-profile.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';
import { PortfolioService } from '../portfolio/portfolio.service';
import { AvailabilityRepository } from '../availability/availability.repository';
import { AvailabilityDayOfWeek } from '../common/enums/availability-day-of-week.enum';
import {
  ListMarketplaceCreatorsDto,
  type MarketplaceSortBy,
} from './dto/list-marketplace-creators.dto';
import { CreatorJobTypesRepository } from '../creator-job-types/creator-job-types.repository';
import { JobMode } from '../common/enums/job-mode.enum';
import { ProfileLocationService } from './services/profile-location.service';
import { DistanceService } from '../contract-requests/services/distance.service';

const DEFAULT_MARKETPLACE_PAGE = 1;
const DEFAULT_MARKETPLACE_LIMIT = 8;
const MAX_MARKETPLACE_LIMIT = 500;
const DEFAULT_WORKING_START = '09:00:00';
const DEFAULT_WORKING_END = '18:00:00';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly configService: ConfigService,
    private usersRepository: UsersRepository,
    @InjectRepository(Profile)
    private profileRepo: Repository<Profile>,
    @InjectRepository(CreatorProfile)
    private creatorProfileRepo: Repository<CreatorProfile>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepo: Repository<CompanyProfile>,
    private portfolioService: PortfolioService,
    private availabilityRepository: AvailabilityRepository,
    private profileLocationService: ProfileLocationService,
    private creatorJobTypesRepository: CreatorJobTypesRepository,
    private distanceService: DistanceService,
  ) {}

  async getMe(authUserId: string, warnings?: string[]) {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado. Complete o cadastro em POST /users/bootstrap');
    }
    return this.buildPayload(user, warnings);
  }

  async updateProfile(authUserId: string, dto: UpdateProfileDto) {
    const user = await this.getUserOrThrow(authUserId);
    const profile = await this.profileRepo.findOne({ where: { userId: user.id } });
    if (!profile) throw new NotFoundException('Perfil não encontrado');

    const { phone, ...profileDto } = dto;
    const addressChanged = this.profileLocationService.hasAddressChange(profile, profileDto);
    Object.assign(profile, profileDto);
    if (dto.birthDate) profile.birthDate = new Date(dto.birthDate);
    if (addressChanged) {
      this.profileLocationService.prepareAddressForGeocoding(profile);
    } else if (
      !profile.hasValidCoordinates &&
      this.profileLocationService.canResolveAndGeocode(profile)
    ) {
      this.profileLocationService.ensureAddressHashForGeocoding(profile);
    }
    await this.profileRepo.save(profile);

    if (phone !== undefined) {
      await this.usersRepository.updatePhone(user.id, phone || null);
    }

    // Geocodifica quando: endereço mudou OU usuário legado com endereço mas sem coordenadas
    const shouldGeocode =
      addressChanged ||
      (!profile.hasValidCoordinates &&
        this.profileLocationService.canResolveAndGeocode(profile));

    let warning: string | null = null;
    if (shouldGeocode) {
      warning = await this.profileLocationService.syncProfileCoordinates(user.id);
    }

    return this.getMe(authUserId, warning ? [warning] : undefined);
  }

  async updateCreatorProfile(authUserId: string, dto: UpdateCreatorProfileDto) {
    const user = await this.getUserOrThrow(authUserId);
    if (user.role !== UserRole.CREATOR) {
      throw new ForbiddenException('Apenas criadores podem editar o perfil de criador');
    }

    let creator = await this.creatorProfileRepo.findOne({ where: { userId: user.id } });
    if (!creator) {
      creator = this.creatorProfileRepo.create({ userId: user.id });
      await this.creatorProfileRepo.save(creator);
    }

    Object.assign(creator, dto);
    await this.creatorProfileRepo.save(creator);

    return this.getMe(authUserId);
  }

  async updatePhotoUrl(authUserId: string, photoUrl: string) {
    const user = await this.getUserOrThrow(authUserId);
    const profile = await this.profileRepo.findOne({ where: { userId: user.id } });
    if (!profile) throw new NotFoundException('Perfil não encontrado');

    profile.photoUrl = photoUrl;
    await this.profileRepo.save(profile);

    return this.getMe(authUserId);
  }

  async removePortfolioMedia(authUserId: string, mediaId: string) {
    const user = await this.getUserOrThrow(authUserId);
    await this.portfolioService.removeMedia(user.id, mediaId);
    return this.getMe(authUserId);
  }

  async updateCompanyProfile(authUserId: string, dto: UpdateCompanyProfileDto) {
    const user = await this.getUserOrThrow(authUserId);
    if (user.role !== UserRole.COMPANY) {
      throw new ForbiddenException('Apenas empresas podem editar o perfil de empresa');
    }

    let company = await this.companyProfileRepo.findOne({ where: { userId: user.id } });
    if (!company) {
      company = this.companyProfileRepo.create({ userId: user.id });
      await this.companyProfileRepo.save(company);
    }

    Object.assign(company, dto);
    await this.companyProfileRepo.save(company);

    return this.getMe(authUserId);
  }

  async listMarketplaceCreators(
    authUser: AuthUser,
    query: ListMarketplaceCreatorsDto,
  ) {
    const user = await this.getUserOrThrow(authUser.authUserId);
    if (user.role !== UserRole.COMPANY) {
      throw new ForbiddenException(
        'Apenas empresas podem acessar o marketplace de creators',
      );
    }

    const page = this.parsePositiveInt(query.page, DEFAULT_MARKETPLACE_PAGE);
    const limit = Math.min(
      this.parsePositiveInt(query.limit, DEFAULT_MARKETPLACE_LIMIT),
      MAX_MARKETPLACE_LIMIT,
    );
    const sortBy = this.normalizeSortBy(query.sortBy);
    const minAge = query.minAge;
    const maxAge = query.maxAge;
    if (minAge != null && maxAge != null && minAge > maxAge) {
      throw new BadRequestException('minAge não pode ser maior que maxAge');
    }
    const result = await this.usersRepository.listMarketplaceCreators({
      search: query.search?.trim() || undefined,
      serviceTypeId: query.serviceTypeId,
      sortBy,
      page,
      limit,
      minAge,
      maxAge,
    });

    return {
      items: result.items,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    };
  }

  async getMarketplaceCreatorDetail(authUser: AuthUser, creatorId: string) {
    const user = await this.getUserOrThrow(authUser.authUserId);
    if (user.role !== UserRole.COMPANY) {
      throw new ForbiddenException('Apenas empresas podem acessar detalhes de creators');
    }

    const creator = await this.usersRepository.findMarketplaceCreatorById(creatorId);
    if (!creator) {
      throw new NotFoundException('Creator não encontrado');
    }

    const portfolio = await this.portfolioService.buildPortfolioPayload(creatorId);
    const availabilityRules = await this.availabilityRepository.findByCreatorUserId(creatorId);
    const creatorJobTypes = await this.creatorJobTypesRepository.findByCreator(creatorId);
    const activeRules = availabilityRules.filter(
      (rule) => rule.isActive && rule.startTime && rule.endTime,
    );

    const workingHours = this.getWorkingHours(activeRules);
    const effectiveServiceRadiusKm =
      creator.creatorServiceRadiusKm ??
      (this.configService.get<number>('DEFAULT_CREATOR_SERVICE_RADIUS_KM') ?? 30);
    const distanceKm =
      user.profile?.hasValidCoordinates &&
      creator.creatorHasValidCoordinates &&
      user.profile.latitude != null &&
      user.profile.longitude != null &&
      creator.creatorLatitude != null &&
      creator.creatorLongitude != null
        ? this.distanceService.calculateDistanceKm(
            {
              lat: user.profile.latitude,
              lng: user.profile.longitude,
            },
            {
              lat: creator.creatorLatitude,
              lng: creator.creatorLongitude,
            },
          )
        : null;

    return {
      id: creator.id,
      name: creator.name,
      avatarUrl: creator.avatarUrl,
      coverImageUrl: creator.coverImageUrl,
      rating: creator.rating,
      location: creator.location,
      bio: creator.bio,
      tags: creator.tags,
      niche: creator.niche,
      minPrice: creator.minPrice,
      ageYears: creator.ageYears,
      distance: this.distanceService.buildSummary(distanceKm, effectiveServiceRadiusKm),
      services: creatorJobTypes
        .filter((item) => item.jobType.mode === JobMode.PRESENTIAL)
        .map((item) => {
          const basePriceReais =
            item.basePriceCents != null
              ? item.basePriceCents / 100
              : item.jobType.price;
          return {
            jobTypeId: item.jobTypeId,
            name: item.jobType.name,
            description: item.jobType.description ?? null,
            mode: item.jobType.mode,
            durationMinutes: item.jobType.durationMinutes,
            basePrice: basePriceReais,
            currency: 'BRL',
          };
        }),
      portfolio,
      availability: {
        timezone: 'America/Sao_Paulo',
        workingHours,
        days: [
          AvailabilityDayOfWeek.SUNDAY,
          AvailabilityDayOfWeek.MONDAY,
          AvailabilityDayOfWeek.TUESDAY,
          AvailabilityDayOfWeek.WEDNESDAY,
          AvailabilityDayOfWeek.THURSDAY,
          AvailabilityDayOfWeek.FRIDAY,
          AvailabilityDayOfWeek.SATURDAY,
        ].map((dayOfWeek) => {
          const rule = availabilityRules.find((item) => item.dayOfWeek === dayOfWeek);
          return {
            dayOfWeek,
            isActive: rule?.isActive ?? false,
            startTime: rule?.startTime ?? null,
            endTime: rule?.endTime ?? null,
          };
        }),
      },
    };
  }

  private async getUserOrThrow(authUserId: string): Promise<User> {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado. Complete o cadastro em POST /users/bootstrap');
    }
    return user;
  }

  private async buildPayload(user: User, warnings?: string[]) {
    const portfolio = await this.portfolioService.buildPortfolioPayload(user.id);

    return {
      id: user.id,
      authUserId: user.authUserId,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      profile: user.profile
        ? {
            userId: user.profile.userId,
            name: user.profile.name,
            birthDate: user.profile.birthDate,
            gender: user.profile.gender,
            photoUrl: user.profile.photoUrl,
            rating: user.profile.rating,
            addressStreet: user.profile.addressStreet,
            addressNumber: user.profile.addressNumber,
            addressCity: user.profile.addressCity,
            addressState: user.profile.addressState,
            addressZipCode: user.profile.addressZipCode,
            formattedAddress: user.profile.formattedAddress,
            addressHash: user.profile.addressHash,
            latitude: user.profile.latitude,
            longitude: user.profile.longitude,
            geocodingStatus: user.profile.geocodingStatus,
            geocodedAt: user.profile.geocodedAt,
            hasValidCoordinates: user.profile.hasValidCoordinates,
            bio: user.profile.bio,
            onboardingStep: user.profile.onboardingStep,
            createdAt: user.profile.createdAt,
            updatedAt: user.profile.updatedAt,
          }
        : null,
      creatorProfile: user.creatorProfile
        ? {
            autoAcceptBookings: user.creatorProfile.autoAcceptBookings,
            userId: user.creatorProfile.userId,
            cpf: user.creatorProfile.cpf,
            instagramUsername: user.creatorProfile.instagramUsername,
            tiktokUsername: user.creatorProfile.tiktokUsername,
            referralSource: user.creatorProfile.referralSource,
            portfolioUrl: user.creatorProfile.portfolioUrl,
            serviceRadiusKm: user.creatorProfile.serviceRadiusKm,
            createdAt: user.creatorProfile.createdAt,
            updatedAt: user.creatorProfile.updatedAt,
          }
        : null,
      companyProfile: user.companyProfile
        ? {
            userId: user.companyProfile.userId,
            documentType: user.companyProfile.documentType,
            documentNumber: user.companyProfile.documentNumber,
            companyName: user.companyProfile.companyName,
            jobTitle: user.companyProfile.jobTitle,
            businessNiche: user.companyProfile.businessNiche,
            websiteUrl: user.companyProfile.websiteUrl,
            instagramUsername: user.companyProfile.instagramUsername,
            tiktokUsername: user.companyProfile.tiktokUsername,
            createdAt: user.companyProfile.createdAt,
            updatedAt: user.companyProfile.updatedAt,
          }
        : null,
      portfolio,
      warnings: warnings?.filter(Boolean) ?? [],
    };
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private normalizeSortBy(value?: string): MarketplaceSortBy {
    if (value === 'preco' || value === 'avaliacao') {
      return value;
    }

    return 'relevancia';
  }

  private getWorkingHours(
    rules: Array<{ startTime: string | null; endTime: string | null }>,
  ) {
    if (rules.length === 0) {
      return {
        start: DEFAULT_WORKING_START.slice(0, 5),
        end: DEFAULT_WORKING_END.slice(0, 5),
      };
    }

    let minStart = rules[0]?.startTime ?? DEFAULT_WORKING_START;
    let maxEnd = rules[0]?.endTime ?? DEFAULT_WORKING_END;

    for (const rule of rules) {
      if (rule.startTime && rule.startTime < minStart) {
        minStart = rule.startTime;
      }
      if (rule.endTime && rule.endTime > maxEnd) {
        maxEnd = rule.endTime;
      }
    }

    return {
      start: minStart.slice(0, 5),
      end: maxEnd.slice(0, 5),
    };
  }
}
