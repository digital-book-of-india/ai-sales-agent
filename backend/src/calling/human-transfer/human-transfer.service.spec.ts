import { HumanTransferService } from './human-transfer.service';
import { ConversationStateService } from '../ai-voice/conversation-state.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ActivityService } from '../../activity/activity.service';
import type { NotificationsService } from '../../notifications/notifications.service';
import type { SystemSettingsService } from '../../system-settings/system-settings.service';
import type { CallingGateway } from '../calling.gateway';
import type { TelephonyProvider } from '../telephony/telephony-provider.interface';
import { DEFAULT_HUMAN_TRANSFER_CONFIG } from '../../system-settings/human-transfer.config';
import { LeadPriority, Role } from '../../../generated/prisma/enums';

function baseCallRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'call-1',
    providerCallId: 'provider-call-1',
    transferredToHuman: false,
    leadId: 'lead-1',
    lead: {
      id: 'lead-1',
      name: 'Asha Verma',
      companyName: 'Acme Co',
      requirement: 'CRM for 20 seats',
      budget: 500000,
      timeline: 'This quarter',
      leadScore: 40,
      priority: LeadPriority.MEDIUM,
      assignedToId: 'rep-1',
      assignedTo: { id: 'rep-1', sipExtension: '1002' },
    },
    ...overrides,
  };
}

function baseTurnInput() {
  return {
    customerUtterance: 'Can I talk to a person please?',
    detectedIntent: 'other' as const,
    groundedInKnowledgeBase: true,
    confidence: 0.9,
    llmRequestedTransfer: false,
  };
}

describe('HumanTransferService', () => {
  let callFindUnique: jest.Mock;
  let callUpdate: jest.Mock;
  let userFindFirst: jest.Mock;
  let prisma: PrismaService;

  let getHumanTransferConfig: jest.Mock;
  let systemSettings: SystemSettingsService;

  let activityRecord: jest.Mock;
  let activity: ActivityService;

  let notificationsCreate: jest.Mock;
  let notifications: NotificationsService;

  let emitHumanTransferEvent: jest.Mock;
  let gateway: CallingGateway;

  let transferCall: jest.Mock;
  let telephony: TelephonyProvider;

  let conversation: ConversationStateService;
  let service: HumanTransferService;

  beforeEach(() => {
    callFindUnique = jest.fn().mockResolvedValue(baseCallRow());
    callUpdate = jest.fn().mockResolvedValue(undefined);
    userFindFirst = jest.fn().mockResolvedValue(null);
    prisma = {
      call: { findUnique: callFindUnique, update: callUpdate },
      user: { findFirst: userFindFirst },
    } as unknown as PrismaService;

    getHumanTransferConfig = jest
      .fn()
      .mockResolvedValue(DEFAULT_HUMAN_TRANSFER_CONFIG);
    systemSettings = {
      getHumanTransferConfig,
    } as unknown as SystemSettingsService;

    activityRecord = jest.fn().mockResolvedValue(undefined);
    activity = { record: activityRecord } as unknown as ActivityService;

    notificationsCreate = jest.fn().mockResolvedValue({ id: 'notif-1' });
    notifications = {
      create: notificationsCreate,
    } as unknown as NotificationsService;

    emitHumanTransferEvent = jest.fn();
    gateway = { emitHumanTransferEvent } as unknown as CallingGateway;

    transferCall = jest.fn().mockResolvedValue(undefined);
    telephony = { transferCall } as unknown as TelephonyProvider;

    conversation = new ConversationStateService();
    conversation.start('call-1', 'agent-1', 'en-IN');
    conversation.appendTurn('call-1', {
      role: 'customer',
      kind: 'dialogue',
      text: 'Can I talk to a person please?',
    });

    service = new HumanTransferService(
      prisma,
      systemSettings,
      conversation,
      activity,
      notifications,
      gateway,
      telephony,
    );
  });

  it('returns null and does nothing when no trigger fires', async () => {
    const result = await service.evaluateAndTransfer('call-1', {
      customerUtterance: 'Tell me about pricing',
      detectedIntent: 'other',
      groundedInKnowledgeBase: true,
      confidence: 0.9,
      llmRequestedTransfer: false,
    });

    expect(result).toBeNull();
    expect(transferCall).not.toHaveBeenCalled();
    expect(notificationsCreate).not.toHaveBeenCalled();
    expect(emitHumanTransferEvent).not.toHaveBeenCalled();
  });

  it('is a no-op once the call is already flagged transferredToHuman', async () => {
    callFindUnique.mockResolvedValue(baseCallRow({ transferredToHuman: true }));

    const result = await service.evaluateAndTransfer('call-1', baseTurnInput());

    expect(result).toBeNull();
    expect(transferCall).not.toHaveBeenCalled();
  });

  it('transfers to the assigned salesperson and pushes the full context', async () => {
    const result = await service.evaluateAndTransfer('call-1', baseTurnInput());

    expect(result).toEqual({ userId: 'rep-1', extension: '1002' });
    expect(transferCall).toHaveBeenCalledWith('provider-call-1', '1002');
    expect(callUpdate).toHaveBeenCalledWith({
      where: { id: 'call-1' },
      data: { transferredToHuman: true },
    });

    expect(notificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'rep-1',
        type: 'HUMAN_TRANSFER',
        leadId: 'lead-1',
        callId: 'call-1',
        payload: expect.objectContaining({
          customerName: 'Asha Verma',
          companyName: 'Acme Co',
          requirement: 'CRM for 20 seats',
          budget: 500000,
          timeline: 'This quarter',
          leadScore: 40,
          reasons: ['explicit_request'],
          transcript: [
            expect.objectContaining({
              speaker: 'customer',
              text: 'Can I talk to a person please?',
            }),
          ],
        }) as unknown,
      }),
    );

    expect(activityRecord).toHaveBeenCalledWith({
      leadId: 'lead-1',
      callId: 'call-1',
      type: 'HUMAN_TRANSFER',
      payload: { reasons: ['explicit_request'], targetUserId: 'rep-1' },
    });

    expect(emitHumanTransferEvent).toHaveBeenCalledWith(
      'human.transfer',
      expect.objectContaining({
        targetUserId: 'rep-1',
        notificationId: 'notif-1',
        reasons: ['explicit_request'],
      }),
    );
  });

  it('falls back to a sales manager when the lead has no assigned rep with a SIP extension', async () => {
    callFindUnique.mockResolvedValue(
      baseCallRow({
        lead: {
          ...baseCallRow().lead,
          assignedToId: null,
          assignedTo: null,
        },
      }),
    );
    userFindFirst.mockResolvedValue({ id: 'mgr-1', sipExtension: '1000' });

    const result = await service.evaluateAndTransfer('call-1', baseTurnInput());

    expect(result).toEqual({ userId: 'mgr-1', extension: '1000' });
    expect(userFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { role: Role.SALES_MANAGER, sipExtension: { not: null } },
      }),
    );
    expect(transferCall).toHaveBeenCalledWith('provider-call-1', '1000');
  });

  it('logs and skips the transfer when no target has a registered SIP extension', async () => {
    callFindUnique.mockResolvedValue(
      baseCallRow({
        lead: {
          ...baseCallRow().lead,
          assignedToId: null,
          assignedTo: null,
        },
      }),
    );
    userFindFirst.mockResolvedValue(null);

    const result = await service.evaluateAndTransfer('call-1', baseTurnInput());

    expect(result).toBeNull();
    expect(transferCall).not.toHaveBeenCalled();
    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it('still notifies even when TelephonyProvider.transferCall itself fails', async () => {
    transferCall.mockRejectedValue(new Error('AMI redirect failed'));

    const result = await service.evaluateAndTransfer('call-1', baseTurnInput());

    expect(result).toEqual({ userId: 'rep-1', extension: '1002' });
    expect(notificationsCreate).toHaveBeenCalled();
    expect(emitHumanTransferEvent).toHaveBeenCalled();
    expect(callUpdate).not.toHaveBeenCalled();
  });

  it('triggers on a high-value lead even when nothing else in the turn matched', async () => {
    callFindUnique.mockResolvedValue(
      baseCallRow({
        lead: { ...baseCallRow().lead, priority: LeadPriority.HIGH },
      }),
    );

    const result = await service.evaluateAndTransfer('call-1', {
      customerUtterance: 'Sounds fine, thanks',
      detectedIntent: 'other',
      groundedInKnowledgeBase: true,
      confidence: 0.9,
      llmRequestedTransfer: false,
    });

    expect(result).not.toBeNull();
    expect(notificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({
          reasons: ['high_value_lead'],
        }) as unknown,
      }),
    );
  });
});
