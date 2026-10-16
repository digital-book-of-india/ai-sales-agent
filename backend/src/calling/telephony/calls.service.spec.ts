import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { CallsService } from './calls.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CallingQueueService } from '../calling-queue.service';
import { CallLockService } from '../call-lock.service';
import { CallingGateway } from '../calling.gateway';
import { RecordingsService } from '../recordings/recordings.service';
import { TranscriptsService } from '../transcripts/transcripts.service';
import { CallAnalysisService } from '../analysis/call-analysis.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import { CallingQueueStatus } from '../../../generated/prisma/enums';

describe('CallsService', () => {
  let service: CallsService;
  let prisma: {
    call: { create: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
  };
  let callingQueue: {
    setStatus: jest.Mock;
    completeCall: jest.Mock;
    recordFailedAttempt: jest.Mock;
    isCampaignExhausted: jest.Mock;
    countFailed: jest.Mock;
  };
  let lock: { release: jest.Mock };
  let gateway: { emitEvent: jest.Mock };
  let recordings: { enqueueFetch: jest.Mock };
  let transcripts: { finalize: jest.Mock };
  let callAnalysis: { enqueueAnalysis: jest.Mock };
  let notifications: { notifyManagers: jest.Mock };
  let systemSettings: { getNotificationsConfig: jest.Mock };

  const callRecord = (overrides: Record<string, unknown> = {}) => ({
    id: 'call-1',
    leadId: 'lead-1',
    campaignId: 'campaign-1',
    queueItemId: 'queue-1',
    provider: 'mock',
    providerCallId: 'mock-abc',
    status: 'INITIATED',
    startedAt: null,
    lockToken: 'token-1',
    lead: { name: 'Asha Verma' },
    campaign: {
      name: 'Diwali Outreach',
      retryInterval: 30,
      recordingConsent: true,
    },
    queueItem: { attempts: 1 },
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      call: {
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn(),
      },
    };
    callingQueue = {
      setStatus: jest.fn(),
      completeCall: jest.fn(),
      recordFailedAttempt: jest.fn(),
      isCampaignExhausted: jest.fn().mockResolvedValue(false),
      countFailed: jest.fn().mockResolvedValue(0),
    };
    lock = { release: jest.fn() };
    gateway = { emitEvent: jest.fn() };
    recordings = { enqueueFetch: jest.fn().mockResolvedValue(undefined) };
    transcripts = { finalize: jest.fn().mockResolvedValue(undefined) };
    callAnalysis = { enqueueAnalysis: jest.fn().mockResolvedValue(undefined) };
    notifications = { notifyManagers: jest.fn().mockResolvedValue(undefined) };
    systemSettings = {
      getNotificationsConfig: jest
        .fn()
        .mockResolvedValue({ failedCallsThreshold: 5 }),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CallsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallingQueueService, useValue: callingQueue },
        { provide: CallLockService, useValue: lock },
        { provide: CallingGateway, useValue: gateway },
        { provide: RecordingsService, useValue: recordings },
        { provide: TranscriptsService, useValue: transcripts },
        { provide: CallAnalysisService, useValue: callAnalysis },
        { provide: NotificationsService, useValue: notifications },
        { provide: SystemSettingsService, useValue: systemSettings },
      ],
    }).compile();

    service = moduleRef.get(CallsService);
  });

  describe('createCall', () => {
    it('persists callMode and salesUserId onto the new Call row', async () => {
      prisma.call.create.mockResolvedValue(callRecord());

      await service.createCall({
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        queueItemId: 'queue-1',
        provider: 'asterisk',
        lockToken: 'token-1',
        callMode: 'MANUAL',
        salesUserId: 'user-1',
      });

      expect(prisma.call.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          callMode: 'MANUAL',
          salesUserId: 'user-1',
        }) as unknown,
      });
    });

    it('leaves salesUserId undefined for an AI call', async () => {
      prisma.call.create.mockResolvedValue(callRecord());

      await service.createCall({
        leadId: 'lead-1',
        campaignId: 'campaign-1',
        queueItemId: 'queue-1',
        provider: 'asterisk',
        lockToken: 'token-1',
        callMode: 'AI',
      });

      expect(prisma.call.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          callMode: 'AI',
          salesUserId: undefined,
        }) as unknown,
      });
    });
  });

  describe('applyStatusUpdate', () => {
    it('throws when no call matches the providerCallId', async () => {
      prisma.call.findUnique.mockResolvedValue(null);

      await expect(
        service.applyStatusUpdate('missing', { status: 'RINGING' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('on RINGING, sets the queue item RINGING and emits call.ringing without releasing the lock', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());

      await service.applyStatusUpdate('mock-abc', { status: 'RINGING' });

      expect(callingQueue.setStatus).toHaveBeenCalledWith(
        'queue-1',
        CallingQueueStatus.RINGING,
      );
      expect(gateway.emitEvent).toHaveBeenCalledWith(
        'call.ringing',
        expect.objectContaining({ status: CallingQueueStatus.RINGING }),
      );
      expect(lock.release).not.toHaveBeenCalled();
    });

    it('on IN_PROGRESS, sets the queue item CONNECTED and emits call.connected', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());

      await service.applyStatusUpdate('mock-abc', { status: 'IN_PROGRESS' });

      expect(callingQueue.setStatus).toHaveBeenCalledWith(
        'queue-1',
        CallingQueueStatus.CONNECTED,
      );
      expect(gateway.emitEvent).toHaveBeenCalledWith(
        'call.connected',
        expect.objectContaining({ status: CallingQueueStatus.CONNECTED }),
      );
    });

    it('on COMPLETED, completes the queue item, emits call.ended with a CONNECTED outcome, releases the lock, and queues a recording fetch', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.completeCall.mockResolvedValue({
        status: CallingQueueStatus.COMPLETED,
      });

      await service.applyStatusUpdate('mock-abc', {
        status: 'COMPLETED',
        duration: 45,
      });

      expect(callingQueue.completeCall).toHaveBeenCalledWith('queue-1');
      expect(gateway.emitEvent).toHaveBeenCalledWith(
        'call.ended',
        expect.objectContaining({
          status: CallingQueueStatus.COMPLETED,
          outcome: 'CONNECTED',
          talkMs: 45000,
        }),
      );
      expect(lock.release).toHaveBeenCalledWith('lead-1', 'token-1');
      expect(recordings.enqueueFetch).toHaveBeenCalledWith('call-1');
      expect(transcripts.finalize).toHaveBeenCalledWith('call-1');
      expect(callAnalysis.enqueueAnalysis).toHaveBeenCalledWith('call-1');
    });

    it('on COMPLETED, skips the recording fetch when the campaign has recording consent disabled', async () => {
      prisma.call.findUnique.mockResolvedValue(
        callRecord({
          campaign: {
            name: 'Diwali Outreach',
            retryInterval: 30,
            recordingConsent: false,
          },
        }),
      );
      callingQueue.completeCall.mockResolvedValue({
        status: CallingQueueStatus.COMPLETED,
      });

      await service.applyStatusUpdate('mock-abc', {
        status: 'COMPLETED',
        duration: 45,
      });

      expect(recordings.enqueueFetch).not.toHaveBeenCalled();
    });

    it('on NO_ANSWER, records a failed attempt with the campaign retry interval and releases the lock', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.recordFailedAttempt.mockResolvedValue({
        status: CallingQueueStatus.RETRY,
      });

      await service.applyStatusUpdate('mock-abc', { status: 'NO_ANSWER' });

      expect(callingQueue.recordFailedAttempt).toHaveBeenCalledWith(
        'queue-1',
        CallingQueueStatus.NO_ANSWER,
        30,
      );
      expect(gateway.emitEvent).toHaveBeenCalledWith(
        'call.ended',
        expect.objectContaining({
          status: CallingQueueStatus.RETRY,
          outcome: 'NO_ANSWER',
        }),
      );
      expect(lock.release).toHaveBeenCalledWith('lead-1', 'token-1');
      expect(transcripts.finalize).toHaveBeenCalledWith('call-1');
      expect(callAnalysis.enqueueAnalysis).not.toHaveBeenCalled();
    });

    it('notifies managers with CAMPAIGN_COMPLETED once the campaign queue is exhausted', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.completeCall.mockResolvedValue({
        status: CallingQueueStatus.COMPLETED,
      });
      callingQueue.isCampaignExhausted.mockResolvedValue(true);

      await service.applyStatusUpdate('mock-abc', { status: 'COMPLETED' });

      expect(callingQueue.isCampaignExhausted).toHaveBeenCalledWith(
        'campaign-1',
      );
      expect(notifications.notifyManagers).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CAMPAIGN_COMPLETED',
          payload: { campaignId: 'campaign-1' },
        }),
      );
    });

    it('does not notify managers while the campaign still has non-terminal items', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.completeCall.mockResolvedValue({
        status: CallingQueueStatus.COMPLETED,
      });
      callingQueue.isCampaignExhausted.mockResolvedValue(false);

      await service.applyStatusUpdate('mock-abc', { status: 'COMPLETED' });

      expect(notifications.notifyManagers).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CAMPAIGN_COMPLETED' }),
      );
    });

    it('notifies managers with CALL_FAILURES_THRESHOLD the moment a FAILED outcome makes the count hit the configured threshold', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.recordFailedAttempt.mockResolvedValue({
        status: CallingQueueStatus.FAILED,
      });
      callingQueue.countFailed.mockResolvedValue(5);

      await service.applyStatusUpdate('mock-abc', { status: 'FAILED' });

      expect(notifications.notifyManagers).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CALL_FAILURES_THRESHOLD',
          payload: { campaignId: 'campaign-1', failedCount: 5 },
        }),
      );
    });

    it('does not re-notify CALL_FAILURES_THRESHOLD once the count has already passed the threshold', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.recordFailedAttempt.mockResolvedValue({
        status: CallingQueueStatus.FAILED,
      });
      callingQueue.countFailed.mockResolvedValue(6);

      await service.applyStatusUpdate('mock-abc', { status: 'FAILED' });

      expect(notifications.notifyManagers).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CALL_FAILURES_THRESHOLD' }),
      );
    });

    it('does not check CALL_FAILURES_THRESHOLD for a retry (queue item not yet FAILED)', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.recordFailedAttempt.mockResolvedValue({
        status: CallingQueueStatus.RETRY,
      });

      await service.applyStatusUpdate('mock-abc', { status: 'NO_ANSWER' });

      expect(callingQueue.countFailed).not.toHaveBeenCalled();
    });
  });

  describe('markInitiateFailure', () => {
    it('records a FAILED attempt and releases the lock when initiateCall itself failed', async () => {
      prisma.call.findUnique.mockResolvedValue(callRecord());
      callingQueue.recordFailedAttempt.mockResolvedValue({
        status: CallingQueueStatus.FAILED,
      });

      await service.markInitiateFailure('call-1');

      expect(callingQueue.recordFailedAttempt).toHaveBeenCalledWith(
        'queue-1',
        CallingQueueStatus.FAILED,
        30,
      );
      expect(lock.release).toHaveBeenCalledWith('lead-1', 'token-1');
      expect(transcripts.finalize).toHaveBeenCalledWith('call-1');
    });

    it('throws when the call id does not exist', async () => {
      prisma.call.findUnique.mockResolvedValue(null);

      await expect(service.markInitiateFailure('missing')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
