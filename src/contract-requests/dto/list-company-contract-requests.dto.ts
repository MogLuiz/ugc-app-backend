import { IsIn, IsOptional } from 'class-validator';
import { ContractRequestStatus } from '../../common/enums/contract-request-status.enum';

const COMPANY_CAMPAIGN_FILTER_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  ContractRequestStatus.PENDING_PAYMENT,
  ContractRequestStatus.PENDING_ACCEPTANCE,
  ContractRequestStatus.ACCEPTED,
  ContractRequestStatus.REJECTED,
  ContractRequestStatus.CANCELLED,
  ContractRequestStatus.COMPLETED,
  ContractRequestStatus.EXPIRED,
] as const;

export type CompanyCampaignFilterStatus = (typeof COMPANY_CAMPAIGN_FILTER_STATUSES)[number];

export class ListCompanyContractRequestsDto {
  @IsOptional()
  @IsIn(COMPANY_CAMPAIGN_FILTER_STATUSES)
  status?: CompanyCampaignFilterStatus;
}
