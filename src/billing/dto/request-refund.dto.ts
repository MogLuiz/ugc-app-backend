import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class RequestRefundDto {
  @IsInt()
  @Min(1)
  amountCents: number;

  @IsOptional()
  @IsString()
  reason?: string;
}
