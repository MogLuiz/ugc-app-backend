import { IsEnum } from 'class-validator';
import { LegalTermType } from '../../common/enums/legal-term-type.enum';

export class GetLegalAcceptanceStatusDto {
  @IsEnum(LegalTermType)
  termType: LegalTermType;
}
