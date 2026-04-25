import { IsBoolean, IsEnum, IsString, MaxLength } from 'class-validator';
import { LegalTermType } from '../../common/enums/legal-term-type.enum';

export class RecordLegalAcceptanceDto {
  @IsEnum(LegalTermType)
  termType: LegalTermType;

  @IsString()
  @MaxLength(50)
  termVersion: string;

  @IsBoolean({ message: 'É necessário confirmar o aceite do termo.' })
  accepted: boolean;
}
