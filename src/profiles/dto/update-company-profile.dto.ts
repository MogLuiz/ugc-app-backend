import { IsOptional, IsEnum, IsString, MaxLength } from 'class-validator';
import { DocumentType } from '../../common/enums/document-type.enum';

export class UpdateCompanyProfileDto {
  @IsOptional()
  @IsEnum(DocumentType)
  documentType?: DocumentType;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  documentNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  companyName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  businessNiche?: string;
}
