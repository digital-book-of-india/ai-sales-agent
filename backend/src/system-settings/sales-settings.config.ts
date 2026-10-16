// Shape + defaults for the system_settings row backing the Settings page's
// "Sales" section (Prompt 20). Lead scoring weights already have their own
// key/file (lead-scoring.config.ts) and the pipeline stage list already has
// its own table (PipelineStage, managed via /pipeline-stages) — the
// Settings page's Sales tab reads/writes both of those directly rather than
// duplicating them here. This key holds the one piece that didn't already
// have a home: follow-up rules.

export const SALES_SETTINGS_KEY = 'sales';

export interface FollowUpRules {
  /** Hours after a NO_ANSWER/BUSY call before a lead is auto-scheduled for a
   * follow-up, when autoScheduleOnNoAnswer is true. */
  autoScheduleOnNoAnswer: boolean;
  defaultDueInHours: number;
  /** How many auto-follow-ups a lead can accumulate from missed calls before
   * the rule stops re-scheduling it (a manual follow-up is never capped). */
  maxAutoFollowUps: number;
}

export interface SalesSettings {
  followUpRules: FollowUpRules;
}

export const DEFAULT_SALES_SETTINGS: SalesSettings = {
  followUpRules: {
    autoScheduleOnNoAnswer: true,
    defaultDueInHours: 24,
    maxAutoFollowUps: 3,
  },
};
