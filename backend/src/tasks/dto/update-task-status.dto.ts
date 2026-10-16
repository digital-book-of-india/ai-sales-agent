import { IsEnum } from 'class-validator';
import { TaskStatus } from '../../../generated/prisma/enums';

// Backs the Task Board's drag-and-drop — moving a card to a different
// column. Kept separate from UpdateTaskDto so a status move can be applied
// independently of editing title/description/etc, same posture as
// MoveDealDto for the Pipeline board.
export class UpdateTaskStatusDto {
  @IsEnum(TaskStatus)
  status: TaskStatus;
}
