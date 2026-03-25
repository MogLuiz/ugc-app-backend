import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import { ContractRequestStatus } from '../common/enums/contract-request-status.enum';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { UsersRepository } from '../users/users.repository';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';

@Injectable()
export class CreatorService {
  constructor(
    private readonly contractRequestsRepository: ContractRequestsRepository,
    private readonly usersRepository: UsersRepository,
  ) {}

  async getDashboard(user: AuthUser) {
    const creator = await this.requireCreator(user);
    const aggregates =
      await this.contractRequestsRepository.getCreatorDashboardAggregates(creator.id);

    const ratingRaw = creator.profile?.rating;
    const averageRating =
      ratingRaw != null && Number(ratingRaw) > 0 ? Number(ratingRaw) : null;

    return {
      confirmedCampaigns: aggregates.confirmedCampaigns,
      pendingInvites: aggregates.pendingInvites,
      /** MVP temporário: soma de total_price em contratos ACCEPTED (não reflete “mês” nem pagamento real). */
      monthlyEarnings: aggregates.earningsSumAccepted,
      averageRating,
    };
  }

  async listInvites(user: AuthUser) {
    const creator = await this.requireCreator(user);
    const items = await this.contractRequestsRepository.listPendingByCreator(creator.id);
    return items
      .filter((row) => !this.isPendingInviteExpired(row))
      .map((row) => this.mapInviteRow(row));
  }

  async listUpcomingCampaigns(user: AuthUser) {
    const creator = await this.requireCreator(user);
    /** Gravações a partir do instante atual (evita listar horários já passados no mesmo dia). */
    const fromInclusive = new Date();
    const rows =
      await this.contractRequestsRepository.listAcceptedUpcomingForCreator(
        creator.id,
        fromInclusive,
      );
    return rows.map((row) => this.mapUpcomingRow(row));
  }

  /**
   * MVP: retorna apenas linhas de contrato recentes; o cliente monta a timeline.
   */
  async getActivitySource(user: AuthUser) {
    const creator = await this.requireCreator(user);
    const rows = await this.contractRequestsRepository.listRecentForCreatorActivity(
      creator.id,
      20,
    );
    return {
      contracts: rows.map((row) => this.mapActivityContractRow(row)),
    };
  }

  /** Alinhado à regra de `listMyCreatorPending` (ofertas expiradas somem da inbox). */
  private isPendingInviteExpired(contractRequest: ContractRequest): boolean {
    if (contractRequest.status !== ContractRequestStatus.PENDING_ACCEPTANCE) {
      return false;
    }
    const createdAt = contractRequest.createdAt ?? new Date();
    const expiresAt = new Date(createdAt.getTime() + 48 * 60 * 60 * 1000);
    return new Date() >= expiresAt;
  }

  private mapInviteRow(contractRequest: ContractRequest) {
    const companyName = this.getCompanyName(contractRequest);
    const campaignTitle =
      contractRequest.jobType?.name?.trim() || 'Campanha';

    return {
      id: contractRequest.id,
      companyName,
      campaignTitle,
      proposedDate: contractRequest.startsAt.toISOString(),
      payment: contractRequest.totalPrice,
      status: 'PENDING' as const,
    };
  }

  private mapUpcomingRow(contractRequest: ContractRequest) {
    const companyName = this.getCompanyName(contractRequest);
    const campaignName =
      contractRequest.jobType?.name?.trim() || 'Campanha';
    const { city, state } = this.extractCityState(
      contractRequest.jobFormattedAddress,
      contractRequest.jobAddress,
    );
    const location =
      city && state ? `${city}, ${state}` : city || state || contractRequest.jobAddress;

    return {
      id: contractRequest.id,
      campaignName,
      companyName,
      date: contractRequest.startsAt.toISOString(),
      time: contractRequest.startsAt.toISOString(),
      location,
      duration: contractRequest.durationMinutes,
      status: this.mapUpcomingUiStatus(contractRequest),
    };
  }

  private mapActivityContractRow(contractRequest: ContractRequest) {
    return {
      contractRequestId: contractRequest.id,
      status: contractRequest.status,
      updatedAt: contractRequest.updatedAt.toISOString(),
      createdAt: contractRequest.createdAt.toISOString(),
      companyName: this.getCompanyName(contractRequest),
      campaignTitle: contractRequest.jobType?.name?.trim() || 'Campanha',
      totalPrice: contractRequest.totalPrice,
      startsAt: contractRequest.startsAt.toISOString(),
    };
  }

  private mapUpcomingUiStatus(
    contractRequest: ContractRequest,
  ): 'Confirmada' | 'Pendente' | 'Concluída' {
    if (contractRequest.status === ContractRequestStatus.COMPLETED) {
      return 'Concluída';
    }

    const endsAt = new Date(
      contractRequest.startsAt.getTime() +
        contractRequest.durationMinutes * 60 * 1000,
    );
    const now = new Date();

    if (contractRequest.status === ContractRequestStatus.ACCEPTED) {
      if (now > endsAt) {
        return 'Pendente';
      }
      return 'Confirmada';
    }

    return 'Pendente';
  }

  private getCompanyName(contractRequest: ContractRequest): string {
    const companyUser = contractRequest.companyUser;
    return (
      companyUser?.companyProfile?.companyName ??
      companyUser?.profile?.name ??
      'Empresa'
    );
  }

  private extractCityState(
    formattedAddress: string | null,
    fallbackAddress: string,
  ): { city: string | null; state: string | null } {
    const source = (formattedAddress || fallbackAddress || '').trim();
    if (!source) {
      return { city: null, state: null };
    }

    const parts = source
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    if (!parts.length) {
      return { city: null, state: null };
    }

    let state: string | null = null;
    let city: string | null = null;

    for (let i = parts.length - 1; i >= 0; i -= 1) {
      const token = parts[i];
      const upperToken = token.toUpperCase();
      if (/^[A-Z]{2}$/.test(upperToken)) {
        state = upperToken;
        city = i > 0 ? parts[i - 1] : null;
        break;
      }
    }

    if (!city) {
      city = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    }

    if (!state) {
      const lastToken = parts[parts.length - 1];
      const stateMatch = lastToken.match(/\b([A-Z]{2})\b/);
      state = stateMatch ? stateMatch[1] : null;
    }

    return { city: city || null, state };
  }

  private async requireCreator(user: AuthUser) {
    const found = await this.usersRepository.findByAuthUserIdWithProfiles(
      user.authUserId,
    );
    if (!found) {
      throw new UnauthorizedException();
    }
    if (found.role !== UserRole.CREATOR) {
      throw new ForbiddenException('Apenas creators podem acessar este recurso');
    }
    return found;
  }
}
