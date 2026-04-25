import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { LegalAcceptanceInputDto } from '../../contract-requests/dto/legal-acceptance-input.dto';

export class SelectOpenOfferCreatorDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => LegalAcceptanceInputDto)
  legalAcceptance?: LegalAcceptanceInputDto;
}
