import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface RecordActivityInput {
  leadId: string;
  callId?: string;
  type: string;
  payload?: Record<string, unknown>;
  /** Omit for system-generated entries (e.g. CALL_COMPLETED) — null reads
   * as "the system did this", not a missing value. */
  actorUserId?: string;
}

/**
 * Owns the `activities` table — an append-only audit trail/timeline scoped
 * to a lead (see Lead Detail page's "Activity timeline"). No update/delete:
 * callers that got something wrong record a new entry rather than editing
 * history.
 */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: RecordActivityInput) {
    return this.prisma.activity.create({
      data: {
        leadId: input.leadId,
        callId: input.callId,
        type: input.type,
        payload: (input.payload ?? {}) as never,
        actorUserId: input.actorUserId,
      },
    });
  }

  listForLead(leadId: string) {
    return this.prisma.activity.findMany({
      where: { leadId },
      orderBy: { createdAt: 'desc' },
      include: { actorUser: { select: { id: true, name: true } } },
    });
  }
}
