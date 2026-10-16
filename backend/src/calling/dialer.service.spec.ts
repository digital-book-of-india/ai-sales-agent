import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { DialerService, DIALER_QUEUE, DIAL_JOB } from './dialer.service';
import { PrismaService } from '../prisma/prisma.service';
import { CallingQueueService } from './calling-queue.service';
import { CallLockService } from './call-lock.service';
import { CallRateLimiterService } from './call-rate-limiter.service';
import { CallingGateway } from './calling.gateway';
import { CallsService } from './telephony/calls.service';
import { TELEPHONY_PROVIDER } from './telephony/telephony-provider.token';
import {
  CampaignStatus,
  CallingQueueStatus,
} from '../../generated/prisma/enums';

describe('DialerService', () => {
  let service: DialerService;
  let queue: { add: jest.Mock; upsertJobScheduler: jest.Mock };
  let prisma: {
    campaign: { findMany: jest.Mock; findUnique: jest.Mock };
  };
  let callingQueue: {
    countActive: jest.Mock;
    findDueForCampaign: jest.Mock;
    getItem: jest.Mock;
    markDialing: jest.Mock;
  };
  let lock: { acquire: jest.Mock; release: jest.Mock };
  let rateLimiter: { getUsage: jest.Mock; reserve: jest.Mock };
  let provider: { name: string; initiateCall: jest.Mock };
  let callsService: {
    createCall: jest.Mock;
    attachProviderCallId: jest.Mock;
    markInitiateFailure: jest.Mock;
  };
  let gateway: { emitEvent: jest.Mock };

  const leadItem = (overrides: Record<string, unknown> = {}) => ({
    id: 'queue-1',
    leadId: 'lead-1',
    campaignId: 'campaign-1',
    status: CallingQueueStatus.QUEUED,
    attempts: 0,
    lead: { assignedToId: null },
    ...overrides,
  });

  beforeEach(async () => {
    queue = { add: jest.fn(), upsertJobScheduler: jest.fn() };
    prisma = { campaign: { findMany: jest.fn(), findUnique: jest.fn() } };
    callingQueue = {
      countActive: jest.fn(),
      findDueForCampaign: jest.fn(),
      getItem: jest.fn(),
      markDialing: jest.fn(),
    };
    lock = { acquire: jest.fn(), release: jest.fn() };
    rateLimiter = { getUsage: jest.fn(), reserve: jest.fn() };
    provider = { name: 'mock', initiateCall: jest.fn() };
    callsService = {
      createCall: jest.fn(),
      attachProviderCallId: jest.fn(),
      markInitiateFailure: jest.fn(),
    };
    gateway = { emitEvent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DialerService,
        { provide: getQueueToken(DIALER_QUEUE), useValue: queue },
        { provide: PrismaService, useValue: prisma },
        { provide: CallingQueueService, useValue: callingQueue },
        { provide: CallLockService, useValue: lock },
        { provide: CallRateLimiterService, useValue: rateLimiter },
        { provide: TELEPHONY_PROVIDER, useValue: provider },
        { provide: CallsService, useValue: callsService },
        { provide: CallingGateway, useValue: gateway },
      ],
    }).compile();

    service = moduleRef.get(DialerService);
  });

  describe('runTick', () => {
    it('dispatches a dial job per eligible item, bounded by slots and rate budget', async () => {
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'campaign-1',
          callingHours: {},
          concurrentCalls: 2,
          callsPerMinute: 10,
        },
      ]);
      callingQueue.countActive.mockResolvedValue(0);
      rateLimiter.getUsage.mockResolvedValue(0);
      callingQueue.findDueForCampaign.mockResolvedValue([
        leadItem({ id: 'q-1' }),
        leadItem({ id: 'q-2' }),
      ]);

      await service.runTick();

      expect(rateLimiter.reserve).toHaveBeenCalledWith('campaign-1', 2);
      expect(queue.add).toHaveBeenCalledTimes(2);
      expect(queue.add).toHaveBeenCalledWith(
        DIAL_JOB,
        { queueItemId: 'q-1' },
        { jobId: `${DIAL_JOB}-q-1-1` },
      );
    });

    it('skips a campaign outside its calling hours', async () => {
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'campaign-1',
          callingHours: { start: '09:00', end: '09:01' },
          concurrentCalls: 2,
          callsPerMinute: 10,
        },
      ]);

      const fixedNow = new Date('2026-08-21T20:00:00');
      jest.useFakeTimers().setSystemTime(fixedNow);

      await service.runTick();

      expect(callingQueue.countActive).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('does not dispatch once concurrency slots are exhausted', async () => {
      prisma.campaign.findMany.mockResolvedValue([
        {
          id: 'campaign-1',
          callingHours: {},
          concurrentCalls: 1,
          callsPerMinute: 10,
        },
      ]);
      callingQueue.countActive.mockResolvedValue(1);

      await service.runTick();

      expect(rateLimiter.getUsage).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });
  });

  describe('processDial', () => {
    it('ignores an item that is no longer QUEUED/RETRY', async () => {
      callingQueue.getItem.mockResolvedValue(
        leadItem({ status: CallingQueueStatus.CANCELLED }),
      );

      await service.processDial('queue-1');

      expect(lock.acquire).not.toHaveBeenCalled();
    });

    it('skips dialing when the lead lock is already held elsewhere', async () => {
      callingQueue.getItem.mockResolvedValue(leadItem());
      prisma.campaign.findUnique.mockResolvedValue({
        status: CampaignStatus.RUNNING,
      });
      lock.acquire.mockResolvedValue(null);

      await service.processDial('queue-1');

      expect(callsService.createCall).not.toHaveBeenCalled();
    });

    it('creates the call, marks the item DIALING, and hands off to the provider without blocking', async () => {
      callingQueue.getItem.mockResolvedValue(leadItem());
      prisma.campaign.findUnique.mockResolvedValue({
        status: CampaignStatus.RUNNING,
        aiAgentId: 'agent-1',
      });
      lock.acquire.mockResolvedValue('token-1');
      callsService.createCall.mockResolvedValue({ id: 'call-1' });
      callingQueue.markDialing.mockResolvedValue({
        id: 'queue-1',
        attempts: 1,
        lead: { name: 'Asha Verma' },
        campaign: { name: 'Diwali Outreach' },
      });
      provider.initiateCall.mockResolvedValue({
        providerCallId: 'ext-call-1',
        status: 'INITIATED',
      });

      await service.processDial('queue-1');

      expect(callsService.createCall).toHaveBeenCalledWith({
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        queueItemId: 'queue-1',
        provider: 'mock',
        lockToken: 'token-1',
        callMode: 'AI',
        salesUserId: undefined,
      });
      expect(callingQueue.markDialing).toHaveBeenCalledWith(
        'queue-1',
        'call-1',
      );
      const events = gateway.emitEvent.mock.calls.map(
        (call) => (call as [string])[0],
      );
      expect(events).toEqual(['call.created', 'call.dialing']);
      expect(provider.initiateCall).toHaveBeenCalledWith(
        'lead-1',
        'campaign-1',
        'AI',
        undefined,
      );
      expect(callsService.attachProviderCallId).toHaveBeenCalledWith(
        'call-1',
        'ext-call-1',
      );
      // The lock is released later by CallsService on a terminal update,
      // not synchronously here.
      expect(lock.release).not.toHaveBeenCalled();
    });

    it('falls back to MANUAL with the lead-assigned sales rep when the campaign has no AI agent configured', async () => {
      callingQueue.getItem.mockResolvedValue(
        leadItem({ lead: { assignedToId: 'user-9' } }),
      );
      prisma.campaign.findUnique.mockResolvedValue({
        status: CampaignStatus.RUNNING,
        aiAgentId: null,
      });
      lock.acquire.mockResolvedValue('token-1');
      callsService.createCall.mockResolvedValue({ id: 'call-1' });
      callingQueue.markDialing.mockResolvedValue({
        id: 'queue-1',
        attempts: 1,
        lead: { name: 'Asha Verma' },
        campaign: { name: 'Diwali Outreach' },
      });
      provider.initiateCall.mockResolvedValue({
        providerCallId: 'ext-call-1',
        status: 'INITIATED',
      });

      await service.processDial('queue-1');

      expect(callsService.createCall).toHaveBeenCalledWith(
        expect.objectContaining({ callMode: 'MANUAL', salesUserId: 'user-9' }),
      );
      expect(provider.initiateCall).toHaveBeenCalledWith(
        'lead-1',
        'campaign-1',
        'MANUAL',
        'user-9',
      );
    });

    it('records a failed attempt via CallsService when initiateCall throws, without rethrowing', async () => {
      callingQueue.getItem.mockResolvedValue(leadItem());
      prisma.campaign.findUnique.mockResolvedValue({
        status: CampaignStatus.RUNNING,
      });
      lock.acquire.mockResolvedValue('token-1');
      callsService.createCall.mockResolvedValue({ id: 'call-1' });
      callingQueue.markDialing.mockResolvedValue({
        id: 'queue-1',
        attempts: 1,
        lead: { name: 'Asha Verma' },
        campaign: { name: 'Diwali Outreach' },
      });
      provider.initiateCall.mockRejectedValue(
        new Error('provider unavailable'),
      );

      await expect(service.processDial('queue-1')).resolves.toBeUndefined();

      expect(callsService.markInitiateFailure).toHaveBeenCalledWith('call-1');
      expect(callsService.attachProviderCallId).not.toHaveBeenCalled();
    });

    it('releases the lock directly if the call row itself never gets created', async () => {
      callingQueue.getItem.mockResolvedValue(leadItem());
      prisma.campaign.findUnique.mockResolvedValue({
        status: CampaignStatus.RUNNING,
      });
      lock.acquire.mockResolvedValue('token-1');
      callsService.createCall.mockRejectedValue(new Error('db unavailable'));

      await expect(service.processDial('queue-1')).resolves.toBeUndefined();

      expect(lock.release).toHaveBeenCalledWith('lead-1', 'token-1');
      expect(provider.initiateCall).not.toHaveBeenCalled();
    });
  });
});
