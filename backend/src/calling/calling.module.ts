import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../config/redis.module';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { SalesPlaybooksModule } from '../sales-playbooks/sales-playbooks.module';
import { UsersModule } from '../users/users.module';
import { ActivityModule } from '../activity/activity.module';
import { SystemSettingsModule } from '../system-settings/system-settings.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { CallingController } from './calling.controller';
import { CallingQueueService } from './calling-queue.service';
import { CallLockService } from './call-lock.service';
import { CallRateLimiterService } from './call-rate-limiter.service';
import { CallingGateway } from './calling.gateway';
import { DialerService, DIALER_QUEUE } from './dialer.service';
import { DialerProcessor } from './dialer.processor';
import { ManualCallService } from './manual-call.service';
import { CallsService } from './telephony/calls.service';
import { AsteriskProvider } from './telephony/asterisk.provider';
import { MockTelephonyProvider } from './telephony/mock-telephony.provider';
import { TelephonyController } from './telephony/telephony.controller';
import { TELEPHONY_PROVIDER } from './telephony/telephony-provider.token';
import type { TelephonyProvider } from './telephony/telephony-provider.interface';
import {
  RecordingsService,
  RECORDINGS_QUEUE,
} from './recordings/recordings.service';
import { RecordingsProcessor } from './recordings/recordings.processor';
import { RecordingsController } from './recordings/recordings.controller';
import { SarvamSttProvider } from './ai-voice/stt/sarvam-stt.provider';
import { STT_PROVIDER } from './ai-voice/stt/stt-provider.token';
import { SarvamTtsProvider } from './ai-voice/tts/sarvam-tts.provider';
import { TTS_PROVIDER } from './ai-voice/tts/tts-provider.token';
import { ConversationStateService } from './ai-voice/conversation-state.service';
import { IntentDetectionService } from './ai-voice/intent-detection.service';
import { KnowledgeRetrievalService } from './ai-voice/knowledge-retrieval.service';
import { LlmReasonerService } from './ai-voice/llm-reasoner.service';
import { VoiceSessionService } from './ai-voice/voice-session.service';
import { AudioSocketGateway } from './ai-voice/audiosocket.gateway';
import { TranscriptsService } from './transcripts/transcripts.service';
import { TranscriptsController } from './transcripts/transcripts.controller';
import {
  CallAnalysisService,
  CALL_ANALYSIS_QUEUE,
} from './analysis/call-analysis.service';
import { CallAnalysisProcessor } from './analysis/call-analysis.processor';
import { CallAnalysisController } from './analysis/call-analysis.controller';
import { CallAnalysisLlmService } from './analysis/call-analysis-llm.service';
import { HumanTransferService } from './human-transfer/human-transfer.service';
import { HumanTransferController } from './human-transfer/human-transfer.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
      }),
    }),
    // Reuses the app-wide Redis connection (see RedisModule) rather than
    // opening a second one — BullMQ just needs maxRetriesPerRequest: null,
    // which RedisModule's connection is already configured with.
    BullModule.forRootAsync({
      inject: [REDIS_CLIENT],
      useFactory: (connection: Redis) => ({ connection }),
    }),
    BullModule.registerQueue({ name: DIALER_QUEUE }),
    BullModule.registerQueue({ name: RECORDINGS_QUEUE }),
    BullModule.registerQueue({ name: CALL_ANALYSIS_QUEUE }),
    KnowledgeBaseModule,
    SalesPlaybooksModule,
    UsersModule,
    ActivityModule,
    SystemSettingsModule,
    NotificationsModule,
  ],
  controllers: [
    CallingController,
    TelephonyController,
    RecordingsController,
    TranscriptsController,
    CallAnalysisController,
    HumanTransferController,
  ],
  providers: [
    CallingQueueService,
    CallLockService,
    CallRateLimiterService,
    CallingGateway,
    DialerService,
    DialerProcessor,
    ManualCallService,
    CallsService,
    RecordingsService,
    RecordingsProcessor,
    AsteriskProvider,
    MockTelephonyProvider,
    {
      provide: TELEPHONY_PROVIDER,
      inject: [ConfigService, AsteriskProvider, MockTelephonyProvider],
      useFactory: (
        config: ConfigService,
        asterisk: AsteriskProvider,
        mock: MockTelephonyProvider,
      ): TelephonyProvider =>
        config.get<string>('TELEPHONY_PROVIDER') === 'asterisk'
          ? asterisk
          : mock,
    },
    // AI voice pipeline (see ./ai-voice/). STT_PROVIDER/TTS_PROVIDER follow
    // the same swap-by-token pattern as TELEPHONY_PROVIDER above — Sarvam
    // is the only implementation today, but nothing outside this factory
    // needs to change to add another and switch on config.
    SarvamSttProvider,
    SarvamTtsProvider,
    { provide: STT_PROVIDER, useExisting: SarvamSttProvider },
    { provide: TTS_PROVIDER, useExisting: SarvamTtsProvider },
    ConversationStateService,
    IntentDetectionService,
    KnowledgeRetrievalService,
    LlmReasonerService,
    VoiceSessionService,
    AudioSocketGateway,
    TranscriptsService,
    CallAnalysisService,
    CallAnalysisProcessor,
    CallAnalysisLlmService,
    HumanTransferService,
  ],
  // ManualCallService is consumed by LeadsController for POST
  // /leads/:id/call (see leads.module.ts importing this module).
  exports: [CallingQueueService, ManualCallService],
})
export class CallingModule {}
