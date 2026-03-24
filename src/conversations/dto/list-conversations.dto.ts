import { IsOptional, IsUUID } from 'class-validator';

export class ListConversationsDto {
  @IsOptional()
  @IsUUID()
  contractRequestId?: string;
}
