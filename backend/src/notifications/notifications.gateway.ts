import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/types/auth.types';
import type { NotificationRow } from './notifications.service';

// Emitted whenever NotificationsService.create() writes a row — the one
// event name every notification type rides on; the frontend bell switches
// on payload.type to decide how to render it, same posture as
// AppNotification on the frontend not needing a per-type event.
export type NotificationEventName = 'notification.created';

/**
 * Dedicated /notifications websocket namespace, separate from
 * CallingGateway's /calling namespace — a notification (lead scoring,
 * follow-ups, deals, ...) has nothing to do with the live-call pipeline
 * CallingGateway serves, and every consumer of it (NotificationsService)
 * already lives in this module.
 *
 * Unlike CallingGateway's broadcast-and-filter-client-side events (see e.g.
 * emitHumanTransferEvent), this gateway joins each socket to a room keyed
 * by its own user id at connection time and only ever emits into that one
 * room — a notification's payload can carry another rep's lead/deal
 * details, so it must never reach a socket it isn't for.
 */
@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: true, credentials: true },
})
export class NotificationsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(NotificationsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }

    try {
      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      void client.join(this.room(payload.sub));
    } catch {
      this.logger.warn(
        `Rejected notifications socket ${client.id}: invalid token`,
      );
      client.disconnect(true);
    }
  }

  private extractToken(client: Socket): string | null {
    const fromAuth = client.handshake.auth?.token as string | undefined;
    if (fromAuth) return fromAuth;

    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7);

    return null;
  }

  private room(userId: string): string {
    return `user:${userId}`;
  }

  emit(userId: string, notification: NotificationRow): void {
    this.server
      .to(this.room(userId))
      .emit(
        'notification.created' satisfies NotificationEventName,
        notification,
      );
  }
}
