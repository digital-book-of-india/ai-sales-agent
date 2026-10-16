import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';

export const REDIS_CLIENT = 'REDIS_CLIENT';

// Single shared ioredis connection, reused both as the BullMQ connection
// (see CallingModule) and for the calling module's per-lead locks and
// per-campaign rate-limit counters. Upstash/hosted Redis plans cap
// concurrent connections, so one connection beats one-per-consumer.
@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) =>
        new IORedis(configService.getOrThrow<string>('REDIS_URL'), {
          maxRetriesPerRequest: null,
        }),
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}
