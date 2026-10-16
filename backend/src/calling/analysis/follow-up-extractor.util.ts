import type { CallAnalysisResult } from './call-analysis.types';

export interface ExtractedFollowUp {
  dueAt: Date;
  reason: string;
}

/**
 * Turns the LLM's callback fields (see RECORD_CALL_ANALYSIS_TOOL in
 * call-analysis-llm.service.ts) into a follow_ups row to create — or null
 * when the transcript held no callback request, or the LLM's callbackAt
 * couldn't be parsed as a date (guards against a malformed LLM response
 * silently becoming a follow-up due at the Unix epoch or "Invalid Date").
 */
export function extractFollowUp(
  result: CallAnalysisResult,
): ExtractedFollowUp | null {
  if (!result.callbackRequested || !result.callbackAt) {
    return null;
  }

  const dueAt = new Date(result.callbackAt);
  if (Number.isNaN(dueAt.getTime())) {
    return null;
  }

  return {
    dueAt,
    reason: result.callbackReason || 'Customer requested a callback',
  };
}
