import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ApproveRefundDto {
  @IsOptional()
  @IsString()
  adminNote?: string;
}

export class RejectRefundDto {
  @IsNotEmpty()
  @IsString()
  adminNote: string;
}

export class MarkRefundPaidDto {
  @IsNotEmpty()
  @IsString()
  processedBy: string;

  @IsOptional()
  @IsString()
  adminNote?: string;
}
