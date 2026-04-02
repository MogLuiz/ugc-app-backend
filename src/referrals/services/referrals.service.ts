import {
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../common/interfaces/auth-user.interface';
import { User } from '../../users/entities/user.entity';
import { ContractRequestCompletedEvent } from '../../contract-requests/events/contract-request-completed.event';
import { PartnerProfilesRepository } from '../repositories/partner-profiles.repository';
import { ReferralCodesRepository } from '../repositories/referral-codes.repository';
import { ReferralsRepository } from '../repositories/referrals.repository';
import { CommissionsRepository } from '../repositories/commissions.repository';
import { CommissionsService } from './commissions.service';
import { ReferralCodeGeneratorService } from './referral-code-generator.service';
import { PartnerStatus } from '../enums/partner-status.enum';
import { ReferralStatus } from '../enums/referral-status.enum';
import { ListReferralsQueryDto } from '../dto/list-referrals-query.dto';
import { ListCommissionsQueryDto } from '../dto/list-commissions-query.dto';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly partnerProfilesRepository: PartnerProfilesRepository,
    private readonly referralCodesRepository: ReferralCodesRepository,
    private readonly referralsRepository: ReferralsRepository,
    private readonly commissionsRepository: CommissionsRepository,
    private readonly commissionsService: CommissionsService,
    private readonly referralCodeGeneratorService: ReferralCodeGeneratorService,
  ) {}

  /**
   * Ativação de parceiro por `users.id` — uso interno via POST /internal/partners/:userId/activate.
   */
  async activatePartnerByUserId(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const existing = await this.partnerProfilesRepository.findByUserId(user.id);
    if (existing) {
      const existingCode = await this.referralCodesRepository.findActiveByPartnerUserId(user.id);
      return this.buildActivateResponse(existing, existingCode!.code);
    }

    return this.dataSource.transaction(async (manager) => {
      const partnerProfile = await this.partnerProfilesRepository.createAndSave(
        {
          userId: user.id,
          status: PartnerStatus.ACTIVE,
          commissionRatePercent: 10,
          activatedAt: new Date(),
        },
        manager,
      );

      const code = await this.referralCodeGeneratorService.generateUniqueCode();

      const referralCode = await this.referralCodesRepository.createAndSave(
        {
          partnerUserId: user.id,
          code,
          isActive: true,
        },
        manager,
      );

      this.logger.log(`Partner activated (internal): userId=${user.id}, code=${referralCode.code}`);

      return this.buildActivateResponse(partnerProfile, referralCode.code);
    });
  }

  /**
   * Desativa parceiro (status SUSPENDED + códigos inativos). Uso interno via POST /internal/partners/:userId/deactivate.
   */
  async deactivatePartnerByUserId(userId: string) {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }

    const profile = await this.partnerProfilesRepository.findByUserId(userId);
    if (!profile) {
      throw new NotFoundException('Parceiro não encontrado para este usuário');
    }

    const previousActiveCode = await this.referralCodesRepository.findActiveByPartnerUserId(userId);
    const deactivatedAt = new Date();

    await this.dataSource.transaction(async (manager) => {
      await this.partnerProfilesRepository.updateStatus(userId, PartnerStatus.SUSPENDED, manager);
      await this.referralCodesRepository.deactivateAllForPartnerUserId(userId, manager);
    });

    const codeForResponse = previousActiveCode?.code ?? null;

    return {
      userId,
      partnerStatus: PartnerStatus.SUSPENDED,
      deactivatedAt: deactivatedAt.toISOString(),
      referralCode:
        codeForResponse != null
          ? { code: codeForResponse, isActive: false }
          : null,
    };
  }

  async getMyPartnerProfile(authUser: AuthUser) {
    const user = await this.requireUser(authUser.authUserId);
    const profile = await this.partnerProfilesRepository.findByUserId(user.id);

    if (!profile) {
      throw new NotFoundException('Perfil de parceiro não encontrado');
    }

    const referralCode = await this.referralCodesRepository.findActiveByPartnerUserId(user.id);

    return {
      userId: profile.userId,
      status: profile.status,
      referralCode: referralCode?.code ?? null,
      referralLink: referralCode ? this.buildReferralLink(referralCode.code) : null,
      commissionRatePercent: profile.commissionRatePercent,
      displayName: profile.displayName,
      activatedAt: profile.activatedAt.toISOString(),
    };
  }

  async getMyReferralCode(authUser: AuthUser) {
    const user = await this.requireUser(authUser.authUserId);
    const referralCode = await this.referralCodesRepository.findActiveByPartnerUserId(user.id);

    if (!referralCode) {
      throw new NotFoundException('Código de indicação não encontrado');
    }

    return {
      code: referralCode.code,
      link: this.buildReferralLink(referralCode.code),
      isActive: referralCode.isActive,
      createdAt: referralCode.createdAt.toISOString(),
    };
  }

  async claimReferral(referralCode: string, referredUserId: string): Promise<void> {
    const codeRecord = await this.referralCodesRepository.findByCode(referralCode);

    if (!codeRecord) {
      this.logger.warn(`Referral code not found: ${referralCode}`);
      return;
    }

    if (!codeRecord.isActive) {
      this.logger.warn(`Referral code inactive: ${referralCode}`);
      return;
    }

    const partnerProfile = await this.partnerProfilesRepository.findByUserId(codeRecord.partnerUserId);

    if (!partnerProfile || partnerProfile.status !== PartnerStatus.ACTIVE) {
      this.logger.warn(
        `Partner not active for code: ${referralCode}, partnerStatus: ${partnerProfile?.status ?? 'not_found'}`,
      );
      return;
    }

    if (codeRecord.partnerUserId === referredUserId) {
      this.logger.warn(
        `Self-referral blocked: userId ${referredUserId} tried to use own code ${referralCode}`,
      );
      return;
    }

    const existingReferral = await this.referralsRepository.findByReferredUserId(referredUserId);
    if (existingReferral) {
      this.logger.warn(
        `User ${referredUserId} already has a referral, skipping code: ${referralCode}`,
      );
      return;
    }

    try {
      await this.referralsRepository.createReferral({
        partnerUserId: codeRecord.partnerUserId,
        referredUserId,
        referralCodeId: codeRecord.id,
        status: ReferralStatus.PENDING,
      });
    } catch (err) {
      if ((err as { code?: string })?.code === '23505') {
        // Corrida: outro request criou o referral entre findByReferredUserId e createReferral.
        // A indicação foi registrada — comportamento correto. Não é erro.
        this.logger.warn(
          `Referral claim race condition for userId ${referredUserId}, code ${referralCode}: already claimed concurrently`,
        );
        return;
      }
      throw err;
    }

    this.logger.log(
      `Referral claimed: userId ${referredUserId} via code ${referralCode}, partnerId ${codeRecord.partnerUserId}`,
    );
  }

  async getMyReferrals(authUser: AuthUser, query: ListReferralsQueryDto) {
    const user = await this.requireUser(authUser.authUserId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { items, total } = await this.referralsRepository.listByPartner({
      partnerUserId: user.id,
      status: query.status,
      page,
      limit,
    });

    return { items, total, page, limit };
  }

  async getMyCommissions(authUser: AuthUser, query: ListCommissionsQueryDto) {
    const user = await this.requireUser(authUser.authUserId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { items, total } = await this.commissionsRepository.listByPartner({
      partnerUserId: user.id,
      status: query.status,
      page,
      limit,
    });

    return { items, total, page, limit };
  }

  async getMyDashboard(authUser: AuthUser) {
    const user = await this.requireUser(authUser.authUserId);

    const [referralAggregates, commissionAggregates] = await Promise.all([
      this.referralsRepository.getAggregatesByPartner(user.id),
      this.commissionsRepository.getDashboardAggregates(user.id),
    ]);

    return {
      totalReferrals: referralAggregates.totalReferrals,
      pendingReferrals: referralAggregates.pendingReferrals,
      qualifiedReferrals: referralAggregates.qualifiedReferrals,
      totalCommissionAmountCents: commissionAggregates.totalCommissionAmountCents,
      pendingCommissionAmountCents: commissionAggregates.pendingCommissionAmountCents,
      currency: commissionAggregates.currency,
    };
  }

  async handleContractCompleted(event: ContractRequestCompletedEvent): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const referral = await this.referralsRepository.findPendingByReferredUserIdForUpdate(
        event.creatorUserId,
        manager,
      );

      if (!referral) {
        return;
      }

      const partnerProfile = await this.partnerProfilesRepository.findByUserId(referral.partnerUserId);
      if (!partnerProfile) {
        this.logger.error(
          `Partner profile not found for referral ${referral.id}, skipping commission`,
        );
        return;
      }

      const grossAmountCents = Math.floor(event.creatorBasePrice * 100);
      const commissionAmountCents = Math.floor(
        grossAmountCents * partnerProfile.commissionRatePercent / 100,
      );

      await this.referralsRepository.qualify(referral.id, event.contractRequestId, manager);

      await this.commissionsService.createCommission(
        {
          referralId: referral.id,
          contractRequestId: event.contractRequestId,
          partnerUserId: referral.partnerUserId,
          grossAmountCents,
          commissionRatePercent: partnerProfile.commissionRatePercent,
          commissionAmountCents,
          currency: event.currency,
        },
        manager,
      );

      this.logger.log(
        `Commission created: referralId=${referral.id}, contractRequestId=${event.contractRequestId}, ` +
        `grossAmountCents=${grossAmountCents}, commissionAmountCents=${commissionAmountCents}`,
      );
    });
  }

  private buildActivateResponse(
    profile: { userId: string; status: PartnerStatus; commissionRatePercent: number; activatedAt: Date },
    code: string,
  ) {
    return {
      userId: profile.userId,
      status: profile.status,
      referralCode: code,
      referralLink: this.buildReferralLink(code),
      commissionRatePercent: profile.commissionRatePercent,
      activatedAt: profile.activatedAt.toISOString(),
    };
  }

  private buildReferralLink(code: string): string {
    const appUrl = this.configService.get<string>('APP_URL') ?? 'https://ugclocal.com.br';
    return `${appUrl}/cadastro?ref=${code}`;
  }

  private async requireUser(authUserId: string) {
    const user = await this.userRepo.findOne({ where: { authUserId } });
    if (!user) {
      throw new NotFoundException('Usuário não encontrado');
    }
    return user;
  }
}
