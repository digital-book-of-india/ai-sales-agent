import type {
  CallIntent,
  CallSentiment,
  DecisionMaker,
} from '../../../generated/prisma/enums';

export interface AnalysisTranscriptMessage {
  speaker: 'AI' | 'CUSTOMER';
  text: string;
}

export interface QualityScoreBreakdown {
  opening: number;
  discovery: number;
  productKnowledge: number;
  objectionHandling: number;
  closing: number;
  naturalness: number;
  total: number;
}

export interface AnalysisObjection {
  objection: string;
  response: string;
}

/** What the LLM extracts from one call's transcript — everything
 * CallAnalysisService needs to save the call_analyses row, score the lead,
 * and update the Lead record. Structurally identical to the CallAnalysis
 * Prisma model's own fields, kept as a separate type since this is what
 * crosses the LLM tool-call boundary (plain strings/enums-as-strings, no
 * Prisma-generated types). */
export interface CallAnalysisResult {
  summary: string;
  requirement: string | null;
  budget: string | null;
  timeline: string | null;
  decisionMaker: DecisionMaker;
  intent: CallIntent;
  sentiment: CallSentiment;
  demoRequested: boolean;
  objections: AnalysisObjection[];
  // Questions the customer asked, phrased generically (see
  // CallAnalysisLlmService's prompt) so the same underlying question across
  // calls maps onto identical text — lets AnalyticsService's "most common
  // customer questions" figure group these with plain SQL, no NLP needed.
  customerQuestions: string[];
  nextAction: string | null;
  qualityScore: QualityScoreBreakdown;
  coachingFeedback: string;
  // Whether the customer asked for a callback at a specific later time (e.g.
  // "call me Friday") and, if so, when and why — see follow-up-extractor.util.ts,
  // which turns these into a follow_ups row (Prompt 14). callbackAt is an
  // ISO 8601 datetime string the LLM resolved relative to the call's own
  // date (see AnalyzeTranscriptInput.callDate below), not a raw quote like
  // "Friday" — null/false when no specific callback was requested.
  callbackRequested: boolean;
  callbackAt: string | null;
  callbackReason: string | null;
  // Whether the transcript shows a meeting/demo actually being scheduled for
  // a specific time (not just "let's set up a demo sometime") — see
  // meeting-extractor.util.ts, which turns these into a meetings row
  // (Prompt 15). meetingAt is an ISO 8601 datetime string the LLM resolved
  // relative to the call's own date, same convention as callbackAt.
  meetingRequested: boolean;
  meetingAt: string | null;
  meetingType: string | null;
}
