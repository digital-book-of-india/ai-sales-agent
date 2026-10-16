import { extractMeeting } from './meeting-extractor.util';
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

describe('extractMeeting', () => {
  it('returns null when no meeting was requested', () => {
    expect(extractMeeting(baseResult())).toBeNull();
  });

  it('returns null when meetingRequested is true but meetingAt is missing', () => {
    expect(
      extractMeeting(baseResult({ meetingRequested: true, meetingAt: null })),
    ).toBeNull();
  });

  it('returns null when meetingAt is not a parseable date', () => {
    expect(
      extractMeeting(
        baseResult({ meetingRequested: true, meetingAt: 'Tuesday' }),
      ),
    ).toBeNull();
  });

  it('extracts date/time/meetingType when a valid meeting was detected', () => {
    const result = extractMeeting(
      baseResult({
        meetingRequested: true,
        meetingAt: '2026-08-29T15:30:00.000Z',
        meetingType: 'Demo',
      }),
    );

    expect(result).toEqual({
      date: new Date('2026-08-29T15:30:00.000Z'),
      time: `${String(new Date('2026-08-29T15:30:00.000Z').getHours()).padStart(2, '0')}:30`,
      meetingType: 'Demo',
    });
  });

  it('falls back to a generic meetingType when the LLM left it empty', () => {
    const result = extractMeeting(
      baseResult({
        meetingRequested: true,
        meetingAt: '2026-08-29T15:30:00.000Z',
        meetingType: null,
      }),
    );

    expect(result?.meetingType).toBe('CALL');
  });
});
