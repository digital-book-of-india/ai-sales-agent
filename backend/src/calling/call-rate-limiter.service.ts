import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.module';

const BUCKET_TTL_SECONDS = 70; // a little over a minute, covers clock drift

/** Per-campaign calls-per-minute counter, bucketed by wall-clock minute. */
@Injectable()
export class CallRateLimiterService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private key(campaignId: string, date: Date) {
    const bucket = Math.floor(date.getTime() / 60_000);
    return `rate:calling:${campaignId}:${bucket}`;
  }

  async getUsage(campaignId: string, now = new Date()): Promise<number> {
    const value = await this.redis.get(this.key(campaignId, now));
    return value ? Number(value) : 0;
  }

  /** Reserves `count` slots against this minute's budget. */
  async reserve(
    campaignId: string,
    count: number,
    now = new Date(),
  ): Promise<void> {
    if (count <= 0) return;
    const key = this.key(campaignId, now);
    const pipeline = this.redis.pipeline();
    pipeline.incrby(key, count);
    pipeline.expire(key, BUCKET_TTL_SECONDS);
    await pipeline.exec();
  }
}
