import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { CreatorProfile } from '../profiles/entities/creator-profile.entity';
import { CompanyProfile } from '../profiles/entities/company-profile.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersRepository } from './users.repository';
import { Portfolio } from '../portfolio/entities/portfolio.entity';
import { PortfolioMedia } from '../portfolio/entities/portfolio-media.entity';
import { ReferralsService } from '../referrals/services/referrals.service';
import { normalizeEmail } from '../common/utils/normalize-email';
import { LegalService } from '../legal/legal.service';
import { RecordLegalAcceptanceDto } from '../legal/dto/record-legal-acceptance.dto';

function isUniqueViolation(err: unknown): boolean {
  return (err as { code?: string })?.code === '23505';
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private usersRepository: UsersRepository,
    @InjectRepository(Profile)
    private profileRepo: Repository<Profile>,
    @InjectRepository(CreatorProfile)
    private creatorProfileRepo: Repository<CreatorProfile>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepo: Repository<CompanyProfile>,
    @InjectRepository(Portfolio)
    private portfolioRepo: Repository<Portfolio>,
    @InjectRepository(PortfolioMedia)
    private portfolioMediaRepo: Repository<PortfolioMedia>,
    private readonly referralsService: ReferralsService,
    private readonly legalService: LegalService,
  ) {}

  async bootstrap(
    authUserId: string,
    rawEmail: string,
    role: UserRole,
    referralCode?: string,
    displayName?: string,
    legalAcceptance?: RecordLegalAcceptanceDto,
    requestContext?: { userAgent?: string | null; ipAddress?: string | null },
  ) {
    const email = normalizeEmail(rawEmail || `${authUserId}@unknown`);

    if (legalAcceptance) {
      this.legalService.validateSignupAcceptance(role, legalAcceptance);
    }

    // Step 1: idempotent — return existing user if already bootstrapped with this authUserId
    const existingByAuthId = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (existingByAuthId) {
      return this.buildPayload(existingByAuthId);
    }

    // Step 2: auth identity recovery — same email, different authUserId.
    // Supabase guarantees email uniqueness across active identities, so this is the same
    // person whose Supabase auth account was deleted and recreated. Restore the auth link only;
    // do NOT recreate profiles, portfolio, or overwrite role/status/domain data.
    const existingByEmail = await this.usersRepository.findByEmail(email);
    if (existingByEmail) {
      this.logger.warn(
        `bootstrap: re-linking authUserId for existing user ${existingByEmail.id} (email: ${email})`,
      );
      await this.usersRepository.updateAuthUserId(existingByEmail.id, authUserId);
      if (legalAcceptance) {
        await this.legalService.recordAcceptance(existingByEmail.id, legalAcceptance, requestContext);
      }
      const relinked = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
      if (!relinked) throw new Error('User not found after auth re-link');
      return this.buildPayload(relinked);
    }

    if (!legalAcceptance) {
      throw new BadRequestException('legalAcceptance é obrigatório para concluir o cadastro');
    }

    // Step 3: create new user, with race-condition fallback on unique violation
    let user: User;
    try {
      user = await this.usersRepository.create({ authUserId, email, role });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Another concurrent request won the race — return the user it created
        const raceFallback = await this.usersRepository.findByEmail(email);
        if (!raceFallback) throw err;
        this.logger.warn(`bootstrap: race condition resolved for email ${email}`);
        return this.buildPayload(raceFallback);
      }
      throw err;
    }

    const normalizedDisplayName = displayName?.trim().replace(/\s+/g, ' ');
    const profileName = normalizedDisplayName || email.split('@')[0];
    const profile = this.profileRepo.create({ userId: user.id, name: profileName });
    await this.profileRepo.save(profile);

    if (role === UserRole.CREATOR) {
      const creator = this.creatorProfileRepo.create({ userId: user.id });
      await this.creatorProfileRepo.save(creator);
    } else {
      const company = this.companyProfileRepo.create({ userId: user.id });
      await this.companyProfileRepo.save(company);
    }

    const portfolio = this.portfolioRepo.create({ user: { id: user.id } });
    try {
      await this.portfolioRepo.save(portfolio);
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      this.logger.warn(`bootstrap: portfolio already exists for user ${user.id}, skipping`);
    }

    if (referralCode) {
      try {
        await this.referralsService.claimReferral(referralCode, user.id);
      } catch (error) {
        this.logger.error(
          `Unexpected error claiming referral: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    if (legalAcceptance) {
      await this.legalService.recordAcceptance(user.id, legalAcceptance, requestContext);
    }

    const userWithProfiles = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!userWithProfiles) throw new Error('User not found after bootstrap');

    return this.buildPayload(userWithProfiles);
  }

  private async buildPayload(user: User) {
    let portfolio = await this.portfolioRepo.findOne({
      where: { user: { id: user.id } },
    });

    if (!portfolio) {
      portfolio = await this.portfolioRepo.save(
        this.portfolioRepo.create({
          user: { id: user.id },
        }),
      );
    }

    const media = await this.portfolioMediaRepo.find({
      where: { portfolioId: portfolio.id },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

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
            rating: user.profile.averageRating,
            addressStreet: user.profile.addressStreet,
            addressNumber: user.profile.addressNumber,
            addressCity: user.profile.addressCity,
            addressState: user.profile.addressState,
            addressZipCode: user.profile.addressZipCode,
            bio: user.profile.bio,
            onboardingStep: user.profile.onboardingStep,
            createdAt: user.profile.createdAt,
            updatedAt: user.profile.updatedAt,
          }
        : null,
      creatorProfile: user.creatorProfile
        ? {
            userId: user.creatorProfile.userId,
            cpf: user.creatorProfile.cpf,
            instagramUsername: user.creatorProfile.instagramUsername,
            tiktokUsername: user.creatorProfile.tiktokUsername,
            referralSource: user.creatorProfile.referralSource,
            portfolioUrl: user.creatorProfile.portfolioUrl,
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
      portfolio: {
        id: portfolio.id,
        userId: user.id,
        media: media.map((item) => ({
          id: item.id,
          type: item.type,
          url: item.publicUrl,
          thumbnailUrl: item.thumbnailUrl,
          sortOrder: item.sortOrder,
          status: item.status,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
        })),
        createdAt: portfolio.createdAt,
        updatedAt: portfolio.updatedAt,
      },
    };
  }
}
