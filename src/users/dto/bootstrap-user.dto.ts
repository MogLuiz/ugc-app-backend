import { IsEnum, IsOptional, IsString } from 'class-validator';
import { UserRole } from '../../common/enums/user-role.enum';

export class BootstrapUserDto {
  @IsEnum(UserRole)
  role: UserRole;

  @IsOptional()
  @IsString()
  referralCode?: string;
}
