import { parseBudgetAmount } from './budget-parser.util';

describe('parseBudgetAmount', () => {
  it('returns null for null/undefined/empty input', () => {
    expect(parseBudgetAmount(null)).toBeNull();
    expect(parseBudgetAmount(undefined)).toBeNull();
    expect(parseBudgetAmount('')).toBeNull();
  });

  it('returns null when the text has no parseable amount', () => {
    expect(parseBudgetAmount('not disclosed')).toBeNull();
    expect(parseBudgetAmount('flexible, depends on scope')).toBeNull();
  });

  it('parses a plain number with currency symbol and commas', () => {
    expect(parseBudgetAmount('₹50,000')).toBe(50000);
    expect(parseBudgetAmount('Rs. 1,20,000')).toBe(120000);
  });

  it('applies the lakh multiplier', () => {
    expect(parseBudgetAmount('around 5 lakh')).toBe(500000);
    expect(parseBudgetAmount('2.5 lakhs')).toBe(250000);
  });

  it('applies the crore multiplier', () => {
    expect(parseBudgetAmount('2 crore')).toBe(20000000);
  });

  it('applies the thousand/k multiplier', () => {
    expect(parseBudgetAmount('50k')).toBe(50000);
    expect(parseBudgetAmount('50 thousand')).toBe(50000);
  });

  it('takes the first number in a range', () => {
    expect(parseBudgetAmount('5-10 lakh')).toBe(500000);
  });
});
