import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RejectContractRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  rejectionReason?: string;
}
