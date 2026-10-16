import {
  CallIntent,
  DecisionMaker,
  LeadScoreCategory,
} from '../../../generated/prisma/enums';
import type { LeadScoringConfig } from '../../system-settings/lead-scoring.config';

export interface LeadScoringInput {
  requirement: string | null;
  budget: string | null;
  timeline: string | null;
  decisionMaker: DecisionMaker;
  intent: CallIntent;
  demoRequested: boolean;
}

export interface LeadScoringResult {
  score: number;
  category: LeadScoreCategory;
}

// Intent isn't a plain yes/no like the other rules, so "positive intent"
// scales the weight rather than gating it on/off — HIGH earns it in full,
// MEDIUM half, LOW a token amount, NONE nothing.
const INTENT_MULTIPLIER: Record<CallIntent, number> = {
  [CallIntent.HIGH]: 1,
  [CallIntent.MEDIUM]: 0.5,
  [CallIntent.LOW]: 0.2,
  [CallIntent.NONE]: 0,
};

function hasValue(value: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function categorize(
  score: number,
  thresholds: LeadScoringConfig['thresholds'],
): LeadScoreCategory {
  if (score >= thresholds.hot) return LeadScoreCategory.HOT;
  if (score >= thresholds.warm) return LeadScoreCategory.WARM;
  if (score >= thresholds.cold) return LeadScoreCategory.COLD;
  return LeadScoreCategory.LOW;
}

/** Pure scoring function — the weighted rules from system_settings
 * (see SystemSettingsService.getLeadScoringConfig) applied to one call's
 * analysis. Clamped to 0-100 regardless of how the configured weights sum,
 * since an admin overriding one weight could push the raw total either
 * side of that range. */
export function computeLeadScore(
  input: LeadScoringInput,
  config: LeadScoringConfig,
): LeadScoringResult {
  const { weights, thresholds } = config;

  const raw =
    (hasValue(input.requirement) ? weights.requirementConfirmed : 0) +
    (hasValue(input.budget) ? weights.budgetConfirmed : 0) +
    (hasValue(input.timeline) ? weights.timelineConfirmed : 0) +
    (input.decisionMaker === DecisionMaker.YES ? weights.decisionMaker : 0) +
    weights.positiveIntent * INTENT_MULTIPLIER[input.intent] +
    (input.demoRequested ? weights.demoRequested : 0);

  const score = Math.max(0, Math.min(100, Math.round(raw)));
  return { score, category: categorize(score, thresholds) };
}
