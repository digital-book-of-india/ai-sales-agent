import { IsDateString, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateFollowUpDto {
  @IsUUID()
  leadId: string;

  @IsDateString()
  dueAt: string;

  @IsString()
  @MinLength(1)
  reason: string;
}
