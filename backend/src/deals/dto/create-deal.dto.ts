import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class CreateDealDto {
  @IsUUID()
  leadId: string;

  // Optional — a SALES_EXECUTIVE always owns the deal they create
  // (DealsService.create ignores this for that role); a manager/admin may
  // create one on behalf of a specific rep.
  @IsOptional()
  @IsUUID()
  ownerId?: string;

  @IsInt()
  @Min(0)
  value: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  probability?: number;

  // Defaults to the first stage (lowest `order`) when omitted — see
  // DealsService.create.
  @IsOptional()
  @IsUUID()
  stageId?: string;

  @IsOptional()
  @IsDateString()
  expectedCloseDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
