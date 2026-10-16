import { ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class BulkAssignDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('4', { each: true })
  leadIds: string[];

  @IsUUID()
  assignedToId: string;
}
