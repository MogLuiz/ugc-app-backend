import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ReferralStatus } from '../enums/referral-status.enum';

export class ListReferralsQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsEnum(ReferralStatus)
  status?: ReferralStatus;
}
