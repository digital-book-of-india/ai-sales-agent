import { Controller, Get, Query } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { QueryDashboardDto } from '../dashboard/dto/query-dashboard.dto';

/** Prompt 17 — one aggregation endpoint per Analytics page section, all
 * taking the same range/from/to params as /dashboard/stats and
 * /dashboard/charts. Open to any authenticated role, same as the Dashboard
 * — AnalyticsService scopes each figure to the current user internally. */
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('calls')
  calls(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.analyticsService.calls(user, query);
  }

  @Get('leads')
  leads(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.analyticsService.leads(user, query);
  }

  @Get('sales')
  sales(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.analyticsService.sales(user, query);
  }

  @Get('ai')
  ai(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryDashboardDto,
  ) {
    return this.analyticsService.ai(user, query);
  }
}
