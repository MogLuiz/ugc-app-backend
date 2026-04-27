import { IsOptional, IsString } from 'class-validator';

export class ListNotificationsDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
