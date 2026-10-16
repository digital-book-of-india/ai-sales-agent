import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateMeetingDto {
  @IsUUID()
  leadId: string;

  @IsDateString()
  date: string;

  // "HH:MM" 24-hour, kept as a plain string rather than folded into `date` —
  // see Meeting model comment in schema.prisma.
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'time must be in HH:MM 24-hour format',
  })
  time: string;

  // Optional — a SALES_EXECUTIVE is always scheduled as themselves
  // (MeetingsService.create ignores this for that role); a manager/admin may
  // book a meeting on behalf of a specific rep.
  @IsOptional()
  @IsUUID()
  salespersonId?: string;

  @IsString()
  @MinLength(1)
  meetingType: string;

  @IsOptional()
  @IsString()
  meetingLink?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
