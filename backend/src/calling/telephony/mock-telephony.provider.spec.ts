import { MockTelephonyProvider } from './mock-telephony.provider';
import { CallsService } from './calls.service';

describe('MockTelephonyProvider', () => {
  let provider: MockTelephonyProvider;
  let callsService: { applyStatusUpdate: jest.Mock };

  beforeEach(() => {
    callsService = {
      applyStatusUpdate: jest.fn().mockResolvedValue(undefined),
    };
    provider = new MockTelephonyProvider(
      callsService as unknown as CallsService,
    );
    provider.configure({
      preRingDelayMs: [1, 2],
      ringDelayMs: [1, 2],
      talkDurationMs: [1, 2],
    });
  });

  it('returns immediately with an INITIATED status and a providerCallId', async () => {
    const result = await provider.initiateCall();

    expect(result.status).toBe('INITIATED');
    expect(result.providerCallId).toMatch(/^mock-/);
  });

  it('reports RINGING then IN_PROGRESS then COMPLETED for a connecting call', async () => {
    provider.configure({ connectRate: 1, random: () => 0 });

    const { providerCallId } = await provider.initiateCall();
    await flushSimulation();

    const statuses = callsService.applyStatusUpdate.mock.calls.map(
      (call) => (call as [string, { status: string }])[1].status,
    );
    expect(statuses).toEqual(['RINGING', 'IN_PROGRESS', 'COMPLETED']);
    expect(callsService.applyStatusUpdate).toHaveBeenCalledWith(
      providerCallId,
      expect.any(Object),
    );
  });

  it('reports RINGING then a NO_ANSWER/BUSY outcome for a non-connecting call', async () => {
    provider.configure({ connectRate: 0, random: () => 1 });

    await provider.initiateCall();
    await flushSimulation();

    const statuses = callsService.applyStatusUpdate.mock.calls.map(
      (call) => (call as [string, { status: string }])[1].status,
    );
    expect(statuses[0]).toBe('RINGING');
    expect(['NO_ANSWER', 'BUSY']).toContain(statuses[1]);
    expect(statuses).toHaveLength(2);
  });

  it('getCallStatus reflects the last reported status', async () => {
    provider.configure({ connectRate: 1, random: () => 0 });
    const { providerCallId } = await provider.initiateCall();
    await flushSimulation();

    const status = await provider.getCallStatus(providerCallId);

    expect(status.status).toBe('COMPLETED');
  });

  it('handleWebhook is not supported for the mock provider', () => {
    expect(() => provider.handleWebhook()).toThrow();
  });

  describe('getRecording', () => {
    it('returns null for a call that has not completed', async () => {
      provider.configure({ connectRate: 0, random: () => 1 });
      const { providerCallId } = await provider.initiateCall();
      await flushSimulation();

      expect(await provider.getRecording(providerCallId)).toEqual({
        url: null,
      });
    });

    it('returns a fake URL once the call has completed', async () => {
      provider.configure({ connectRate: 1, random: () => 0 });
      const { providerCallId } = await provider.initiateCall();
      await flushSimulation();

      const result = await provider.getRecording(providerCallId);
      expect(result.url).toBe(
        `https://mock-recordings.local/${providerCallId}.mp3`,
      );
    });

    it('returns null for an unknown call id', async () => {
      expect(await provider.getRecording('unknown')).toEqual({ url: null });
    });
  });
});

/** Lets the mock's internal setTimeout-driven simulation run to completion. */
function flushSimulation(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 50));
}
