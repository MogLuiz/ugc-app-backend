import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class ContractRequestInputDto {
  @IsUUID()
  creatorId: string;

  @IsUUID()
  jobTypeId: string;

  @IsString()
  @IsNotEmpty()
  description: string;

  @IsDateString()
  startsAt: string;

  @IsInt()
  @Min(1)
  durationMinutes: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  jobAddress: string;

  @IsBoolean({ message: 'É necessário informar o aceite dos termos.' })
  termsAccepted: boolean;
}
