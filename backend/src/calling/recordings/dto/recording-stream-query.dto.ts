import { IsOptional, IsString } from 'class-validator';

// Deliberately permissive (everything optional/untyped beyond IsString) —
// a missing or malformed field is not a validation error, it's just an
// invalid signed link, and RecordingsService.resolveStream reports that
// uniformly as 401 rather than this DTO throwing its own 400.
export class RecordingStreamQueryDto {
  @IsOptional()
  @IsString()
  exp?: string;

  @IsOptional()
  @IsString()
  disp?: string;

  @IsOptional()
  @IsString()
  sig?: string;
}
