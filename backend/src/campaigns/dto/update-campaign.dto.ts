import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { LeadFiltersDto } from './lead-filters.dto';
import { CallingHoursDto } from './calling-hours.dto';

export class UpdateCampaignDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  objective?: string;

  @IsOptional()
  @IsUUID()
  aiAgentId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => LeadFiltersDto)
  leadFilters?: LeadFiltersDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => CallingHoursDto)
  callingHours?: CallingHoursDto;

  @IsOptional()
  @IsInt()
  @Min(1)
  maxAttempts?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  retryInterval?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  concurrentCalls?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  callsPerMinute?: number;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  recordingConsent?: boolean;
}
