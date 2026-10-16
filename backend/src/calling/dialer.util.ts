export interface CallingHoursConfig {
  start?: string;
  end?: string;
  days?: string[];
}

const DAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Whether `now` falls inside the campaign's configured calling window.
 * An unset start/end means "no time restriction"; an unset/empty days
 * list means "every day". Handles overnight windows (e.g. 22:00-02:00).
 */
export function isWithinCallingHours(
  hours: CallingHoursConfig | null | undefined,
  now: Date,
): boolean {
  if (!hours) return true;

  if (hours.days?.length) {
    const today = DAY_CODES[now.getDay()];
    if (!hours.days.includes(today)) return false;
  }

  if (!hours.start || !hours.end) return true;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const start = toMinutes(hours.start);
  const end = toMinutes(hours.end);

  if (start === end) return true;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  // Overnight window, e.g. 22:00 -> 02:00
  return nowMinutes >= start || nowMinutes < end;
}

/** How many more calls this campaign may have in flight right now. */
export function computeAvailableSlots(
  concurrentCalls: number,
  activeCount: number,
): number {
  return Math.max(0, concurrentCalls - activeCount);
}

/** How much of this campaign's calls-per-minute budget is left. */
export function computeRateBudget(
  callsPerMinute: number,
  usedThisMinute: number,
): number {
  return Math.max(0, callsPerMinute - usedThisMinute);
}

/** How many queued items to dial right now, given every constraint. */
export function selectDialCount(
  availableSlots: number,
  rateBudget: number,
  eligibleCount: number,
): number {
  return Math.max(0, Math.min(availableSlots, rateBudget, eligibleCount));
}

export const RETRYABLE_OUTCOMES = ['NO_ANSWER', 'BUSY'] as const;
