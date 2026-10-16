import { IsUUID } from 'class-validator';

export class QueryCallsDto {
  @IsUUID()
  leadId: string;
}
