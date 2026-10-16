import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityService } from '../../activity/activity.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CallingGateway } from '../calling.gateway';
import { ConversationStateService } from '../ai-voice/conversation-state.service';
import { TELEPHONY_PROVIDER } from '../telephony/telephony-provider.token';
import type { TelephonyProvider } from '../telephony/telephony-provider.interface';
import { NotificationType, Role } from '../../../generated/prisma/enums';
import type { LeadPriority } from '../../../generated/prisma/enums';
import { evaluateTransferTriggers } from './human-transfer-triggers.util';
import { buildLiveSummary } from './live-summary.util';
import {
  TRANSFER_REASON_LABEL,
  type HumanTransferContext,
  type TransferReason,
  type TransferTarget,
  type TransferTriggerInput,
} from './human-transfer.types';

export const HUMAN_TRANSFER_ACTIVITY_TYPE = 'HUMAN_TRANSFER';

interface TransferLead {
  id: string;
  name: string;
  companyName: string | null;
  requirement: string | null;
  budget: number | null;
  timeline: string | null;
  leadScore: number;
  priority: LeadPriority;
  assignedToId: string | null;
  assignedTo: { id: string; sipExtension: string | null } | null;
}

/**
 * Owns Prompt 18's human-handoff flow end to end for the live AI voice
 * pipeline: checks the deterministic trigger conditions every turn (see
 * evaluateTransferTriggers), and — on a match — resolves who should take
 * the call, pushes them the full context (a Notification row, the
 * human.transfer websocket event, and a lead activity entry), then bridges
 * the call to them via TelephonyProvider.transferCall. Called once per turn
 * from VoiceSessionService.runTurn; VoiceSessionService itself owns none of
 * this logic, only the audio pipeline around it.
 */
@Injectable()
export class HumanTransferService {
  private readonly logger = new Logger(HumanTransferService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly systemSettings: SystemSettingsService,
    private readonly conversation: ConversationStateService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
    private readonly gateway: CallingGateway,
    @Inject(TELEPHONY_PROVIDER) private readonly telephony: TelephonyProvider,
  ) {}

  /**
   * Evaluates one turn's trigger signals; if any fire, notifies the target
   * salesperson and transfers the call to them. Returns the resolved target
   * on an actual handoff, null otherwise — including when triggers fired
   * but no one with a registered SIP extension was reachable (logged, not
   * thrown, same posture as VoiceSessionService.handleAction's own
   * telephony error handling).
   *
   * Idempotent per call: a call already flagged transferredToHuman is
   * skipped outright, so a call that keeps producing turns after the
   * handoff request (a slow PBX redirect, or the customer talking on) never
   * re-evaluates, re-notifies, or re-transfers.
   */
  async evaluateAndTransfer(
    callId: string,
    input: Omit<TransferTriggerInput, 'leadPriority' | 'leadScore'>,
  ): Promise<TransferTarget | null> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        providerCallId: true,
        transferredToHuman: true,
        leadId: true,
        lead: {
          select: {
            id: true,
            name: true,
            companyName: true,
            requirement: true,
            budget: true,
            timeline: true,
            leadScore: true,
            priority: true,
            assignedToId: true,
            assignedTo: { select: { id: true, sipExtension: true } },
          },
        },
      },
    });
    if (!call?.providerCallId || call.transferredToHuman) return null;

    const config = await this.systemSettings.getHumanTransferConfig();
    const reasons = evaluateTransferTriggers(
      {
        ...input,
        leadPriority: call.lead.priority,
        leadScore: call.lead.leadScore,
      },
      config,
    );
    if (reasons.length === 0) return null;

    const target = await this.resolveTarget(call.lead);
    if (!target) {
      this.logger.warn(
        `Call ${callId}: transfer triggered (${reasons.join(', ')}) but no ` +
          'salesperson with a registered SIP extension was available',
      );
      return null;
    }

    const context = this.buildContext(callId, call.lead, reasons);
    await this.notifyTarget(target, context);

    try {
      await this.telephony.transferCall(call.providerCallId, target.extension);
      await this.prisma.call.update({
        where: { id: callId },
        data: { transferredToHuman: true },
      });
    } catch (error) {
      this.logger.error(
        `transferCall failed for call ${callId} -> extension ${target.extension}: ${(error as Error).message}`,
      );
    }

    return target;
  }

  /** Assigned rep first, if they have a softphone registered; otherwise any
   * sales manager with one, picked deterministically (by name) rather than
   * whichever row an unordered query happens to return first. */
  private async resolveTarget(
    lead: TransferLead,
  ): Promise<TransferTarget | null> {
    if (lead.assignedTo?.sipExtension) {
      return {
        userId: lead.assignedTo.id,
        extension: lead.assignedTo.sipExtension,
      };
    }

    const manager = await this.prisma.user.findFirst({
      where: { role: Role.SALES_MANAGER, sipExtension: { not: null } },
      orderBy: { name: 'asc' },
      select: { id: true, sipExtension: true },
    });
    if (!manager?.sipExtension) return null;
    return { userId: manager.id, extension: manager.sipExtension };
  }

  private buildContext(
    callId: string,
    lead: TransferLead,
    reasons: TransferReason[],
  ): HumanTransferContext {
    const state = this.conversation.has(callId)
      ? this.conversation.get(callId)
      : null;

    return {
      callId,
      leadId: lead.id,
      customerName: lead.name,
      companyName: lead.companyName,
      requirement: lead.requirement,
      budget: lead.budget,
      timeline: lead.timeline,
      aiSummary: state
        ? buildLiveSummary(state)
        : 'Live conversation state unavailable.',
      leadScore: lead.leadScore,
      reasons,
      transcript: state
        ? state.turns.map((t) => ({
            speaker: t.role,
            text: t.text,
            at: t.at.toISOString(),
          }))
        : [],
    };
  }

  private async notifyTarget(
    target: TransferTarget,
    context: HumanTransferContext,
  ): Promise<void> {
    const reasonLabels = context.reasons.map((r) => TRANSFER_REASON_LABEL[r]);

    const notification = await this.notifications.create({
      userId: target.userId,
      type: NotificationType.HUMAN_TRANSFER,
      leadId: context.leadId,
      callId: context.callId,
      title: `Live call transfer: ${context.customerName}`,
      body: reasonLabels.join('; '),
      payload: { ...context, reasonLabels },
    });

    await this.activity.record({
      leadId: context.leadId,
      callId: context.callId,
      type: HUMAN_TRANSFER_ACTIVITY_TYPE,
      payload: { reasons: context.reasons, targetUserId: target.userId },
    });

    this.gateway.emitHumanTransferEvent('human.transfer', {
      ...context,
      targetUserId: target.userId,
      notificationId: notification.id,
      reasonLabels,
    });
  }
}
