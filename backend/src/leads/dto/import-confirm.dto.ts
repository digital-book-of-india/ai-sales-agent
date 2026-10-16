import { IsBoolean, IsObject, IsOptional, IsUUID } from 'class-validator';

export class ImportConfirmDto {
  @IsUUID()
  importId: string;

  /** Maps each source column header to a target lead field name (or omits it). */
  @IsObject()
  mapping: Record<string, string>;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
