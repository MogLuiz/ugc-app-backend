import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RecordLegalAcceptanceDto } from '../../legal/dto/record-legal-acceptance.dto';

export class BootstrapUserDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => RecordLegalAcceptanceDto)
  legalAcceptance?: RecordLegalAcceptanceDto;
}
