import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

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
}
