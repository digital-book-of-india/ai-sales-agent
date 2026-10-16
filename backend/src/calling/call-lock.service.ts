import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { REDIS_CLIENT } from '../config/redis.module';

const LOCK_TTL_MS = 5 * 60_000; // longer than any realistic single call

const RELEASE_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`;

/**
 * Redis lock keyed on leadId. Backstops the DB unique constraint on
 * (campaignId, leadId): two campaigns could otherwise both hold a
 * QUEUED/RETRY row for the same lead and dial it at the same time.
 */
@Injectable()
export class CallLockService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(leadId: string) {
    return `lock:calling:lead:${leadId}`;
  }

  /** Returns a lock token on success, or null if another dial holds it. */
  async acquire(leadId: string): Promise<string | null> {
    const token = randomUUID();
    const result = await this.redis.set(
      this.key(leadId),
      token,
      'PX',
      LOCK_TTL_MS,
      'NX',
    );
    return result === 'OK' ? token : null;
  }

  async release(leadId: string, token: string): Promise<void> {
    await this.redis.eval(RELEASE_SCRIPT, 1, this.key(leadId), token);
  }
}
