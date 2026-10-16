import { randomUUID } from 'crypto';
import { ConflictException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { Role } from '../../generated/prisma/enums';

// Never a real login — this account exists purely so AI-generated content
// (like CallAnalysisService's post-call lead notes) has a real User row to
// satisfy LeadNote.authorId, which the schema requires non-null. Its
// password hash is random and never surfaced anywhere a person could use it.
const SYSTEM_USER_EMAIL = 'ai-analysis@system.internal';
const SYSTEM_USER_BCRYPT_ROUNDS = 12;

export interface SipCredentials {
  extension: string;
  password: string;
  /** e.g. "sip:1001@pbx.example.com" — what the softphone registers as. */
  uri: string;
  /** Empty when ASTERISK_WSS_URI isn't configured (local/mock dev) — the
   * frontend treats that as "softphone unavailable" rather than erroring. */
  wsServers: string[];
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  // Feeds every assignee dropdown across the app (leads, tasks, deals,
  // meetings, pipeline) — deactivated users (see TeamService.deactivate) are
  // excluded so nothing new gets assigned to an account that can no longer
  // log in. The full roster including inactive members is TeamService.list's
  // job, not this one.
  findAllBasic() {
    return this.prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }

  create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role?: Role;
  }) {
    return this.prisma.user.create({ data });
  }

  updatePasswordHash(id: string, passwordHash: string) {
    return this.prisma.user.update({ where: { id }, data: { passwordHash } });
  }

  /** Backs GET /users/me/sip-credentials — what the browser softphone
   * (SIP.js, see frontend/src/calling/softphone.ts) needs to register over
   * WSS. Scoped to the caller's own id only; never exposed on the
   * find-all/find-one endpoints other users can see. */
  async getSipCredentials(id: string): Promise<SipCredentials> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { sipExtension: true, sipPassword: true },
    });
    if (!user?.sipExtension || !user.sipPassword) {
      throw new ConflictException(
        'No SIP extension registered for your account — ask an admin to set one up',
      );
    }

    const domain = this.config.get<string>('ASTERISK_SIP_DOMAIN');
    const wssUri = this.config.get<string>('ASTERISK_WSS_URI');

    return {
      extension: user.sipExtension,
      password: user.sipPassword,
      uri: `sip:${user.sipExtension}@${domain ?? 'unconfigured.invalid'}`,
      wsServers: wssUri ? [wssUri] : [],
    };
  }

  /** Finds or lazily creates the system user (see SYSTEM_USER_EMAIL above).
   * Called by CallAnalysisService before appending an AI-generated summary
   * to a lead's notes — never anywhere a person could log in as it. */
  async ensureSystemUser(): Promise<{ id: string }> {
    const existing = await this.prisma.user.findUnique({
      where: { email: SYSTEM_USER_EMAIL },
      select: { id: true },
    });
    if (existing) return existing;

    const passwordHash = await bcrypt.hash(
      randomUUID(),
      SYSTEM_USER_BCRYPT_ROUNDS,
    );
    return this.prisma.user.create({
      data: {
        name: 'AI Analysis',
        email: SYSTEM_USER_EMAIL,
        passwordHash,
        role: Role.ADMIN,
      },
      select: { id: true },
    });
  }
}
