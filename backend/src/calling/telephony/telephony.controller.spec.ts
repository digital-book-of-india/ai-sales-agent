import { Test } from '@nestjs/testing';
import { TelephonyController } from './telephony.controller';
import { CallsService } from './calls.service';
import { TELEPHONY_PROVIDER } from './telephony-provider.token';

describe('TelephonyController', () => {
  let controller: TelephonyController;
  let provider: { handleWebhook: jest.Mock };
  let callsService: { applyStatusUpdate: jest.Mock };

  beforeEach(async () => {
    provider = { handleWebhook: jest.fn() };
    callsService = {
      applyStatusUpdate: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [TelephonyController],
      providers: [
        { provide: TELEPHONY_PROVIDER, useValue: provider },
        { provide: CallsService, useValue: callsService },
      ],
    }).compile();

    controller = moduleRef.get(TelephonyController);
  });

  it('delegates signature verification/parsing to the provider, then applies the normalized event', async () => {
    const payload = { CallSid: 'CA1', Status: 'completed' };
    provider.handleWebhook.mockReturnValue({
      providerCallId: 'CA1',
      status: 'COMPLETED',
      duration: 12,
      recordingUrl: 'https://example.com/rec.mp3',
    });

    const result = await controller.webhook(
      payload,
      undefined,
      'shared-secret',
    );

    expect(provider.handleWebhook).toHaveBeenCalledWith(
      payload,
      'shared-secret',
    );
    expect(callsService.applyStatusUpdate).toHaveBeenCalledWith('CA1', {
      status: 'COMPLETED',
      duration: 12,
      recordingUrl: 'https://example.com/rec.mp3',
    });
    expect(result).toEqual({ received: true });
  });

  it('prefers the header signature over the query token when both are present', async () => {
    provider.handleWebhook.mockReturnValue({
      providerCallId: 'CA1',
      status: 'RINGING',
    });

    await controller.webhook({}, 'header-sig', 'query-token');

    expect(provider.handleWebhook).toHaveBeenCalledWith({}, 'header-sig');
  });

  it('propagates a rejection from the provider (e.g. bad signature) without touching CallsService', async () => {
    provider.handleWebhook.mockImplementation(() => {
      throw new Error('Invalid webhook signature');
    });

    await expect(controller.webhook({}, undefined, 'bad')).rejects.toThrow(
      'Invalid webhook signature',
    );
    expect(callsService.applyStatusUpdate).not.toHaveBeenCalled();
  });
});
