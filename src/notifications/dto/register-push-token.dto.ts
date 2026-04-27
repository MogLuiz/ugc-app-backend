import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class RegisterPushTokenDto {
  @IsString()
  @MaxLength(255)
  token: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  provider?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  deviceName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  platform?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  appVersion?: string;

  @IsOptional()
  @IsBoolean()
  permissionGranted?: boolean;
}
