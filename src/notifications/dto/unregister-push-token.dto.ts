import { IsString, MaxLength } from 'class-validator';

export class UnregisterPushTokenDto {
  @IsString()
  @MaxLength(255)
  token: string;
}
