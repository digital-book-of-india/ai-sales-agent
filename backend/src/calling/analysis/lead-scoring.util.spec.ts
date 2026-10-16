import { computeLeadScore } from './lead-scoring.util';
import {
  CallIntent,
  DecisionMaker,
  LeadScoreCategory,
} from '../../../generated/prisma/enums';
import { DEFAULT_LEAD_SCORING_CONFIG } from '../../system-settings/lead-scoring.config';

describe('computeLeadScore', () => {
  it('scores 100/HOT when every rule is satisfied', () => {
    const result = computeLeadScore(
      {
        requirement: 'CRM for a 20-person sales team',
        budget: 'around 5 lakh',
        timeline: 'next quarter',
        decisionMaker: DecisionMaker.YES,
        intent: CallIntent.HIGH,
        demoRequested: true,
      },
      DEFAULT_LEAD_SCORING_CONFIG,
    );

    expect(result).toEqual({ score: 100, category: LeadScoreCategory.HOT });
  });

  it('scores 0/LOW when nothing was confirmed', () => {
    const result = computeLeadScore(
      {
        requirement: null,
        budget: null,
        timeline: null,
        decisionMaker: DecisionMaker.UNKNOWN,
        intent: CallIntent.NONE,
        demoRequested: false,
      },
      DEFAULT_LEAD_SCORING_CONFIG,
    );

    expect(result).toEqual({ score: 0, category: LeadScoreCategory.LOW });
  });

  it('treats a blank string the same as null (not "confirmed")', () => {
    const result = computeLeadScore(
      {
        requirement: '   ',
        budget: null,
        timeline: null,
        decisionMaker: DecisionMaker.UNKNOWN,
        intent: CallIntent.NONE,
        demoRequested: false,
      },
      DEFAULT_LEAD_SCORING_CONFIG,
    );

    expect(result.score).toBe(0);
  });

  it('scales the intent weight by multiplier rather than gating it', () => {
    const base = {
      requirement: null,
      budget: null,
      timeline: null,
      decisionMaker: DecisionMaker.UNKNOWN,
      demoRequested: false,
    };

    expect(
      computeLeadScore(
        { ...base, intent: CallIntent.MEDIUM },
        DEFAULT_LEAD_SCORING_CONFIG,
      ).score,
    ).toBe(5); // 10 * 0.5
    expect(
      computeLeadScore(
        { ...base, intent: CallIntent.LOW },
        DEFAULT_LEAD_SCORING_CONFIG,
      ).score,
    ).toBe(2); // 10 * 0.2 rounded
  });

  it('falls into WARM/COLD bands between the fixed thresholds', () => {
    // requirement (25) + budget (20) + decisionMaker (15) + half intent (5) = 65 -> COLD
    const cold = computeLeadScore(
      {
        requirement: 'a CRM',
        budget: '5 lakh',
        timeline: null,
        decisionMaker: DecisionMaker.YES,
        intent: CallIntent.MEDIUM,
        demoRequested: false,
      },
      DEFAULT_LEAD_SCORING_CONFIG,
    );
    expect(cold.category).toBe(LeadScoreCategory.COLD);

    // + timeline (20) = 85 -> WARM
    const warm = computeLeadScore(
      {
        requirement: 'a CRM',
        budget: '5 lakh',
        timeline: 'this month',
        decisionMaker: DecisionMaker.YES,
        intent: CallIntent.MEDIUM,
        demoRequested: false,
      },
      DEFAULT_LEAD_SCORING_CONFIG,
    );
    expect(warm.category).toBe(LeadScoreCategory.WARM);
  });

  it('clamps to 0-100 even if a custom config overshoots', () => {
    const overshootConfig = {
      weights: { ...DEFAULT_LEAD_SCORING_CONFIG.weights, decisionMaker: 500 },
      thresholds: DEFAULT_LEAD_SCORING_CONFIG.thresholds,
    };

    const result = computeLeadScore(
      {
        requirement: null,
        budget: null,
        timeline: null,
        decisionMaker: DecisionMaker.YES,
        intent: CallIntent.NONE,
        demoRequested: false,
      },
      overshootConfig,
    );

    expect(result.score).toBe(100);
  });

  it('respects overridden thresholds', () => {
    const config = {
      weights: DEFAULT_LEAD_SCORING_CONFIG.weights,
      thresholds: { hot: 50, warm: 30, cold: 10 },
    };

    const result = computeLeadScore(
      {
        requirement: 'a CRM',
        budget: null,
        timeline: null,
        decisionMaker: DecisionMaker.UNKNOWN,
        intent: CallIntent.NONE,
        demoRequested: false,
      },
      config,
    );

    expect(result).toEqual({ score: 25, category: LeadScoreCategory.COLD });
  });
});
