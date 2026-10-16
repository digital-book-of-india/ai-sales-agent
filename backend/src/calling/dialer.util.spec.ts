import {
  computeAvailableSlots,
  computeRateBudget,
  isWithinCallingHours,
  selectDialCount,
} from './dialer.util';

describe('isWithinCallingHours', () => {
  it('treats a campaign with no calling hours configured as always open', () => {
    expect(
      isWithinCallingHours(undefined, new Date('2026-08-21T03:00:00')),
    ).toBe(true);
    expect(isWithinCallingHours({}, new Date('2026-08-21T03:00:00'))).toBe(
      true,
    );
  });

  it('is open within a same-day window', () => {
    const hours = { start: '09:00', end: '18:00' };
    expect(isWithinCallingHours(hours, new Date('2026-08-21T10:00:00'))).toBe(
      true,
    );
    expect(isWithinCallingHours(hours, new Date('2026-08-21T08:59:00'))).toBe(
      false,
    );
    expect(isWithinCallingHours(hours, new Date('2026-08-21T18:00:00'))).toBe(
      false,
    );
  });

  it('handles an overnight window that wraps past midnight', () => {
    const hours = { start: '22:00', end: '02:00' };
    expect(isWithinCallingHours(hours, new Date('2026-08-21T23:00:00'))).toBe(
      true,
    );
    expect(isWithinCallingHours(hours, new Date('2026-08-21T01:00:00'))).toBe(
      true,
    );
    expect(isWithinCallingHours(hours, new Date('2026-08-21T12:00:00'))).toBe(
      false,
    );
  });

  it('rejects days not in the configured list', () => {
    // 2026-08-21 is a Friday
    const hours = { days: ['MON', 'TUE', 'WED', 'THU', 'FRI'] };
    expect(isWithinCallingHours(hours, new Date('2026-08-21T10:00:00'))).toBe(
      true,
    );

    const saturdayOnly = { days: ['SAT'] };
    expect(
      isWithinCallingHours(saturdayOnly, new Date('2026-08-21T10:00:00')),
    ).toBe(false);
  });
});

describe('computeAvailableSlots', () => {
  it('caps at the campaign concurrency limit minus active calls', () => {
    expect(computeAvailableSlots(5, 2)).toBe(3);
  });

  it('never goes negative when already at or over the limit', () => {
    expect(computeAvailableSlots(3, 3)).toBe(0);
    expect(computeAvailableSlots(3, 5)).toBe(0);
  });
});

describe('computeRateBudget', () => {
  it('returns the remaining calls-per-minute budget', () => {
    expect(computeRateBudget(10, 4)).toBe(6);
  });

  it('never goes negative once the budget is exhausted', () => {
    expect(computeRateBudget(10, 12)).toBe(0);
  });
});

describe('selectDialCount', () => {
  it('is bound by whichever constraint is tightest', () => {
    expect(selectDialCount(5, 2, 10)).toBe(2);
    expect(selectDialCount(1, 8, 10)).toBe(1);
    expect(selectDialCount(5, 8, 3)).toBe(3);
  });

  it('never returns a negative count', () => {
    expect(selectDialCount(0, 0, 0)).toBe(0);
  });
});
