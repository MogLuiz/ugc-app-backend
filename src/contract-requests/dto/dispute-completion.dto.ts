import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class DisputeCompletionDto {
  @IsString()
  @IsNotEmpty({ message: 'O motivo da disputa é obrigatório' })
  @MaxLength(2000, { message: 'O motivo da disputa pode ter no máximo 2000 caracteres' })
  reason: string;
}
