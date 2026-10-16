import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { Role } from '../../../generated/prisma/enums';

export class InviteTeamMemberDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  // Set by the inviting admin/manager directly (shared with the new hire
  // out of band) — same minimum as ResetPasswordDto.newPassword. The
  // invited user can log in with this immediately, no separate
  // set-password step.
  @IsString()
  @MinLength(8)
  password: string;

  // Defaults to SALES_EXECUTIVE (see TeamService.invite) when omitted.
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
