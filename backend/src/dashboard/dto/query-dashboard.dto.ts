import { IsIn, IsISO8601, ValidateIf } from 'class-validator';

export const DASHBOARD_RANGES = [
  'today',
  'yesterday',
  'week',
  'month',
  'custom',
] as const;

export type DashboardRange = (typeof DASHBOARD_RANGES)[number];

export class QueryDashboardDto {
  @IsIn(DASHBOARD_RANGES)
  range: DashboardRange = 'today';

  @ValidateIf((dto: QueryDashboardDto) => dto.range === 'custom')
  @IsISO8601()
  from?: string;

  @ValidateIf((dto: QueryDashboardDto) => dto.range === 'custom')
  @IsISO8601()
  to?: string;
}
