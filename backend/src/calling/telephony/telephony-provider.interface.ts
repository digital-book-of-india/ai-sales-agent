/**
 * Provider-agnostic telephony contract. The dialer and CRM logic depend
 * only on this interface (injected via the TELEPHONY_PROVIDER token, see
 * telephony-provider.token.ts) — never on a concrete provider class — so a
 * new provider is a drop-in: implement this interface, register it in
 * calling.module.ts, done. No other file should contain provider-specific
 * logic (request shapes, auth, status-string mappings, signature schemes).
 */

// Who/what the answered call gets bridged to. The caller (DialerService)
// decides this — a provider never infers it from campaign/lead lookups
// itself — so the same value it computes also lands on Call.callMode via
// CallsService.createCall. Mirrors the Prisma CallMode enum; kept as a
// plain string union here so this interface has zero dependency on
// generated Prisma types.
export type CallMode = 'AI' | 'MANUAL';

// Normalized across providers. A provider's own status vocabulary (e.g.
// AsteriskProvider deriving a status from AMI Hangup Cause codes) is
// mapped to this set inside that provider's own file only.
export type TelephonyCallStatus =
  | 'INITIATED'
  | 'RINGING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'NO_ANSWER'
  | 'BUSY'
  | 'CANCELLED';

export interface InitiateCallResult {
  providerCallId: string;
  status: TelephonyCallStatus;
}

export interface CallStatusResult {
  providerCallId: string;
  status: TelephonyCallStatus;
  duration?: number;
}

export interface RecordingResult {
  url: string | null;
}

/** Normalized event produced by handleWebhook, ready for CallsService. */
export interface TelephonyWebhookEvent {
  providerCallId: string;
  status: TelephonyCallStatus;
  duration?: number;
  recordingUrl?: string;
}

export interface TelephonyProvider {
  /** Name this provider registers under (matches Call.provider). */
  readonly name: string;

  /** Starts a call to the given lead on behalf of the campaign. Returns as
   * soon as the provider accepts the request — ringing/connected/ended are
   * reported later via handleWebhook, not by this call blocking.
   *
   * callMode decides what the answered leg gets bridged to: 'AI' bridges to
   * the AI voice pipeline, 'MANUAL' bridges to salesUserId's registered
   * extension/softphone. salesUserId is required (the provider rejects the
   * call) when callMode is 'MANUAL', ignored otherwise. */
  initiateCall(
    leadId: string,
    campaignId: string,
    callMode: CallMode,
    salesUserId?: string,
  ): Promise<InitiateCallResult>;

  /** Ends an in-progress call. */
  hangupCall(callId: string): Promise<void>;

  /** Transfers an in-progress call to another agent. */
  transferCall(callId: string, targetAgentId: string): Promise<void>;

  /** Polls the provider directly for a call's current status (fallback for
   * when a webhook is missed/delayed). */
  getCallStatus(callId: string): Promise<CallStatusResult>;

  /** Fetches the recording URL for a completed call, if any. */
  getRecording(callId: string): Promise<RecordingResult>;

  /** Verifies the provider's webhook signature and normalizes the payload.
   * Throws UnauthorizedException if the signature doesn't check out. */
  handleWebhook(
    payload: unknown,
    signature: string | undefined,
  ): TelephonyWebhookEvent;
}
