import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CommissionStatus } from '../enums/commission-status.enum';

export class ListCommissionsQueryDto {
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
  @IsEnum(CommissionStatus)
  status?: CommissionStatus;
}
