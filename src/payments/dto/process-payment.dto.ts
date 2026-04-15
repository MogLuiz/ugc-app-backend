import {
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

class PayerDocumentDto {
  @IsString()
  @IsNotEmpty()
  type: string;

  @IsString()
  @IsNotEmpty()
  number: string;
}

export class ProcessPaymentDto {
  /** Token do cartão gerado pelo Brick */
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsString()
  @IsOptional()
  issuerId: string | null;

  @IsInt()
  @Min(1)
  installments: number;

  @IsNumber()
  @Min(0.01)
  transactionAmount: number;

  @IsString()
  @IsNotEmpty()
  payerEmail: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => PayerDocumentDto)
  payerDocument: PayerDocumentDto | null;
}
