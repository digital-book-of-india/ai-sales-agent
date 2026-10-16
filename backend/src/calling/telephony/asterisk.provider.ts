import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { CallsService } from './calls.service';
import {
  AmiClient,
  type AmiClientOptions,
  type AmiMessage,
  nextActionId,
} from './ami-client';
import type {
  CallMode,
  CallStatusResult,
  InitiateCallResult,
  RecordingResult,
  TelephonyCallStatus,
  TelephonyProvider,
} from './telephony-provider.interface';

// All Asterisk-specific request shapes and status derivation live in this
// file only — nothing outside telephony/ should know what an AMI event or
// Originate response looks like. See infra/asterisk/ for the PBX-side
// config this provider talks to (dialplan contexts referenced below, AMI
// user setup).

interface TrackedCall {
  status: TelephonyCallStatus;
  channel?: string;
  answeredAt?: number;
  duration?: number;
}

/**
 * TelephonyProvider backed by a self-hosted Asterisk PBX (Airtel SIP trunk)
 * controlled over AMI — this codebase's SIP telephony provider ("SIP" being
 * the protocol Asterisk speaks to Airtel and to internal softphones; see
 * infra/asterisk/). Unlike ExotelProvider, there is no inbound webhook: AMI
 * is a persistent event feed, so call-status updates are pushed straight
 * into CallsService as they arrive — the same "report directly, don't wait
 * to be asked" shape MockTelephonyProvider uses, just driven by real AMI
 * events (Newchannel/Newstate/Hangup) instead of a setTimeout simulation.
 *
 * Call correlation: initiateCall generates its own UUID and passes it as
 * `ChannelId` on the Originate action, so Asterisk's own Uniqueid for that
 * channel *is* that UUID — no separate mapping table needed between "our
 * call id" and "Asterisk's call id". Recordings reuse the same UUID as the
 * MixMonitor filename (see infra/asterisk/etc/asterisk/extensions.conf), so
 * getRecording() needs no lookup either.
 *
 * Bridging: the caller (DialerService) decides callMode — this class never
 * looks at Campaign.aiAgentId or Lead.assignedToId itself — and passes it
 * (plus salesUserId for 'MANUAL') into initiateCall. That becomes a
 * BRIDGE_TARGET / TARGET_EXTENSION Originate Variable the dialplan's
 * [outbound-bridge] context reads to route the answered leg (see
 * infra/asterisk/etc/asterisk/extensions.conf).
 */
@Injectable()
export class AsteriskProvider implements TelephonyProvider, OnModuleDestroy {
  readonly name = 'asterisk';
  private readonly logger = new Logger(AsteriskProvider.name);

  private ami: AmiClient | null = null;
  private connecting: Promise<AmiClient> | null = null;
  private readonly calls = new Map<string, TrackedCall>();

  /** Test-only override for AMI client construction (see
   * asterisk.provider.spec.ts) — a plain settable property rather than a
   * constructor parameter so Nest's DI never tries to resolve a provider
   * for it. Same role MockTelephonyProvider.configure() plays for its own
   * class: a way in for a fake without touching the DI-constructed shape
   * everywhere else. Production code never sets this. */
  createAmiClient: (options: AmiClientOptions) => AmiClient = (options) =>
    new AmiClient(options);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly callsService: CallsService,
  ) {}

  onModuleDestroy(): void {
    this.ami?.close();
  }

  private async ensureConnected(): Promise<AmiClient> {
    if (this.ami?.connected) return this.ami;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const client = this.createAmiClient({
        host: this.config.getOrThrow<string>('ASTERISK_AMI_HOST'),
        port: Number(this.config.get<string>('ASTERISK_AMI_PORT') ?? 5038),
        username: this.config.getOrThrow<string>('ASTERISK_AMI_USERNAME'),
        password: this.config.getOrThrow<string>('ASTERISK_AMI_PASSWORD'),
      });
      client.onEvent((msg) => this.handleAmiEvent(msg));
      await client.connect();
      this.ami = client;
      return client;
    })();

    try {
      return await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  async initiateCall(
    leadId: string,
    campaignId: string,
    callMode: CallMode,
    salesUserId?: string,
  ): Promise<InitiateCallResult> {
    const lead = await this.prisma.lead.findUniqueOrThrow({
      where: { id: leadId },
      select: { phone: true },
    });

    // Resolved up front, before Originate: a MANUAL call with no usable
    // extension should fail fast (caller sees the rejection and marks the
    // attempt FAILED) rather than ringing PSTN and only then discovering on
    // answer that there's nowhere to bridge it.
    const variables = [`BRIDGE_TARGET=${callMode === 'AI' ? 'ai' : 'manual'}`];
    if (callMode === 'MANUAL') {
      if (!salesUserId) {
        throw new Error('initiateCall: callMode MANUAL requires a salesUserId');
      }
      const salesUser = await this.prisma.user.findUniqueOrThrow({
        where: { id: salesUserId },
        select: { sipExtension: true },
      });
      if (!salesUser.sipExtension) {
        throw new Error(
          `initiateCall: sales user ${salesUserId} has no registered sipExtension`,
        );
      }
      variables.push(`TARGET_EXTENSION=${salesUser.sipExtension}`);
    }

    const ami = await this.ensureConnected();
    const callUuid = randomUUID();
    const callerId = this.config.getOrThrow<string>('ASTERISK_CALLER_ID');
    const timeoutMs = Number(
      this.config.get<string>('ASTERISK_ORIGINATE_TIMEOUT_MS') ?? 30_000,
    );

    this.calls.set(callUuid, { status: 'INITIATED' });

    try {
      const response = await ami.sendAction({
        Action: 'Originate',
        Channel: `PJSIP/${digitsOnly(lead.phone)}@airtel-trunk`,
        Context: 'outbound-bridge',
        Exten: 's',
        Priority: '1',
        Async: 'true',
        ChannelId: callUuid,
        CallerID: callerId,
        Timeout: String(timeoutMs),
        ActionID: nextActionId('originate'),
        Variable: variables,
      });

      if (response.Response !== 'Success') {
        throw new Error(
          `Originate rejected: ${response.Message ?? 'unknown error'}`,
        );
      }

      return { providerCallId: callUuid, status: 'INITIATED' };
    } catch (error) {
      this.calls.delete(callUuid);
      this.logger.error(
        `initiateCall failed for lead ${leadId} / campaign ${campaignId}: ${
          (error as Error).message
        }`,
      );
      throw error;
    }
  }

  async hangupCall(callId: string): Promise<void> {
    const ami = await this.ensureConnected();
    const channel = this.calls.get(callId)?.channel ?? callId;
    await ami.sendAction({
      Action: 'Hangup',
      Channel: channel,
      ActionID: nextActionId('hangup'),
    });
  }

  async transferCall(callId: string, targetAgentId: string): Promise<void> {
    const ami = await this.ensureConnected();
    const channel = this.calls.get(callId)?.channel ?? callId;
    // Redirects into [transfer-target] in extensions.conf, which Dials the
    // extension named by targetAgentId — assumes agent ids map 1:1 to
    // internal PJSIP extension numbers (see infra/asterisk config).
    await ami.sendAction({
      Action: 'Redirect',
      Channel: channel,
      Context: 'transfer-target',
      Exten: targetAgentId,
      Priority: '1',
      ActionID: nextActionId('redirect'),
    });
  }

  getCallStatus(callId: string): Promise<CallStatusResult> {
    const tracked = this.calls.get(callId);
    return Promise.resolve({
      providerCallId: callId,
      status: tracked?.status ?? 'FAILED',
      duration: tracked?.duration,
    });
  }

  /**
   * Builds an nginx secure_link-signed URL to the recording written by
   * MixMonitor (see infra/asterisk/nginx/recordings-internal.conf) and
   * confirms the file actually exists before returning it — MixMonitor
   * finishes flushing to disk shortly after Hangup, not necessarily
   * instantly, so a HEAD 404 here just means "not ready yet" and the caller
   * (RecordingsService) retries with backoff, same as a real Exotel lag.
   */
  async getRecording(callId: string): Promise<RecordingResult> {
    const baseUrl = this.config.getOrThrow<string>(
      'ASTERISK_RECORDINGS_BASE_URL',
    );
    const secret = this.config.getOrThrow<string>('ASTERISK_RECORDINGS_SECRET');
    const ttlSeconds = Number(
      this.config.get<string>('ASTERISK_RECORDINGS_TTL_SECONDS') ?? 600,
    );

    const url = buildSecureLinkUrl(
      baseUrl,
      `${callId}.wav`,
      secret,
      ttlSeconds,
    );

    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (!response.ok) return { url: null };
      return { url };
    } catch (error) {
      this.logger.warn(
        `Recording existence check failed for ${callId}: ${(error as Error).message}`,
      );
      return { url: null };
    }
  }

  /** AMI has no HTTP webhook — status is pushed via handleAmiEvent below as
   * events arrive, not pulled by a controller. Kept on the interface for
   * parity with TelephonyProvider (same as MockTelephonyProvider). */
  handleWebhook(): never {
    throw new Error(
      'AsteriskProvider does not accept webhooks (uses AMI events)',
    );
  }

  private handleAmiEvent(msg: AmiMessage): void {
    const uniqueId = msg.Uniqueid;
    if (!uniqueId || !this.calls.has(uniqueId)) return;

    switch (msg.Event) {
      case 'Newchannel': {
        const tracked = this.calls.get(uniqueId)!;
        tracked.channel = msg.Channel;
        return;
      }

      case 'Newstate': {
        if (msg.ChannelStateDesc === 'Ringing') {
          this.report(uniqueId, 'RINGING');
        } else if (msg.ChannelStateDesc === 'Up') {
          const tracked = this.calls.get(uniqueId)!;
          tracked.answeredAt = Date.now();
          this.report(uniqueId, 'IN_PROGRESS');
        }
        return;
      }

      case 'Hangup': {
        const tracked = this.calls.get(uniqueId)!;
        const status = finalStatusFromHangup(tracked, msg);
        const duration = tracked.answeredAt
          ? Math.round((Date.now() - tracked.answeredAt) / 1000)
          : 0;
        this.report(uniqueId, status, duration);
        this.calls.delete(uniqueId);
        return;
      }

      default:
        return;
    }
  }

  private report(
    providerCallId: string,
    status: TelephonyCallStatus,
    duration?: number,
  ): void {
    const tracked = this.calls.get(providerCallId);
    if (tracked) {
      tracked.status = status;
      if (duration !== undefined) tracked.duration = duration;
    }
    void this.callsService
      .applyStatusUpdate(providerCallId, { status, duration })
      .catch((error: Error) =>
        this.logger.error(
          `applyStatusUpdate failed for ${providerCallId}: ${error.message}`,
        ),
      );
  }
}

/** Airtel/PJSIP dial strings want a bare number, not the lead's stored
 * "+91XXXXXXXXXX" formatting. */
function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

// Cause codes: 17 = User busy, 18/19 = No user responding/no answer.
// Anything else that hangs up before Up is treated as FAILED rather than
// guessed at — Asterisk's Cause set is much larger than these two, and a
// wrong guess (e.g. reporting COMPLETED for a failed attempt) is worse for
// retry logic than a generic FAILED. Verify against real test call Hangup
// events for this specific Airtel trunk and refine if needed.
function finalStatusFromHangup(
  tracked: TrackedCall,
  msg: AmiMessage,
): TelephonyCallStatus {
  if (tracked.answeredAt) return 'COMPLETED';
  if (msg.Cause === '17') return 'BUSY';
  if (msg.Cause === '18' || msg.Cause === '19') return 'NO_ANSWER';
  return 'FAILED';
}

/** nginx secure_link_md5 URL signing — https://nginx.org/en/docs/http/ngx_http_secure_link_module.html.
 * Must match secure_link_md5 "$secure_link_expires$uri secret"; exactly
 * (see infra/asterisk/nginx/recordings-internal.conf). nginx's "modified"
 * base64 replaces the URL-unsafe characters and drops padding. */
function buildSecureLinkUrl(
  baseUrl: string,
  filename: string,
  secret: string,
  ttlSeconds: number,
): string {
  const expires = Math.floor(Date.now() / 1000) + ttlSeconds;
  const path = `/recordings/${filename}`;
  const hash = createHash('md5')
    .update(`${expires}${path} ${secret}`)
    .digest('base64');
  const md5 = hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${baseUrl}${path}?md5=${md5}&expires=${expires}`;
}
