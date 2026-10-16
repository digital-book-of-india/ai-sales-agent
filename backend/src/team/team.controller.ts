import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { TeamService } from './team.service';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';
import { InviteTeamMemberDto } from './dto/invite-team-member.dto';
import { UpdateTeamMemberDto } from './dto/update-team-member.dto';

// Backs the Team page (Prompt 20). SALES_EXECUTIVE never sees this — a
// SALES_MANAGER's own scope (their reports only) and the extra admin-only
// checks (can't touch an ADMIN account, can't manage yourself) live in
// TeamService since @Roles can only express the coarse ADMIN/SALES_MANAGER
// split, not those finer per-target rules.
@Controller('team')
@Roles(Role.ADMIN, Role.SALES_MANAGER)
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.teamService.list(user, query);
  }

  @Post('invite')
  invite(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteTeamMemberDto,
  ) {
    return this.teamService.invite(user, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTeamMemberDto,
  ) {
    return this.teamService.update(user, id, dto);
  }

  @Post(':id/deactivate')
  deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamService.deactivate(user, id);
  }

  @Post(':id/activate')
  activate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teamService.activate(user, id);
  }
}
