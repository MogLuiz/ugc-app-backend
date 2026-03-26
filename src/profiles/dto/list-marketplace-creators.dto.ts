import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

const MARKETPLACE_SORT_OPTIONS = ['relevancia', 'preco', 'avaliacao'] as const;

export type MarketplaceSortBy = (typeof MARKETPLACE_SORT_OPTIONS)[number];

export class ListMarketplaceCreatorsDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsUUID()
  serviceTypeId?: string;

  @IsOptional()
  @IsString()
  @IsIn(MARKETPLACE_SORT_OPTIONS)
  sortBy?: MarketplaceSortBy;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  minAge?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(120)
  maxAge?: number;
}
