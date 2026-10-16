import { IsDefined, IsObject } from 'class-validator';

// Every current key (just lead_scoring today) stores an object, not a bare
// scalar/array — IsObject is a cheap sanity check, not full schema
// validation. Each key's owning service (e.g. getLeadScoringConfig) is
// still responsible for defensively merging over its own defaults.
export class UpdateSystemSettingDto {
  @IsDefined()
  @IsObject()
  value: Record<string, unknown>;
}
