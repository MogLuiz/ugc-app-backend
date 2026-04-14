import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
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
    private readonly dataSource: DataSource,
  ) { }

  async bootstrap(authUserId: string, rawEmail: string, role: UserRole, referralCode?: string, displayName?: string) {
    const email = normalizeEmail(rawEmail || `${authUserId}@unknown`);

    // Step 1: idempotente — retorna usuário existente se já bootstrapado com este authUserId.
    const existingByAuthId = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (existingByAuthId) {
      // referralStatus: 'ok' — usuário já existe; qualquer referral anterior já foi processado.
      return { ...(await this.buildPayload(existingByAuthId)), referralStatus: 'ok' as const };
    }

    // Step 2: recuperação de identidade auth — mesmo email, authUserId diferente.
    // O Supabase garante unicidade de email em identidades ativas, portanto trata-se
    // do mesmo usuário cuja conta Supabase foi deletada e recriada. Apenas revincula
    // o authUserId; não recria profiles, portfolio nem sobrescreve dados de domínio.
    const existingByEmail = await this.usersRepository.findByEmail(email);
    if (existingByEmail) {
      this.logger.warn(
        `bootstrap: re-linking authUserId for existing user ${existingByEmail.id} (email: ${email})`,
      );
      await this.usersRepository.updateAuthUserId(existingByEmail.id, authUserId);
      // IMPORTANTE: usar findByAuthUserIdWithProfiles (não existingByEmail nem findByEmail).
      // findByEmail retorna User sem relações carregadas; buildPayload precisa de profile,
      // creatorProfile/companyProfile para montar o payload completo.
      // Se trocado por findByEmail aqui, o payload retornará profile: null — erro silencioso.
      // O throw abaixo garante que uma regressão fique visível imediatamente.
      const relinked = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
      if (!relinked) throw new Error('User not found after auth re-link');
      // referralStatus: 'ok' — re-link não processa referral; metadata pode ser limpo.
      return { ...(await this.buildPayload(relinked)), referralStatus: 'ok' as const };
    }

    // Step 3: criação atômica — user + profile + role-profile + portfolio em uma transação.
    //
    // Por que transação: garante que todas as entidades 1:1 sejam criadas juntas ou nenhuma.
    // O lock de unique constraint em auth_user_id é mantido até o commit; a request concorrente
    // aguarda e, ao receber unique violation, encontra o usuário já completo via
    // findByAuthUserIdWithProfiles — retornando payload correto sem inconsistência.
    let user: User;
    try {
      user = await this.dataSource.transaction(async (manager) => {
        const profileName = name?.trim() || email.split('@')[0];

        const userEntity = manager.create(User, { authUserId, email, role });
        const savedUser = await manager.save(userEntity);

        await manager.save(manager.create(Profile, { userId: savedUser.id, name: profileName }));

        if (role === UserRole.CREATOR) {
          await manager.save(manager.create(CreatorProfile, { userId: savedUser.id }));
        } else {
          await manager.save(manager.create(CompanyProfile, { userId: savedUser.id }));
        }

        await manager.save(manager.create(Portfolio, { user: { id: savedUser.id } }));

        return savedUser;
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Outra request ganhou a corrida e commitou a transação.
        // findByAuthUserIdWithProfiles retorna o usuário completo com todas as relações.
        const raceFallback = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
        if (!raceFallback) throw err;
        this.logger.warn(`bootstrap: race condition resolved for authUserId ${authUserId}`);
        // referralStatus: 'ok' — a request vencedora processará o referral.
        return { ...(await this.buildPayload(raceFallback)), referralStatus: 'ok' as const };
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
        referralError = true;
        this.logger.error(
          `Unexpected error claiming referral: ${(error as Error).message}`,
          (error as Error).stack,
        );
      }
    }

    const userWithProfiles = await this.usersRepository.findByAuthUserIdWithProfiles(authUserId);
    if (!userWithProfiles) throw new Error('User not found after bootstrap');

    return {
      ...(await this.buildPayload(userWithProfiles)),
      referralStatus: (referralError ? 'error' : 'ok') as 'ok' | 'error',
    };
  }

  private async buildPayload(user: User) {
    let portfolio = await this.portfolioRepo.findOne({
      where: { user: { id: user.id } },
    });

    if (!portfolio) {
      // Fallback para usuários legados que ainda não têm portfolio.
      // Não deve ocorrer para usuários criados após a versão com transação atômica.
      try {
        portfolio = await this.portfolioRepo.save(
          this.portfolioRepo.create({ user: { id: user.id } }),
        );
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        // Corrida: outro processo criou o portfolio entre o findOne e o save.
        const found = await this.portfolioRepo.findOne({ where: { user: { id: user.id } } });
        if (!found) throw err;
        portfolio = found;
      }
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
          rating: user.profile.rating,
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
