import { IsArray, IsIn, IsOptional, Matches } from 'class-validator';

export const CALLING_HOURS_DAYS = [
  'MON',
  'TUE',
  'WED',
  'THU',
  'FRI',
  'SAT',
  'SUN',
] as const;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class CallingHoursDto {
  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'start must be in HH:mm format' })
  start?: string;

  @IsOptional()
  @Matches(TIME_PATTERN, { message: 'end must be in HH:mm format' })
  end?: string;

  @IsOptional()
  @IsArray()
  @IsIn(CALLING_HOURS_DAYS, { each: true })
  days?: (typeof CALLING_HOURS_DAYS)[number][];
}
