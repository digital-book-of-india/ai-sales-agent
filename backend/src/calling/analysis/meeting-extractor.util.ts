import type { CallAnalysisResult } from './call-analysis.types';

export interface ExtractedMeeting {
  date: Date;
  time: string;
  meetingType: string;
}

/**
 * Turns the LLM's meeting fields (see RECORD_CALL_ANALYSIS_TOOL in
 * call-analysis-llm.service.ts) into a meetings row to create — or null when
 * the transcript held no concrete meeting request, or the LLM's meetingAt
 * couldn't be parsed as a date (same "don't create garbage from a malformed
 * LLM response" guard as extractFollowUp).
 */
export function extractMeeting(
  result: CallAnalysisResult,
): ExtractedMeeting | null {
  if (!result.meetingRequested || !result.meetingAt) {
    return null;
  }

  const at = new Date(result.meetingAt);
  if (Number.isNaN(at.getTime())) {
    return null;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: at,
    time: `${pad(at.getHours())}:${pad(at.getMinutes())}`,
    meetingType: result.meetingType || 'CALL',
  };
}
