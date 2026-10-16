import { IsArray, IsEnum, IsOptional, IsString } from 'class-validator';
import { LeadStatus } from '../../../generated/prisma/enums';

export class LeadFiltersDto {
  @IsOptional()
  @IsArray()
  @IsEnum(LeadStatus, { each: true })
  statuses?: LeadStatus[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  sources?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];
}
