import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { Profile } from '../profiles/entities/profile.entity';
import { CreatorProfile } from '../profiles/entities/creator-profile.entity';
import { CompanyProfile } from '../profiles/entities/company-profile.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersRepository } from './users.repository';

@Injectable()
export class UsersService {
  constructor(
    private usersRepository: UsersRepository,
    @InjectRepository(Profile)
    private profileRepo: Repository<Profile>,
    @InjectRepository(CreatorProfile)
    private creatorProfileRepo: Repository<CreatorProfile>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepo: Repository<CompanyProfile>,
  ) {}

  async bootstrap(authUserId: string, email: string, role: UserRole) {
    const existing = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (existing) {
      return this.buildPayload(existing);
    }

    const user = await this.usersRepository.create({
      authUserId,
      email: email || `${authUserId}@unknown`,
      role,
    });

    const profileName = email?.split('@')[0] || 'Usuário';
    const profile = this.profileRepo.create({
      userId: user.id,
      name: profileName,
    });
    await this.profileRepo.save(profile);

    if (role === UserRole.CREATOR) {
      const creator = this.creatorProfileRepo.create({ userId: user.id });
      await this.creatorProfileRepo.save(creator);
    } else {
      const company = this.companyProfileRepo.create({ userId: user.id });
      await this.companyProfileRepo.save(company);
    }

    const userWithProfiles = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!userWithProfiles) throw new Error('User not found after bootstrap');

    return this.buildPayload(userWithProfiles);
  }

  private buildPayload(user: User) {
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
            createdAt: user.companyProfile.createdAt,
            updatedAt: user.companyProfile.updatedAt,
          }
        : null,
    };
  }
}
