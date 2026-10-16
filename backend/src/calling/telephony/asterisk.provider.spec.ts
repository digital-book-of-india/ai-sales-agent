import type { ConfigService } from '@nestjs/config';
import { AsteriskProvider } from './asterisk.provider';
import type { PrismaService } from '../../prisma/prisma.service';
import type { CallsService } from './calls.service';
import type { AmiMessage } from './ami-client';

/** Fake AmiClient — implements just the surface AsteriskProvider calls,
 * driven manually from tests via emitEvent() instead of real AMI wire
 * traffic (same role FakeSocket plays for ami-client.spec.ts, one layer
 * up). */
class FakeAmi {
  connected = true;
  sent: AmiMessage[] = [];
  private handlers: Array<(msg: AmiMessage) => void> = [];
  /** Queue of responses sendAction() resolves with, in call order — tests
   * push exactly what they want each Action to appear to return. */
  private responses: AmiMessage[] = [];

  connect(): Promise<void> {
    return Promise.resolve();
  }

  onEvent(handler: (msg: AmiMessage) => void): void {
    this.handlers.push(handler);
  }

  sendAction(fields: Record<string, unknown>): Promise<AmiMessage> {
    this.sent.push(fields as AmiMessage);
    const next = this.responses.shift();
    return Promise.resolve(next ?? { Response: 'Success' });
  }

  close(): void {}

  queueResponse(msg: AmiMessage): void {
    this.responses.push(msg);
  }

  emitEvent(msg: AmiMessage): void {
    for (const handler of this.handlers) handler(msg);
  }
}

describe('AsteriskProvider', () => {
  let provider: AsteriskProvider;
  let ami: FakeAmi;
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let prisma: {
    lead: { findUniqueOrThrow: jest.Mock };
    user: { findUniqueOrThrow: jest.Mock };
  };
  let callsService: { applyStatusUpdate: jest.Mock };

  const ENV: Record<string, string> = {
    ASTERISK_AMI_HOST: '127.0.0.1',
    ASTERISK_AMI_PORT: '5038',
    ASTERISK_AMI_USERNAME: 'backend',
    ASTERISK_AMI_PASSWORD: 'secret',
    ASTERISK_CALLER_ID: '08012345678',
    ASTERISK_RECORDINGS_BASE_URL: 'http://127.0.0.1:8088',
    ASTERISK_RECORDINGS_SECRET: 'rec-secret',
  };

  beforeEach(() => {
    config = {
      get: jest.fn((key: string) => ENV[key]),
      getOrThrow: jest.fn((key: string) => {
        const value = ENV[key];
        if (!value) throw new Error(`Missing ${key}`);
        return value;
      }),
    };
    prisma = {
      lead: { findUniqueOrThrow: jest.fn() },
      user: { findUniqueOrThrow: jest.fn() },
    };
    callsService = {
      applyStatusUpdate: jest.fn().mockResolvedValue(undefined),
    };

    provider = new AsteriskProvider(
      config as unknown as ConfigService,
      prisma as unknown as PrismaService,
      callsService as unknown as CallsService,
    );
    ami = new FakeAmi();
    provider.createAmiClient = () =>
      ami as unknown as import('./ami-client').AmiClient;
  });

  describe('initiateCall', () => {
    it('originates via AMI with ChannelId set and returns that id as providerCallId', async () => {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({
        phone: '+919999999999',
      });

      const result = await provider.initiateCall('lead-1', 'campaign-1', 'AI');

      expect(result.status).toBe('INITIATED');
      expect(result.providerCallId).toMatch(
        /^[0-9a-f-]{36}$/, // crypto.randomUUID() shape
      );
      const sent = ami.sent[0];
      expect(sent.Action).toBe('Originate');
      expect(sent.Channel).toBe('PJSIP/919999999999@airtel-trunk');
      expect(sent.Context).toBe('outbound-bridge');
      expect(sent.ChannelId).toBe(result.providerCallId);
      expect(sent.Variable).toEqual(['BRIDGE_TARGET=ai']);
      expect(prisma.user.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("resolves the sales user's sipExtension and sets BRIDGE_TARGET=manual for a MANUAL call", async () => {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({
        phone: '+919999999999',
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({
        sipExtension: '1002',
      });

      await provider.initiateCall('lead-1', 'campaign-1', 'MANUAL', 'user-9');

      expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith({
        where: { id: 'user-9' },
        select: { sipExtension: true },
      });
      expect(ami.sent[0].Variable).toEqual([
        'BRIDGE_TARGET=manual',
        'TARGET_EXTENSION=1002',
      ]);
    });

    it('rejects a MANUAL call with no salesUserId, before ever touching AMI', async () => {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({
        phone: '+919999999999',
      });

      await expect(
        provider.initiateCall('lead-1', 'campaign-1', 'MANUAL'),
      ).rejects.toThrow('callMode MANUAL requires a salesUserId');
      expect(ami.sent).toHaveLength(0);
    });

    it('rejects a MANUAL call for a sales user with no registered sipExtension', async () => {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({
        phone: '+919999999999',
      });
      prisma.user.findUniqueOrThrow.mockResolvedValue({ sipExtension: null });

      await expect(
        provider.initiateCall('lead-1', 'campaign-1', 'MANUAL', 'user-9'),
      ).rejects.toThrow('no registered sipExtension');
      expect(ami.sent).toHaveLength(0);
    });

    it('throws when Asterisk rejects the Originate action', async () => {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({
        phone: '+919999999999',
      });
      ami.queueResponse({ Response: 'Error', Message: 'No such channel' });

      await expect(
        provider.initiateCall('lead-1', 'campaign-1', 'AI'),
      ).rejects.toThrow('No such channel');
    });
  });

  describe('AMI event -> CallsService push', () => {
    async function initiate(): Promise<string> {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({
        phone: '+919999999999',
      });
      const { providerCallId } = await provider.initiateCall(
        'lead-1',
        'campaign-1',
        'AI',
      );
      return providerCallId;
    }

    it('reports RINGING on a Newstate/Ringing event', async () => {
      const callId = await initiate();

      ami.emitEvent({
        Event: 'Newstate',
        Uniqueid: callId,
        ChannelStateDesc: 'Ringing',
      });

      expect(callsService.applyStatusUpdate).toHaveBeenCalledWith(callId, {
        status: 'RINGING',
        duration: undefined,
      });
    });

    it('reports IN_PROGRESS on answer, then COMPLETED with a computed duration on hangup', async () => {
      jest.useFakeTimers().setSystemTime(1_000_000);
      const callId = await initiate();

      ami.emitEvent({
        Event: 'Newstate',
        Uniqueid: callId,
        ChannelStateDesc: 'Up',
      });
      expect(callsService.applyStatusUpdate).toHaveBeenCalledWith(callId, {
        status: 'IN_PROGRESS',
        duration: undefined,
      });

      jest.setSystemTime(1_000_000 + 12_000);
      ami.emitEvent({ Event: 'Hangup', Uniqueid: callId, Cause: '16' });

      expect(callsService.applyStatusUpdate).toHaveBeenLastCalledWith(callId, {
        status: 'COMPLETED',
        duration: 12,
      });
      jest.useRealTimers();
    });

    it('reports BUSY when hangup happens before answer with cause 17', async () => {
      const callId = await initiate();

      ami.emitEvent({ Event: 'Hangup', Uniqueid: callId, Cause: '17' });

      expect(callsService.applyStatusUpdate).toHaveBeenCalledWith(callId, {
        status: 'BUSY',
        duration: 0,
      });
    });

    it('reports NO_ANSWER for cause 19 before answer', async () => {
      const callId = await initiate();

      ami.emitEvent({ Event: 'Hangup', Uniqueid: callId, Cause: '19' });

      expect(callsService.applyStatusUpdate).toHaveBeenCalledWith(callId, {
        status: 'NO_ANSWER',
        duration: 0,
      });
    });

    it('ignores events for unrelated Uniqueids', async () => {
      await initiate();

      ami.emitEvent({
        Event: 'Newstate',
        Uniqueid: 'some-other-call',
        ChannelStateDesc: 'Up',
      });

      expect(callsService.applyStatusUpdate).not.toHaveBeenCalled();
    });
  });

  describe('hangupCall / transferCall', () => {
    it('hangs up using the channel name learned from Newchannel, falling back to the call id', async () => {
      prisma.lead.findUniqueOrThrow.mockResolvedValue({
        phone: '+919999999999',
      });
      const { providerCallId } = await provider.initiateCall(
        'lead-1',
        'campaign-1',
        'AI',
      );
      ami.emitEvent({
        Event: 'Newchannel',
        Uniqueid: providerCallId,
        Channel: 'PJSIP/919999999999-00000001',
      });
      ami.sent = [];

      await provider.hangupCall(providerCallId);

      expect(ami.sent[0]).toMatchObject({
        Action: 'Hangup',
        Channel: 'PJSIP/919999999999-00000001',
      });
    });

    it('falls back to the raw call id as Channel when no Newchannel event was seen yet', async () => {
      await provider.hangupCall('unknown-call-id');

      expect(ami.sent[0]).toMatchObject({
        Action: 'Hangup',
        Channel: 'unknown-call-id',
      });
    });

    it('redirects into transfer-target with the target agent id as Exten', async () => {
      await provider.transferCall('call-1', 'agent-42');

      expect(ami.sent[0]).toMatchObject({
        Action: 'Redirect',
        Channel: 'call-1',
        Context: 'transfer-target',
        Exten: 'agent-42',
      });
    });
  });

  describe('getRecording', () => {
    const realFetch = global.fetch;
    afterEach(() => {
      global.fetch = realFetch;
    });

    it('returns a signed URL when the recording file exists', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      const result = await provider.getRecording('call-1');

      expect(result.url).toMatch(
        /^http:\/\/127\.0\.0\.1:8088\/recordings\/call-1\.wav\?md5=[\w-]+&expires=\d+$/,
      );
    });

    it('returns null when the recording file is not there yet', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      const result = await provider.getRecording('call-1');

      expect(result).toEqual({ url: null });
    });
  });

  describe('handleWebhook', () => {
    it('throws — Asterisk pushes status via AMI events, not a webhook', () => {
      expect(() => provider.handleWebhook()).toThrow();
    });
  });
});
