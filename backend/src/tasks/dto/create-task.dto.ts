import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import {
  TaskPriority,
  TaskStatus,
  TaskType,
} from '../../../generated/prisma/enums';

export class CreateTaskDto {
  @IsString()
  @MinLength(1)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsEnum(TaskType)
  type: TaskType;

  // Optional — a SALES_EXECUTIVE always gets assigned their own task
  // (TasksService.create ignores this for that role); a manager/admin may
  // assign one to a specific rep, same posture as CreateDealDto.ownerId.
  @IsOptional()
  @IsUUID()
  assignedToId?: string;

  @IsDateString()
  dueDate: string;

  @IsOptional()
  @IsEnum(TaskPriority)
  priority?: TaskPriority;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  // Lets a task be created directly from a Lead or Deal detail page.
  @IsOptional()
  @IsUUID()
  relatedLeadId?: string;

  @IsOptional()
  @IsUUID()
  relatedDealId?: string;
}
