import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateReviewDto {
  @IsInt({ message: 'O rating deve ser um número inteiro' })
  @Min(1, { message: 'O rating mínimo é 1' })
  @Max(5, { message: 'O rating máximo é 5' })
  rating: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'O comentário pode ter no máximo 1000 caracteres' })
  comment?: string;
}
