import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CallsService } from './calls.service';
import type {
  CallStatusResult,
  InitiateCallResult,
  RecordingResult,
  TelephonyCallStatus,
  TelephonyProvider,
} from './telephony-provider.interface';

export interface MockTelephonyOptions {
  preRingDelayMs?: [number, number];
  ringDelayMs?: [number, number];
  talkDurationMs?: [number, number];
  connectRate?: number;
  random?: () => number;
}

interface MockCallRecord {
  status: TelephonyCallStatus;
  duration?: number;
}

/**
 * Local stand-in telephony provider — plays the same role the old
 * CallProviderService did, but speaking the real TelephonyProvider
 * interface: initiateCall returns immediately, and the ring -> outcome
 * lifecycle is reported later by calling back into CallsService exactly
 * the way a real webhook would (see CallsService.applyStatusUpdate).
 * Selected via TELEPHONY_PROVIDER=mock (the default), so local dev/tests
 * need no Asterisk/AMI credentials. Swap to AsteriskProvider by changing
 * that one env var — no other file changes.
 */
@Injectable()
export class MockTelephonyProvider implements TelephonyProvider {
  readonly name = 'mock';

  private preRingDelayMs: [number, number] = [200, 500];
  private ringDelayMs: [number, number] = [400, 1200];
  private talkDurationMs: [number, number] = [3000, 15000];
  private connectRate = 0.7;
  private random: () => number = Math.random;
  private readonly calls = new Map<string, MockCallRecord>();

  constructor(private readonly callsService: CallsService) {}

  /** Test hook — overrides simulation timing/odds/RNG. */
  configure(options: MockTelephonyOptions): void {
    if (options.preRingDelayMs) this.preRingDelayMs = options.preRingDelayMs;
    if (options.ringDelayMs) this.ringDelayMs = options.ringDelayMs;
    if (options.talkDurationMs) this.talkDurationMs = options.talkDurationMs;
    if (options.connectRate !== undefined)
      this.connectRate = options.connectRate;
    if (options.random) this.random = options.random;
  }

  private randomBetween([min, max]: [number, number]): number {
    return Math.round(min + this.random() * (max - min));
  }

  private async report(
    providerCallId: string,
    status: TelephonyCallStatus,
    duration?: number,
  ): Promise<void> {
    this.calls.set(providerCallId, { status, duration });
    await this.callsService.applyStatusUpdate(providerCallId, {
      status,
      duration,
    });
  }

  // Takes no arguments — unlike a real provider, the simulation doesn't
  // need the lead/campaign id, callMode, or salesUserId for anything (there
  // is no SIP bridge to route). Still satisfies the TelephonyProvider
  // interface: a function accepting fewer parameters is assignable to one
  // that accepts more.
  initiateCall(): Promise<InitiateCallResult> {
    const providerCallId = `mock-${randomUUID()}`;
    this.calls.set(providerCallId, { status: 'INITIATED' });

    void this.simulate(providerCallId);

    return Promise.resolve({ providerCallId, status: 'INITIATED' });
  }

  private async simulate(providerCallId: string): Promise<void> {
    await sleep(this.randomBetween(this.preRingDelayMs));
    await this.report(providerCallId, 'RINGING');

    await sleep(this.randomBetween(this.ringDelayMs));

    const roll = this.random();
    if (roll > this.connectRate) {
      const midpoint = (1 + this.connectRate) / 2;
      const status: TelephonyCallStatus =
        roll > midpoint ? 'NO_ANSWER' : 'BUSY';
      await this.report(providerCallId, status, 0);
      return;
    }

    await this.report(providerCallId, 'IN_PROGRESS');
    const talkMs = this.randomBetween(this.talkDurationMs);
    await sleep(talkMs);
    await this.report(providerCallId, 'COMPLETED', Math.round(talkMs / 1000));
  }

  async hangupCall(callId: string): Promise<void> {
    await this.report(callId, 'CANCELLED', 0);
  }

  transferCall(): Promise<void> {
    // No-op: nothing meaningful to simulate locally.
    return Promise.resolve();
  }

  getCallStatus(callId: string): Promise<CallStatusResult> {
    const record = this.calls.get(callId);
    return Promise.resolve({
      providerCallId: callId,
      status: record?.status ?? 'FAILED',
      duration: record?.duration,
    });
  }

  // Simulates a provider that has finished processing the recording by the
  // time it's asked — real providers (Exotel included) can lag, which is
  // why RecordingsService retries on a null url instead of assuming one.
  getRecording(callId: string): Promise<RecordingResult> {
    const record = this.calls.get(callId);
    if (!record || record.status !== 'COMPLETED') {
      return Promise.resolve({ url: null });
    }
    return Promise.resolve({
      url: `https://mock-recordings.local/${callId}.mp3`,
    });
  }

  handleWebhook(): never {
    // The mock provider never receives webhooks — it reports status
    // straight to CallsService instead. Kept on the interface for parity;
    // the webhook controller only ever calls this on whichever provider a
    // real webhook actually arrived for.
    throw new Error('MockTelephonyProvider does not accept webhooks');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
