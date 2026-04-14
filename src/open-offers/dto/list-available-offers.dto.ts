import { IsOptional, IsString } from 'class-validator';

export class ListAvailableOffersDto {
  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
