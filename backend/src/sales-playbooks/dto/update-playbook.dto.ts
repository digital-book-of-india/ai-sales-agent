import { IsArray, IsObject, IsOptional, IsString } from 'class-validator';

export class UpdatePlaybookDto {
  @IsOptional()
  @IsString()
  opening?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  discoveryQuestions?: string[];

  // Free-form, admin-authored rule sets — shape intentionally left open so
  // the playbook editor can evolve without a schema/migration each time.
  @IsOptional()
  @IsObject()
  qualificationRules?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  objectionHandling?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  closingRules?: Record<string, unknown>;
}
