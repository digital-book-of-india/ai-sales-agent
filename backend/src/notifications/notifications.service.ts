import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Role, type NotificationType } from '../../generated/prisma/enums';
import type { Prisma } from '../../generated/prisma/client';
import { NotificationsGateway } from './notifications.gateway';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  leadId?: string;
  callId?: string;
  payload?: Record<string, unknown>;
}

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  payload: true,
  leadId: true,
  callId: true,
  readAt: true,
  createdAt: true,
} satisfies Prisma.NotificationSelect;

export type NotificationRow = Prisma.NotificationGetPayload<{
  select: typeof NOTIFICATION_SELECT;
}>;

/**
 * Owns the `notifications` table — a per-user in-app inbox. Written by every
 * feature service that has a notification-worthy event (see NotificationType
 * in schema.prisma for the full producer list), but kept as its own module
 * (not folded into any one of them) since a notification is a
 * general-purpose concept several unrelated features produce, same posture
 * as ActivityModule.
 */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: NotificationsGateway,
  ) {}

  /** Writes the row and pushes it over the /notifications websocket in the
   * same call — every producer gets real-time delivery for free through
   * this one choke point, rather than each one wiring its own event (see
   * NotificationsGateway). */
  async create(input: CreateNotificationInput): Promise<NotificationRow> {
    const notification = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        leadId: input.leadId,
        callId: input.callId,
        payload: (input.payload ?? {}) as never,
      },
      select: NOTIFICATION_SELECT,
    });
    this.gateway.emit(input.userId, notification);
    return notification;
  }

  /** Who a lead-scoped notification should go to: the lead's own rep if it
   * has one, otherwise any sales manager (deterministic — by name), so a
   * lead sitting unassigned never leaves a hot/high-value/due signal with
   * nowhere to land. Same fallback HumanTransferService.resolveTarget uses
   * for the live-call handoff, minus the SIP-extension requirement — this
   * is just an inbox entry, not something that has to ring a phone. Null
   * only when there is truly no one to notify (no rep, no manager in the
   * system yet). */
  async resolveLeadRecipient(
    assignedToId: string | null,
  ): Promise<string | null> {
    if (assignedToId) return assignedToId;

    const manager = await this.prisma.user.findFirst({
      where: { role: Role.SALES_MANAGER },
      orderBy: { name: 'asc' },
      select: { id: true },
    });
    return manager?.id ?? null;
  }

  /** For events with no single natural owner — a campaign finishing, a
   * failed-calls threshold — fans one notification out to every manager and
   * admin rather than picking one arbitrarily. */
  async notifyManagers(
    input: Omit<CreateNotificationInput, 'userId'>,
  ): Promise<void> {
    const recipients = await this.prisma.user.findMany({
      where: { role: { in: [Role.SALES_MANAGER, Role.ADMIN] } },
      select: { id: true },
    });
    await Promise.all(
      recipients.map((recipient) =>
        this.create({ ...input, userId: recipient.id }),
      ),
    );
  }

  /** Newest-first, scoped to one user — a notification is only ever visible
   * to the person it was created for. */
  listForUser(
    userId: string,
    options: { unreadOnly?: boolean; limit?: number },
  ) {
    return this.prisma.notification.findMany({
      where: {
        userId,
        ...(options.unreadOnly ? { readAt: null } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: options.limit ?? 20,
      select: NOTIFICATION_SELECT,
    });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  /** No-op (not an error) if it's already read — matches FollowUpsService's
   * idempotent-complete posture. Throws if the notification doesn't belong
   * to this user, same as it not existing — never leaks whether some other
   * user's notification id is valid. */
  async markRead(userId: string, id: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
      select: { id: true, userId: true, readAt: true },
    });
    if (!notification || notification.userId !== userId) {
      throw new NotFoundException(`Notification ${id} not found`);
    }
    if (notification.readAt) return notification;

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date() },
      select: NOTIFICATION_SELECT,
    });
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
