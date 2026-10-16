export type LeadScoreCategory = 'HOT' | 'WARM' | 'COLD' | 'LOW'

// Mirrors the fixed display bands the backend documents for Lead.leadScore
// (see backend/src/calling/analysis/lead-scoring.util.ts) — the weighted
// rules that produce the score itself are admin-configurable, but these
// bands are the spec's own fixed categorization, so the badge can derive
// its color straight from the score without a round-trip to the backend.
export function getLeadScoreCategory(score: number): LeadScoreCategory {
  if (score >= 90) return 'HOT'
  if (score >= 70) return 'WARM'
  if (score >= 40) return 'COLD'
  return 'LOW'
}
