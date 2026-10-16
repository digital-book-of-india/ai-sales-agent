// Shape + defaults for the system_settings row backing the Settings page's
// "Calling" section (Prompt 20). Org-wide defaults only — an individual
// Campaign already carries its own maxAttempts/retryInterval/concurrentCalls/
// callingHours (see the Campaign model in schema.prisma), which is what
// DialerService actually reads at dial time. Nothing here overrides a
// running campaign; it's surfaced so an admin has one place to see/tune what
// new campaigns should default to, plus the couple of settings (provider,
// callerId, recording default) that aren't per-campaign fields at all.

export const CALLING_SETTINGS_KEY = 'calling';

export interface CallingSettings {
  /** Which TelephonyProvider handles outbound calls — matches Call.provider
   * values ("asterisk" in production, "mock" in dev/test). */
  provider: string;
  /** Caller ID (E.164) presented to the person being called. */
  callerId: string;
  /** Default for Campaign.recordingConsent on newly created campaigns. */
  recordingEnabled: boolean;
  /** "HH:mm", 24-hour — default calling window a new campaign is created
   * with (Campaign.callingHours). */
  callingHoursStart: string;
  callingHoursEnd: string;
  /** Default Campaign.maxAttempts. */
  maxRetries: number;
  /** Default Campaign.retryInterval, in minutes. */
  retryIntervalMinutes: number;
  /** Default Campaign.concurrentCalls. */
  concurrentCalls: number;
}

export const DEFAULT_CALLING_SETTINGS: CallingSettings = {
  provider: 'asterisk',
  callerId: '',
  recordingEnabled: true,
  callingHoursStart: '09:00',
  callingHoursEnd: '19:00',
  maxRetries: 3,
  retryIntervalMinutes: 60,
  concurrentCalls: 1,
};
