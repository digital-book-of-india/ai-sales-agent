// Shape + defaults for the system_settings row that drives
// CallsService's CALL_FAILURES_THRESHOLD notification (see
// ../calling/telephony/calls.service.ts). Kept separate from
// system-settings.service.ts, same reasoning as lead-scoring.config.ts /
// human-transfer.config.ts.

export const NOTIFICATIONS_SETTINGS_KEY = 'notifications';

export interface NotificationsConfig {
  /** Number of FAILED calling_queue items within one campaign that fires a
   * CALL_FAILURES_THRESHOLD notification to every manager/admin. Fired
   * once, the moment the campaign's failed count first reaches this value
   * — CallsService.finish only checks on the attempt that crosses it, so
   * managers aren't re-notified on every subsequent failure. */
  failedCallsThreshold: number;
}

export const DEFAULT_NOTIFICATIONS_CONFIG: NotificationsConfig = {
  failedCallsThreshold: 5,
};
