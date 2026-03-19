import { IsArray, IsUUID } from 'class-validator';

export class ReplaceCreatorJobTypesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  jobTypeIds: string[];
}
