import { BadRequestException } from '@nestjs/common';
import type { DashboardRange } from './dto/query-dashboard.dto';

const MAX_CUSTOM_RANGE_DAYS = 366;

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function endOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const diffToMonday = (day + 6) % 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - diffToMonday);
  return startOfDay(monday);
}

// `new Date('2026-08-01')` parses a date-only string as UTC midnight, which
// then reads back as the previous day in any timezone behind UTC. Parse the
// Y-M-D components directly so custom-range boundaries land on the intended
// local calendar day regardless of server timezone.
function parseLocalDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    return new Date(value);
  }
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

export function resolveDateRange(
  range: DashboardRange,
  from?: string,
  to?: string,
): { from: Date; to: Date } {
  const now = new Date();

  switch (range) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now) };
    case 'yesterday': {
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      return { from: startOfDay(yesterday), to: endOfDay(yesterday) };
    }
    case 'week':
      return { from: startOfWeek(now), to: endOfDay(now) };
    case 'month':
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: endOfDay(now),
      };
    case 'custom': {
      if (!from || !to) {
        throw new BadRequestException(
          'from and to are required for a custom range',
        );
      }
      const fromDate = startOfDay(parseLocalDate(from));
      const toDate = endOfDay(parseLocalDate(to));
      if (fromDate > toDate) {
        throw new BadRequestException('from must not be after to');
      }
      const spanDays =
        (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);
      if (spanDays > MAX_CUSTOM_RANGE_DAYS) {
        throw new BadRequestException(
          `Custom range cannot exceed ${MAX_CUSTOM_RANGE_DAYS} days`,
        );
      }
      return { from: fromDate, to: toDate };
    }
  }
}

function formatLocalDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function buildDayBuckets(from: Date, to: Date): string[] {
  const days: string[] = [];
  const cursor = startOfDay(from);
  const end = startOfDay(to);

  while (cursor <= end) {
    days.push(formatLocalDate(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}
