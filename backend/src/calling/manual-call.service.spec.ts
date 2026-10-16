import { Test } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { ManualCallService, MANUAL_CAMPAIGN_NAME } from './manual-call.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallingQueueService } from './calling-queue.service';
import { CallLockService } from './call-lock.service';
import { CallingGateway } from './calling.gateway';
import { CallsService } from './telephony/calls.service';
import { TELEPHONY_PROVIDER } from './telephony/telephony-provider.token';
import { CampaignStatus } from '../../generated/prisma/enums';
import type { AuthenticatedUser } from '../auth/types/auth.types';
import { Role } from '../../generated/prisma/enums';

describe('ManualCallService', () => {
  let service: ManualCallService;
  let prisma: {
    lead: { findUnique: jest.Mock };
    user: { findUnique: jest.Mock };
    campaign: { findFirst: jest.Mock; create: jest.Mock };
  };
  let callingQueue: { getOrCreateItem: jest.Mock; markDialing: jest.Mock };
  let lock: { acquire: jest.Mock; release: jest.Mock };
  let provider: { name: string; initiateCall: jest.Mock };
  let callsService: {
    createCall: jest.Mock;
    attachProviderCallId: jest.Mock;
    markInitiateFailure: jest.Mock;
  };
  let gateway: { emitEvent: jest.Mock };

  const caller: AuthenticatedUser = {
    id: 'exec-1',
    email: 'exec@example.com',
    role: Role.SALES_EXECUTIVE,
  };

  beforeEach(async () => {
    prisma = {
      lead: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      campaign: { findFirst: jest.fn(), create: jest.fn() },
    };
    callingQueue = { getOrCreateItem: jest.fn(), markDialing: jest.fn() };
    lock = { acquire: jest.fn(), release: jest.fn() };
    provider = { name: 'mock', initiateCall: jest.fn() };
    callsService = {
      createCall: jest.fn(),
      attachProviderCallId: jest.fn(),
      markInitiateFailure: jest.fn(),
    };
    gateway = { emitEvent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ManualCallService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallingQueueService, useValue: callingQueue },
        { provide: CallLockService, useValue: lock },
        { provide: TELEPHONY_PROVIDER, useValue: provider },
        { provide: CallsService, useValue: callsService },
        { provide: CallingGateway, useValue: gateway },
      ],
    }).compile();

    service = moduleRef.get(ManualCallService);
  });

  it('throws NotFoundException when the lead does not exist', async () => {
    prisma.lead.findUnique.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue({ sipExtension: '1001' });

    await expect(service.initiateCall(caller, 'lead-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(lock.acquire).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the caller has no SIP extension registered', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    prisma.user.findUnique.mockResolvedValue({ sipExtension: null });

    await expect(service.initiateCall(caller, 'lead-1')).rejects.toThrow(
      ConflictException,
    );
    expect(lock.acquire).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the lead is already being called elsewhere', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    prisma.user.findUnique.mockResolvedValue({ sipExtension: '1001' });
    prisma.campaign.findFirst.mockResolvedValue({ id: 'manual-campaign-1' });
    callingQueue.getOrCreateItem.mockResolvedValue({ id: 'queue-1' });
    lock.acquire.mockResolvedValue(null);

    await expect(service.initiateCall(caller, 'lead-1')).rejects.toThrow(
      ConflictException,
    );
    expect(callsService.createCall).not.toHaveBeenCalled();
  });

  it('reuses an existing "Manual Calls" campaign instead of creating a new one', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    prisma.user.findUnique.mockResolvedValue({ sipExtension: '1001' });
    prisma.campaign.findFirst.mockResolvedValue({ id: 'manual-campaign-1' });
    callingQueue.getOrCreateItem.mockResolvedValue({ id: 'queue-1' });
    lock.acquire.mockResolvedValue('token-1');
    callsService.createCall.mockResolvedValue({ id: 'call-1' });
    callingQueue.markDialing.mockResolvedValue({
      id: 'queue-1',
      attempts: 1,
      lead: { name: 'Asha Verma' },
      campaign: { name: MANUAL_CAMPAIGN_NAME },
    });
    provider.initiateCall.mockResolvedValue({
      providerCallId: 'ext-call-1',
      status: 'INITIATED',
    });

    await service.initiateCall(caller, 'lead-1');

    expect(prisma.campaign.create).not.toHaveBeenCalled();
    expect(callingQueue.getOrCreateItem).toHaveBeenCalledWith(
      'manual-campaign-1',
      'lead-1',
    );
  });

  it('creates the "Manual Calls" campaign the first time it is needed', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    prisma.user.findUnique.mockResolvedValue({ sipExtension: '1001' });
    prisma.campaign.findFirst.mockResolvedValue(null);
    prisma.campaign.create.mockResolvedValue({ id: 'manual-campaign-new' });
    callingQueue.getOrCreateItem.mockResolvedValue({ id: 'queue-1' });
    lock.acquire.mockResolvedValue('token-1');
    callsService.createCall.mockResolvedValue({ id: 'call-1' });
    callingQueue.markDialing.mockResolvedValue({
      id: 'queue-1',
      attempts: 1,
      lead: { name: 'Asha Verma' },
      campaign: { name: MANUAL_CAMPAIGN_NAME },
    });
    provider.initiateCall.mockResolvedValue({
      providerCallId: 'ext-call-1',
      status: 'INITIATED',
    });

    await service.initiateCall(caller, 'lead-1');

    expect(prisma.campaign.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: MANUAL_CAMPAIGN_NAME,
          status: CampaignStatus.DRAFT,
        }) as unknown,
      }),
    );
    expect(callingQueue.getOrCreateItem).toHaveBeenCalledWith(
      'manual-campaign-new',
      'lead-1',
    );
  });

  it('creates the call as callMode MANUAL with the caller as salesUserId, marks dialing, and hands off to the provider', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    prisma.user.findUnique.mockResolvedValue({ sipExtension: '1001' });
    prisma.campaign.findFirst.mockResolvedValue({ id: 'manual-campaign-1' });
    callingQueue.getOrCreateItem.mockResolvedValue({ id: 'queue-1' });
    lock.acquire.mockResolvedValue('token-1');
    callsService.createCall.mockResolvedValue({ id: 'call-1' });
    callingQueue.markDialing.mockResolvedValue({
      id: 'queue-1',
      attempts: 1,
      lead: { name: 'Asha Verma' },
      campaign: { name: MANUAL_CAMPAIGN_NAME },
    });
    provider.initiateCall.mockResolvedValue({
      providerCallId: 'ext-call-1',
      status: 'INITIATED',
    });

    const result = await service.initiateCall(caller, 'lead-1');

    expect(callsService.createCall).toHaveBeenCalledWith({
      leadId: 'lead-1',
      campaignId: 'manual-campaign-1',
      queueItemId: 'queue-1',
      provider: 'mock',
      lockToken: 'token-1',
      callMode: 'MANUAL',
      salesUserId: 'exec-1',
    });
    expect(callingQueue.markDialing).toHaveBeenCalledWith('queue-1', 'call-1');
    const events = gateway.emitEvent.mock.calls.map(
      (call) => (call as [string])[0],
    );
    expect(events).toEqual(['call.created', 'call.dialing']);
    expect(provider.initiateCall).toHaveBeenCalledWith(
      'lead-1',
      'manual-campaign-1',
      'MANUAL',
      'exec-1',
    );
    expect(callsService.attachProviderCallId).toHaveBeenCalledWith(
      'call-1',
      'ext-call-1',
    );
    expect(result).toEqual({
      callId: 'call-1',
      queueItemId: 'queue-1',
      campaignId: 'manual-campaign-1',
    });
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('records a failed attempt via CallsService when initiateCall throws, without rethrowing', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    prisma.user.findUnique.mockResolvedValue({ sipExtension: '1001' });
    prisma.campaign.findFirst.mockResolvedValue({ id: 'manual-campaign-1' });
    callingQueue.getOrCreateItem.mockResolvedValue({ id: 'queue-1' });
    lock.acquire.mockResolvedValue('token-1');
    callsService.createCall.mockResolvedValue({ id: 'call-1' });
    callingQueue.markDialing.mockResolvedValue({
      id: 'queue-1',
      attempts: 1,
      lead: { name: 'Asha Verma' },
      campaign: { name: MANUAL_CAMPAIGN_NAME },
    });
    provider.initiateCall.mockRejectedValue(new Error('provider unavailable'));

    const result = await service.initiateCall(caller, 'lead-1');

    expect(callsService.markInitiateFailure).toHaveBeenCalledWith('call-1');
    expect(callsService.attachProviderCallId).not.toHaveBeenCalled();
    // Still resolves — the frontend follows up over the websocket and sees
    // call.ended FAILED, same as an AI-dialed call's failed attempt.
    expect(result.callId).toBe('call-1');
  });

  it('releases the lock and rethrows if the call row itself never gets created', async () => {
    prisma.lead.findUnique.mockResolvedValue({ id: 'lead-1' });
    prisma.user.findUnique.mockResolvedValue({ sipExtension: '1001' });
    prisma.campaign.findFirst.mockResolvedValue({ id: 'manual-campaign-1' });
    callingQueue.getOrCreateItem.mockResolvedValue({ id: 'queue-1' });
    lock.acquire.mockResolvedValue('token-1');
    callsService.createCall.mockRejectedValue(new Error('db unavailable'));

    await expect(service.initiateCall(caller, 'lead-1')).rejects.toThrow(
      'db unavailable',
    );

    expect(lock.release).toHaveBeenCalledWith('lead-1', 'token-1');
    expect(provider.initiateCall).not.toHaveBeenCalled();
  });
});
