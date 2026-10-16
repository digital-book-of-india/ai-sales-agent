import { extractFollowUp } from './follow-up-extractor.util';
import type { CallAnalysisResult } from './call-analysis.types';
import {
  CallIntent,
  CallSentiment,
  DecisionMaker,
} from '../../../generated/prisma/enums';

const QUALITY_SCORE = {
  opening: 0,
  discovery: 0,
  productKnowledge: 0,
  objectionHandling: 0,
  closing: 0,
  naturalness: 0,
  total: 0,
};

function baseResult(
  overrides: Partial<CallAnalysisResult> = {},
): CallAnalysisResult {
  return {
    summary: 'Short call.',
    requirement: null,
    budget: null,
    timeline: null,
    decisionMaker: DecisionMaker.UNKNOWN,
    intent: CallIntent.NONE,
    sentiment: CallSentiment.NEUTRAL,
    demoRequested: false,
    objections: [],
    customerQuestions: [],
    nextAction: null,
    qualityScore: QUALITY_SCORE,
    coachingFeedback: '',
    callbackRequested: false,
    callbackAt: null,
    callbackReason: null,
    meetingRequested: false,
    meetingAt: null,
    meetingType: null,
    ...overrides,
  };
}

describe('extractFollowUp', () => {
  it('returns null when no callback was requested', () => {
    expect(extractFollowUp(baseResult())).toBeNull();
  });

  it('returns null when callbackRequested is true but callbackAt is missing', () => {
    expect(
      extractFollowUp(
        baseResult({ callbackRequested: true, callbackAt: null }),
      ),
    ).toBeNull();
  });

  it('returns null when callbackAt is not a parseable date', () => {
    expect(
      extractFollowUp(
        baseResult({ callbackRequested: true, callbackAt: 'Friday' }),
      ),
    ).toBeNull();
  });

  it('extracts dueAt/reason when a valid callback was detected', () => {
    const result = extractFollowUp(
      baseResult({
        callbackRequested: true,
        callbackAt: '2026-08-28T10:00:00.000Z',
        callbackReason: 'Wants to confirm budget with her manager',
      }),
    );

    expect(result).toEqual({
      dueAt: new Date('2026-08-28T10:00:00.000Z'),
      reason: 'Wants to confirm budget with her manager',
    });
  });

  it('falls back to a generic reason when the LLM left it empty', () => {
    const result = extractFollowUp(
      baseResult({
        callbackRequested: true,
        callbackAt: '2026-08-28T10:00:00.000Z',
        callbackReason: null,
      }),
    );

    expect(result?.reason).toBe('Customer requested a callback');
  });
});
