// Shape + defaults for the system_settings row that drives
// CallAnalysisService's lead scoring (see
// ../calling/analysis/lead-scoring.util.ts). Kept separate from
// system-settings.service.ts so the analysis module can import just the
// type/defaults without pulling in the generic settings service's deps.

export const LEAD_SCORING_SETTINGS_KEY = 'lead_scoring';

export interface LeadScoringWeights {
  /** Points awarded when the analysis extracted a non-empty requirement. */
  requirementConfirmed: number;
  /** Points awarded when the analysis extracted a non-empty budget. */
  budgetConfirmed: number;
  /** Points awarded when the analysis extracted a non-empty timeline. */
  timelineConfirmed: number;
  /** Points awarded when decisionMaker === 'YES'. */
  decisionMaker: number;
  /** Full points for HIGH intent, scaled down for MEDIUM/LOW (see
   * lead-scoring.util.ts) — 0 for NONE. */
  positiveIntent: number;
  /** Points awarded when the transcript indicates a demo was requested. */
  demoRequested: number;
}

export interface LeadScoringThresholds {
  /** Score at/above which a lead is HOT (default band: 90-100). */
  hot: number;
  /** Score at/above which a lead is WARM (default band: 70-89). */
  warm: number;
  /** Score at/above which a lead is COLD rather than LOW (default: 40-69,
   * below this is LOW). */
  cold: number;
}

export interface LeadScoringConfig {
  weights: LeadScoringWeights;
  thresholds: LeadScoringThresholds;
}

// Sums to 100 — matches the 0-100 scale PROMPT 13 specifies. An admin
// overriding one weight via PATCH /system-settings/lead_scoring is free to
// make the total more or less than 100; computeLeadScore clamps either way.
export const DEFAULT_LEAD_SCORING_CONFIG: LeadScoringConfig = {
  weights: {
    requirementConfirmed: 25,
    budgetConfirmed: 20,
    timelineConfirmed: 20,
    decisionMaker: 15,
    positiveIntent: 10,
    demoRequested: 10,
  },
  thresholds: {
    hot: 90,
    warm: 70,
    cold: 40,
  },
};
