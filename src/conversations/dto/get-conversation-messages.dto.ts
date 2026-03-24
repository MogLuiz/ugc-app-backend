import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class GetConversationMessagesDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  /**
   * Reservado para paginação incremental no polling.
   * Não habilitado nesta fase.
   */
  @IsOptional()
  @IsString()
  afterCursor?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
