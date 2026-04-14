import { IsIn, IsOptional, IsString } from 'class-validator';
import { OpenOfferStatus } from '../../common/enums/open-offer-status.enum';

export class ListCompanyOffersDto {
  @IsOptional()
  @IsIn(Object.values(OpenOfferStatus))
  status?: OpenOfferStatus;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}
