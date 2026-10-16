import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import {
  ANALYZE_CALL_JOB,
  CALL_ANALYSIS_QUEUE,
  CallAnalysisService,
} from './call-analysis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { ActivityService } from '../../activity/activity.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CallingGateway } from '../calling.gateway';
import { CallAnalysisLlmService } from './call-analysis-llm.service';
import {
  CallIntent,
  CallSentiment,
  DecisionMaker,
  LeadPriority,
  LeadStatus,
} from '../../../generated/prisma/enums';
import { DEFAULT_LEAD_SCORING_CONFIG } from '../../system-settings/lead-scoring.config';
import { DEFAULT_HUMAN_TRANSFER_CONFIG } from '../../system-settings/human-transfer.config';

describe('CallAnalysisService', () => {
  let service: CallAnalysisService;
  let prisma: {
    call: { findUnique: jest.Mock };
    callAnalysis: {
      upsert: jest.Mock;
      findUnique: jest.Mock;
      findFirst: jest.Mock;
    };
    lead: { update: jest.Mock };
    leadNote: { create: jest.Mock };
    followUp: { create: jest.Mock };
    meeting: { create: jest.Mock };
  };
  let llm: { analyze: jest.Mock };
  let systemSettings: {
    getLeadScoringConfig: jest.Mock;
    getHumanTransferConfig: jest.Mock;
  };
  let activity: { record: jest.Mock };
  let usersService: { ensureSystemUser: jest.Mock };
  let notifications: { resolveLeadRecipient: jest.Mock; create: jest.Mock };
  let gateway: { emitLeadEvent: jest.Mock };
  let queue: { add: jest.Mock };

  const analysisResult = {
    summary: 'Prospect wants a CRM upgrade.',
    requirement: 'CRM for 20 people',
    budget: 'around 5 lakh',
    timeline: 'next quarter',
    decisionMaker: DecisionMaker.YES,
    intent: CallIntent.HIGH,
    sentiment: CallSentiment.POSITIVE,
    demoRequested: true,
    objections: [],
    nextAction: 'Send pricing sheet',
    qualityScore: {
      opening: 80,
      discovery: 80,
      productKnowledge: 80,
      objectionHandling: 80,
      closing: 80,
      naturalness: 80,
      total: 80,
    },
    coachingFeedback: 'Well handled.',
    callbackRequested: false,
    callbackAt: null,
    callbackReason: null,
    meetingRequested: false,
    meetingAt: null,
    meetingType: null,
  };

  const callRow = {
    id: 'call-1',
    leadId: 'lead-1',
    createdAt: new Date('2026-08-20T10:00:00.000Z'),
    campaign: { name: 'Diwali Outreach' },
    lead: {
      id: 'lead-1',
      name: 'Priya Sharma',
      status: LeadStatus.NEW,
      priority: LeadPriority.MEDIUM,
      assignedToId: 'exec-1',
    },
    recording: { id: 'rec-1' },
    transcript: {
      id: 'transcript-1',
      messages: [
        { speaker: 'AI', text: 'Hi Priya' },
        { speaker: 'CUSTOMER', text: 'Hello' },
      ],
    },
  };

  beforeEach(async () => {
    prisma = {
      call: { findUnique: jest.fn() },
      callAnalysis: {
        upsert: jest.fn().mockResolvedValue({ id: 'analysis-1' }),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      lead: { update: jest.fn() },
      leadNote: { create: jest.fn() },
      followUp: { create: jest.fn() },
      meeting: { create: jest.fn().mockResolvedValue({ id: 'meeting-1' }) },
    };
    llm = { analyze: jest.fn().mockResolvedValue(analysisResult) };
    systemSettings = {
      getLeadScoringConfig: jest
        .fn()
        .mockResolvedValue(DEFAULT_LEAD_SCORING_CONFIG),
      getHumanTransferConfig: jest
        .fn()
        .mockResolvedValue(DEFAULT_HUMAN_TRANSFER_CONFIG),
    };
    activity = { record: jest.fn() };
    usersService = {
      ensureSystemUser: jest.fn().mockResolvedValue({ id: 'system-1' }),
    };
    notifications = {
      resolveLeadRecipient: jest.fn().mockResolvedValue('exec-1'),
      create: jest.fn(),
    };
    gateway = { emitLeadEvent: jest.fn() };
    queue = { add: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        CallAnalysisService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallAnalysisLlmService, useValue: llm },
        { provide: SystemSettingsService, useValue: systemSettings },
        { provide: ActivityService, useValue: activity },
        { provide: UsersService, useValue: usersService },
        { provide: NotificationsService, useValue: notifications },
        { provide: CallingGateway, useValue: gateway },
        { provide: getQueueToken(CALL_ANALYSIS_QUEUE), useValue: queue },
      ],
    }).compile();

    service = moduleRef.get(CallAnalysisService);
  });

  describe('enqueueAnalysis', () => {
    it('queues an analyze-call job keyed to the call id', async () => {
      await service.enqueueAnalysis('call-1');

      expect(queue.add).toHaveBeenCalledWith(
        ANALYZE_CALL_JOB,
        { callId: 'call-1' },
        expect.objectContaining({ jobId: `${ANALYZE_CALL_JOB}-call-1` }),
      );
    });
  });

  describe('analyze', () => {
    it('is a no-op when the call does not exist', async () => {
      prisma.call.findUnique.mockResolvedValue(null);

      await service.analyze('missing-call');

      expect(llm.analyze).not.toHaveBeenCalled();
      expect(prisma.callAnalysis.upsert).not.toHaveBeenCalled();
    });

    it('is a no-op when the call has no transcript messages', async () => {
      prisma.call.findUnique.mockResolvedValue({
        ...callRow,
        transcript: { id: 't1', messages: [] },
      });

      await service.analyze('call-1');

      expect(llm.analyze).not.toHaveBeenCalled();
      expect(prisma.lead.update).not.toHaveBeenCalled();
    });

    it('saves the analysis, scores and updates the lead, notes, logs activity, and emits events', async () => {
      prisma.call.findUnique.mockResolvedValue(callRow);

      await service.analyze('call-1');

      // Score: requirement(25) + budget(20) + timeline(20) + decisionMaker(15)
      // + positiveIntent(10, HIGH multiplier 1) + demoRequested(10) = 100
      const [[analysisArg]] = prisma.callAnalysis.upsert.mock.calls as [
        [{ where: { callId: string }; create: Record<string, unknown> }],
      ];
      expect(analysisArg.where).toEqual({ callId: 'call-1' });
      expect(analysisArg.create).toMatchObject({
        callId: 'call-1',
        summary: analysisResult.summary,
        leadScore: 100,
        leadScoreCategory: 'HOT',
      });

      const [[leadUpdateArg]] = prisma.lead.update.mock.calls as [
        [{ where: { id: string }; data: Record<string, unknown> }],
      ];
      expect(leadUpdateArg.where).toEqual({ id: 'lead-1' });
      expect(leadUpdateArg.data).toMatchObject({
        status: LeadStatus.DEMO_SCHEDULED,
        leadScore: 100,
        requirement: 'CRM for 20 people',
        budget: 500000,
        timeline: 'next quarter',
      });
      expect(leadUpdateArg.data.lastContactedAt).toBeInstanceOf(Date);

      expect(prisma.leadNote.create).toHaveBeenCalledWith({
        data: {
          leadId: 'lead-1',
          authorId: 'system-1',
          body: `AI call summary: ${analysisResult.summary}\nNext action: ${analysisResult.nextAction}`,
        },
      });

      expect(activity.record).toHaveBeenCalledWith({
        leadId: 'lead-1',
        callId: 'call-1',
        type: 'CALL_COMPLETED',
        payload: {
          recordingId: 'rec-1',
          transcriptId: 'transcript-1',
          callAnalysisId: 'analysis-1',
          summary: analysisResult.summary,
        },
      });

      expect(gateway.emitLeadEvent).toHaveBeenCalledWith('lead.updated', {
        leadId: 'lead-1',
      });
      expect(gateway.emitLeadEvent).toHaveBeenCalledWith('lead.score.updated', {
        leadId: 'lead-1',
        leadScore: 100,
        leadScoreCategory: 'HOT',
      });

      // Score 100 is both >= the HOT threshold (90) and >= the default
      // high-value-lead score (85), so this one call fires both.
      expect(notifications.resolveLeadRecipient).toHaveBeenCalledWith('exec-1');
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'exec-1',
          type: 'HOT_LEAD',
          leadId: 'lead-1',
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'exec-1',
          type: 'HIGH_VALUE_LEAD',
          leadId: 'lead-1',
        }),
      );
    });

    it('does not fire HOT_LEAD or HIGH_VALUE_LEAD when the score is below both thresholds', async () => {
      prisma.call.findUnique.mockResolvedValue(callRow);
      llm.analyze.mockResolvedValue({
        ...analysisResult,
        decisionMaker: DecisionMaker.NO,
        intent: CallIntent.LOW,
        demoRequested: false,
      });

      await service.analyze('call-1');

      expect(notifications.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'HOT_LEAD' }),
      );
      expect(notifications.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'HIGH_VALUE_LEAD' }),
      );
    });

    it('fires HIGH_VALUE_LEAD (but not HOT_LEAD) for a HIGH-priority lead even at a low score', async () => {
      prisma.call.findUnique.mockResolvedValue({
        ...callRow,
        lead: { ...callRow.lead, priority: LeadPriority.HIGH },
      });
      llm.analyze.mockResolvedValue({
        ...analysisResult,
        decisionMaker: DecisionMaker.NO,
        intent: CallIntent.LOW,
        demoRequested: false,
      });

      await service.analyze('call-1');

      expect(notifications.create).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'HOT_LEAD' }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'HIGH_VALUE_LEAD', userId: 'exec-1' }),
      );
    });

    it('skips lead-signal notifications when there is no rep or fallback manager', async () => {
      notifications.resolveLeadRecipient.mockResolvedValue(null);
      prisma.call.findUnique.mockResolvedValue(callRow);

      await service.analyze('call-1');

      expect(notifications.create).not.toHaveBeenCalled();
    });

    it('creates a follow_up row when the LLM detected a callback request', async () => {
      prisma.call.findUnique.mockResolvedValue(callRow);
      llm.analyze.mockResolvedValue({
        ...analysisResult,
        callbackRequested: true,
        callbackAt: '2026-08-28T10:00:00.000Z',
        callbackReason: 'Wants to review pricing with her manager',
      });

      await service.analyze('call-1');

      expect(prisma.followUp.create).toHaveBeenCalledWith({
        data: {
          leadId: 'lead-1',
          dueAt: new Date('2026-08-28T10:00:00.000Z'),
          reason: 'Wants to review pricing with her manager',
        },
      });
    });

    it('does not create a follow_up row when no callback was requested', async () => {
      prisma.call.findUnique.mockResolvedValue(callRow);

      await service.analyze('call-1');

      expect(prisma.followUp.create).not.toHaveBeenCalled();
    });

    it('creates a meeting row when the LLM detected a scheduled meeting', async () => {
      prisma.call.findUnique.mockResolvedValue(callRow);
      llm.analyze.mockResolvedValue({
        ...analysisResult,
        meetingRequested: true,
        meetingAt: '2026-08-29T15:00:00.000Z',
        meetingType: 'Demo',
      });

      await service.analyze('call-1');

      expect(prisma.meeting.create).toHaveBeenCalledWith({
        data: {
          leadId: 'lead-1',
          date: new Date('2026-08-29T15:00:00.000Z'),
          time: expect.any(String) as string,
          salespersonId: 'exec-1',
          meetingType: 'Demo',
        },
      });
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'exec-1',
          type: 'MEETING_SCHEDULED',
          leadId: 'lead-1',
        }),
      );
    });

    it('does not create a meeting row when no meeting was scheduled', async () => {
      prisma.call.findUnique.mockResolvedValue(callRow);

      await service.analyze('call-1');

      expect(prisma.meeting.create).not.toHaveBeenCalled();
    });

    it('assigns an auto-created meeting to the system user when the lead has no rep', async () => {
      prisma.call.findUnique.mockResolvedValue({
        ...callRow,
        lead: { ...callRow.lead, assignedToId: null },
      });
      llm.analyze.mockResolvedValue({
        ...analysisResult,
        meetingRequested: true,
        meetingAt: '2026-08-29T15:00:00.000Z',
        meetingType: 'Demo',
      });

      await service.analyze('call-1');

      expect(usersService.ensureSystemUser).toHaveBeenCalled();
      expect(prisma.meeting.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ salespersonId: 'system-1' }),
        }),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system-1',
          type: 'MEETING_SCHEDULED',
        }),
      );
    });

    it('does not overwrite requirement/budget/timeline when this call did not surface them', async () => {
      prisma.call.findUnique.mockResolvedValue(callRow);
      llm.analyze.mockResolvedValue({
        ...analysisResult,
        requirement: null,
        budget: null,
        timeline: null,
        demoRequested: false,
      });

      await service.analyze('call-1');

      const [[{ data }]] = prisma.lead.update.mock.calls as [
        [{ data: Record<string, unknown> }],
      ];
      expect(data.requirement).toBeUndefined();
      expect(data.budget).toBeUndefined();
      expect(data.timeline).toBeUndefined();
    });
  });

  describe('getForCall / getLatestForLead', () => {
    it('delegates to a plain findUnique by callId', () => {
      void service.getForCall('call-1');
      expect(prisma.callAnalysis.findUnique).toHaveBeenCalledWith({
        where: { callId: 'call-1' },
      });
    });

    it('delegates to findFirst ordered newest-first for the lead', () => {
      void service.getLatestForLead('lead-1');
      expect(prisma.callAnalysis.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { call: { leadId: 'lead-1' } },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
