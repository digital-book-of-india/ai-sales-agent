import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { ActivityService } from '../../activity/activity.service';
import { SystemSettingsService } from '../../system-settings/system-settings.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { CallingGateway } from '../calling.gateway';
import { CallAnalysisLlmService } from './call-analysis-llm.service';
import { computeLeadScore, type LeadScoringResult } from './lead-scoring.util';
import { deriveNextLeadStatus } from './lead-status.util';
import { parseBudgetAmount } from './budget-parser.util';
import { extractFollowUp } from './follow-up-extractor.util';
import { extractMeeting } from './meeting-extractor.util';
import type { CallAnalysisResult } from './call-analysis.types';
import type { Prisma } from '../../../generated/prisma/client';
import {
  LeadPriority,
  LeadScoreCategory,
  NotificationType,
  type LeadStatus,
} from '../../../generated/prisma/enums';

export const CALL_ANALYSIS_QUEUE = 'call-analysis';
export const ANALYZE_CALL_JOB = 'analyze-call';

/**
 * Owns the `call_analyses` table and is the single place a completed call
 * turns into: a saved analysis, a lead score, an updated Lead record, an
 * appended AI summary note, a CALL_COMPLETED activity entry, and the
 * lead.updated/lead.score.updated websocket events. Triggered by
 * CallsService.finish() enqueuing a job (see CallAnalysisProcessor) —
 * never called synchronously on the call-ending path, same reasoning as
 * RecordingsService.enqueueFetch (an LLM call is too slow to hold up the
 * webhook/mock-provider response).
 */
@Injectable()
export class CallAnalysisService {
  private readonly logger = new Logger(CallAnalysisService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: CallAnalysisLlmService,
    private readonly systemSettings: SystemSettingsService,
    private readonly activity: ActivityService,
    private readonly usersService: UsersService,
    private readonly notifications: NotificationsService,
    private readonly gateway: CallingGateway,
    @InjectQueue(CALL_ANALYSIS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Queues an analyze-call job for a call that just completed. Idempotent
   * per call (fixed jobId), same as RecordingsService.enqueueFetch. */
  async enqueueAnalysis(callId: string): Promise<void> {
    await this.queue.add(
      ANALYZE_CALL_JOB,
      { callId },
      {
        jobId: `${ANALYZE_CALL_JOB}-${callId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 10000 },
      },
    );
  }

  /** Worker entry point (see CallAnalysisProcessor). A call with no
   * transcript/messages (a MANUAL call the AI voice pipeline never touched,
   * or an AI call that hung up before saying anything) is a no-op, not an
   * error — same posture as TranscriptsService.finalize. */
  async analyze(callId: string): Promise<void> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: {
        id: true,
        leadId: true,
        createdAt: true,
        campaign: { select: { name: true } },
        lead: {
          select: {
            id: true,
            name: true,
            status: true,
            priority: true,
            assignedToId: true,
          },
        },
        recording: { select: { id: true } },
        transcript: {
          select: {
            id: true,
            messages: {
              orderBy: { timestamp: 'asc' },
              select: { speaker: true, text: true },
            },
          },
        },
      },
    });

    if (!call) {
      this.logger.warn(`Skipping analysis for unknown call ${callId}`);
      return;
    }
    if (!call.transcript || call.transcript.messages.length === 0) {
      this.logger.debug(
        `No transcript to analyze for call ${callId} — skipping`,
      );
      return;
    }

    const result = await this.llm.analyze({
      leadName: call.lead.name,
      campaignName: call.campaign.name,
      messages: call.transcript.messages,
      callDate: call.createdAt,
    });

    const scoringConfig = await this.systemSettings.getLeadScoringConfig();
    const scoring = computeLeadScore(
      {
        requirement: result.requirement,
        budget: result.budget,
        timeline: result.timeline,
        decisionMaker: result.decisionMaker,
        intent: result.intent,
        demoRequested: result.demoRequested,
      },
      scoringConfig,
    );

    const analysis = await this.saveAnalysis(callId, result, scoring);
    await this.applyToLead(call.leadId, call.lead.status, result, scoring);
    await this.appendSummaryNote(call.leadId, result);
    await this.createFollowUpIfRequested(call.leadId, result);
    await this.createMeetingIfRequested(
      call.leadId,
      call.lead.name,
      call.lead.assignedToId,
      result,
    );
    await this.notifyLeadSignals(call.leadId, call.lead, scoring);

    await this.activity.record({
      leadId: call.leadId,
      callId,
      type: 'CALL_COMPLETED',
      payload: {
        recordingId: call.recording?.id ?? null,
        transcriptId: call.transcript.id,
        callAnalysisId: analysis.id,
        summary: result.summary,
      },
    });

    this.gateway.emitLeadEvent('lead.updated', { leadId: call.leadId });
    this.gateway.emitLeadEvent('lead.score.updated', {
      leadId: call.leadId,
      leadScore: scoring.score,
      leadScoreCategory: scoring.category,
    });
  }

  private saveAnalysis(
    callId: string,
    result: CallAnalysisResult,
    scoring: LeadScoringResult,
  ) {
    const data = {
      summary: result.summary,
      requirement: result.requirement,
      budget: result.budget,
      timeline: result.timeline,
      decisionMaker: result.decisionMaker,
      intent: result.intent,
      sentiment: result.sentiment,
      demoRequested: result.demoRequested,
      objections: result.objections as unknown as Prisma.InputJsonValue,
      customerQuestions:
        result.customerQuestions as unknown as Prisma.InputJsonValue,
      nextAction: result.nextAction,
      qualityScore: result.qualityScore as unknown as Prisma.InputJsonValue,
      coachingFeedback: result.coachingFeedback,
      leadScore: scoring.score,
      leadScoreCategory: scoring.category,
    };

    return this.prisma.callAnalysis.upsert({
      where: { callId },
      create: { callId, ...data },
      update: data,
    });
  }

  private async applyToLead(
    leadId: string,
    currentStatus: LeadStatus,
    result: CallAnalysisResult,
    scoring: LeadScoringResult,
  ): Promise<void> {
    const nextStatus = deriveNextLeadStatus(currentStatus, {
      demoRequested: result.demoRequested,
      decisionMaker: result.decisionMaker,
      intent: result.intent,
      sentiment: result.sentiment,
    });
    const parsedBudget = parseBudgetAmount(result.budget);

    const data: Prisma.LeadUpdateInput = {
      status: nextStatus,
      leadScore: scoring.score,
      lastContactedAt: new Date(),
    };
    // Only overwrite requirement/budget/timeline when this call actually
    // surfaced a value — a call that didn't discuss budget shouldn't erase
    // what an earlier call (or manual entry) already captured.
    if (result.requirement) data.requirement = result.requirement;
    if (parsedBudget !== null) data.budget = parsedBudget;
    if (result.timeline) data.timeline = result.timeline;

    await this.prisma.lead.update({ where: { id: leadId }, data });
  }

  /**
   * Prompt 14 — Follow-up engine: if the transcript held a callback request
   * (see follow-up-extractor.util.ts), create the follow_ups row that later
   * puts this lead back in front of the dialer (see
   * FollowUpsService.processDue). createdBy is left null — this row was
   * created by the AI, not a person, same convention as
   * Activity.actorUserId.
   */
  private async createFollowUpIfRequested(
    leadId: string,
    result: CallAnalysisResult,
  ): Promise<void> {
    const followUp = extractFollowUp(result);
    if (!followUp) return;

    await this.prisma.followUp.create({
      data: {
        leadId,
        dueAt: followUp.dueAt,
        reason: followUp.reason,
      },
    });
  }

  /**
   * Prompt 15 — if the transcript shows a meeting/demo actually scheduled
   * for a specific time (see meeting-extractor.util.ts), create the
   * meetings row for it. Assigned to the lead's own rep when it has one;
   * an unassigned lead (nobody to put the meeting on) falls back to the
   * system user, same posture as appendSummaryNote's authorId.
   */
  private async createMeetingIfRequested(
    leadId: string,
    leadName: string,
    assignedToId: string | null,
    result: CallAnalysisResult,
  ): Promise<void> {
    const meeting = extractMeeting(result);
    if (!meeting) return;

    const salespersonId =
      assignedToId ?? (await this.usersService.ensureSystemUser()).id;

    const created = await this.prisma.meeting.create({
      data: {
        leadId,
        date: meeting.date,
        time: meeting.time,
        salespersonId,
        meetingType: meeting.meetingType,
      },
    });

    // Same posture as MeetingsService.create's own notification (Prompt
    // 19) — this path bypasses that service (writes directly, see the
    // class doc above), so it fires its own rather than skip it for
    // AI-scheduled meetings.
    await this.notifications.create({
      userId: salespersonId,
      type: NotificationType.MEETING_SCHEDULED,
      leadId,
      title: `Meeting scheduled: ${leadName}`,
      body: `AI scheduled a ${meeting.meetingType.toLowerCase()} for ${meeting.date.toDateString()} at ${meeting.time}.`,
      payload: { meetingId: created.id, meetingType: meeting.meetingType },
    });
  }

  /**
   * Prompt 19 — notifies the lead's rep (or a fallback manager) when this
   * call's scoring flags it HOT (score crosses the configured `hot`
   * threshold — see lead-scoring.util.ts) or high-value (Lead.priority
   * HIGH, or the score crosses HumanTransferConfig.highValueLeadScore —
   * the same "high value" definition HumanTransferService's live-call
   * trigger uses, kept in sync rather than inventing a second threshold).
   * Both can fire on the same call; neither is mutually exclusive with the
   * other.
   */
  private async notifyLeadSignals(
    leadId: string,
    lead: { name: string; priority: LeadPriority; assignedToId: string | null },
    scoring: LeadScoringResult,
  ): Promise<void> {
    const recipientId = await this.notifications.resolveLeadRecipient(
      lead.assignedToId,
    );
    if (!recipientId) return;

    if (scoring.category === LeadScoreCategory.HOT) {
      await this.notifications.create({
        userId: recipientId,
        type: NotificationType.HOT_LEAD,
        leadId,
        title: `Hot lead: ${lead.name}`,
        body: `Lead score ${scoring.score}/100 after this call.`,
        payload: { leadScore: scoring.score },
      });
    }

    const transferConfig = await this.systemSettings.getHumanTransferConfig();
    if (
      lead.priority === LeadPriority.HIGH ||
      scoring.score >= transferConfig.highValueLeadScore
    ) {
      await this.notifications.create({
        userId: recipientId,
        type: NotificationType.HIGH_VALUE_LEAD,
        leadId,
        title: `High-value lead: ${lead.name}`,
        body: `Flagged high-value — score ${scoring.score}/100, priority ${lead.priority}.`,
        payload: { leadScore: scoring.score, priority: lead.priority },
      });
    }
  }

  private async appendSummaryNote(
    leadId: string,
    result: CallAnalysisResult,
  ): Promise<void> {
    const systemUser = await this.usersService.ensureSystemUser();
    const body = result.nextAction
      ? `AI call summary: ${result.summary}\nNext action: ${result.nextAction}`
      : `AI call summary: ${result.summary}`;

    await this.prisma.leadNote.create({
      data: { leadId, authorId: systemUser.id, body },
    });
  }

  /** Null (not an error) when the call has no analysis yet — a call still
   * queued/retrying, or one that was skipped for having no transcript. */
  getForCall(callId: string) {
    return this.prisma.callAnalysis.findUnique({ where: { callId } });
  }

  /** Most recent analysis across all of a lead's calls, for the Lead Detail
   * page's AI Analysis panel — null if none of its calls have one yet. */
  getLatestForLead(leadId: string) {
    return this.prisma.callAnalysis.findFirst({
      where: { call: { leadId } },
      orderBy: { createdAt: 'desc' },
      include: { call: { select: { id: true, createdAt: true } } },
    });
  }

  /** Runs analyze() synchronously (not through the queue) and returns the
   * resulting row. Backs the admin-only manual re-run endpoint — useful to
   * recover a call that was skipped (no transcript at the time) or whose
   * job failed, and handy for testing locally with a seeded transcript
   * (see scripts/seed-test-transcript.ts) without waiting on a real call. */
  async reanalyze(callId: string) {
    await this.analyze(callId);
    return this.getForCall(callId);
  }
}
