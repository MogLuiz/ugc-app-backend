import { IsEnum, IsOptional } from 'class-validator';
import { ContractRequestStatus } from '../../common/enums/contract-request-status.enum';

export class ListCompanyContractRequestsDto {
  @IsOptional()
  @IsEnum(ContractRequestStatus)
  status?: ContractRequestStatus;
}
