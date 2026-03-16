import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Profile } from './entities/profile.entity';
import { CreatorProfile } from './entities/creator-profile.entity';
import { CompanyProfile } from './entities/company-profile.entity';
import { UserRole } from '../common/enums/user-role.enum';
import { UsersRepository } from '../users/users.repository';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateCreatorProfileDto } from './dto/update-creator-profile.dto';
import { UpdateCompanyProfileDto } from './dto/update-company-profile.dto';

@Injectable()
export class ProfilesService {
  constructor(
    private usersRepository: UsersRepository,
    @InjectRepository(Profile)
    private profileRepo: Repository<Profile>,
    @InjectRepository(CreatorProfile)
    private creatorProfileRepo: Repository<CreatorProfile>,
    @InjectRepository(CompanyProfile)
    private companyProfileRepo: Repository<CompanyProfile>,
  ) {}

  async getMe(authUserId: string) {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado. Complete o cadastro em POST /users/bootstrap');
    }
    return this.buildPayload(user);
  }

  async updateProfile(authUserId: string, dto: UpdateProfileDto) {
    const user = await this.getUserOrThrow(authUserId);
    const profile = await this.profileRepo.findOne({ where: { userId: user.id } });
    if (!profile) throw new NotFoundException('Perfil não encontrado');

    Object.assign(profile, dto);
    if (dto.birthDate) profile.birthDate = new Date(dto.birthDate);
    await this.profileRepo.save(profile);

    return this.getMe(authUserId);
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

  private async getUserOrThrow(authUserId: string): Promise<User> {
    const user = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!user) {
      throw new NotFoundException('Usuário não encontrado. Complete o cadastro em POST /users/bootstrap');
    }
    return user;
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
