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
  /**
   * Token do cartão gerado pelo Brick.
   * Obrigatório para cartão/débito; ausente (null) para PIX.
   * Validação de presença feita no service por paymentMethodId.
   */
  @IsString()
  @IsOptional()
  token?: string | null;

  @IsString()
  @IsNotEmpty()
  paymentMethodId: string;

  @IsString()
  @IsOptional()
  issuerId: string | null;

  @IsInt()
  @Min(1)
  @IsOptional()
  installments?: number;

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
