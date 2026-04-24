import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthUser } from '../common/interfaces/auth-user.interface';
import { UserRole } from '../common/enums/user-role.enum';
import { ContractRequestsRepository } from '../contract-requests/contract-requests.repository';
import { UsersRepository } from '../users/users.repository';
import { ContractRequest } from '../contract-requests/entities/contract-request.entity';

@Injectable()
export class CreatorService {
  constructor(
    private readonly contractRequestsRepository: ContractRequestsRepository,
    private readonly usersRepository: UsersRepository,
  ) { }

  async getDashboard(user: AuthUser) {
    const creator = await this.requireCreator(user);
    const aggregates =
      await this.contractRequestsRepository.getCreatorDashboardAggregates(creator.id);

    const ratingRaw = creator.profile?.averageRating;
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

  private getCompanyName(contractRequest: ContractRequest): string {
    const companyUser = contractRequest.companyUser;
    return (
      companyUser?.companyProfile?.companyName ??
      companyUser?.profile?.name ??
      'Empresa'
    );
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
