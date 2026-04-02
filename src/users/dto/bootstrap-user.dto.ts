import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';

export class BootstrapUserDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;
}
