import { IsOptional, IsUUID } from 'class-validator';

export class QueryLiveCallsDto {
  @IsOptional()
  @IsUUID()
  campaignId?: string;
}
