import { Controller, Get, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { QueryDashboardDto } from './dto/query-dashboard.dto';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('stats')
  stats(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboardService.stats(user, query);
  }

  @Get('charts')
  charts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.dashboardService.charts(user, query);
  }
}
