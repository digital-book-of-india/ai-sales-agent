import { plainToInstance } from 'class-transformer';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  @IsString()
  @IsNotEmpty()
  REDIS_URL: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET: string;

  @IsOptional()
  @IsString()
  PORT?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsString()
  JWT_ACCESS_TOKEN_TTL?: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_TOKEN_TTL_DAYS?: string;

  @IsOptional()
  @IsString()
  PASSWORD_RESET_TOKEN_TTL_MINUTES?: string;

  // Telephony (see backend/src/calling/telephony/). 'mock' (default) needs
  // no credentials and simulates call outcomes locally, same as the old
  // CallProviderService did — set to 'asterisk' only once the ASTERISK_*/
  // AUDIOSOCKET_* vars below are filled in and infra/asterisk/ has been
  // deployed (see infra/asterisk/README.md).
  @IsOptional()
  @IsString()
  TELEPHONY_PROVIDER?: string;

  @IsOptional()
  @IsString()
  ASTERISK_AMI_HOST?: string;

  @IsOptional()
  @IsString()
  ASTERISK_AMI_PORT?: string;

  @IsOptional()
  @IsString()
  ASTERISK_AMI_USERNAME?: string;

  @IsOptional()
  @IsString()
  ASTERISK_AMI_PASSWORD?: string;

  @IsOptional()
  @IsString()
  ASTERISK_CALLER_ID?: string;

  @IsOptional()
  @IsString()
  ASTERISK_ORIGINATE_TIMEOUT_MS?: string;

  @IsOptional()
  @IsString()
  ASTERISK_RECORDINGS_BASE_URL?: string;

  @IsOptional()
  @IsString()
  ASTERISK_RECORDINGS_SECRET?: string;

  @IsOptional()
  @IsString()
  ASTERISK_RECORDINGS_TTL_SECONDS?: string;

  @IsOptional()
  @IsString()
  ASTERISK_SERVER_IPS?: string;

  @IsOptional()
  @IsString()
  AUDIOSOCKET_HOST?: string;

  @IsOptional()
  @IsString()
  AUDIOSOCKET_PORT?: string;

  // Browser-based WebRTC softphone (SIP.js over WSS — see
  // backend/src/users/users.service.ts getSipCredentials() and
  // frontend/src/calling/softphone.ts). Unset in local/mock dev; required
  // once TELEPHONY_PROVIDER=asterisk and reps need click-to-call.
  @IsOptional()
  @IsString()
  ASTERISK_WSS_URI?: string;

  @IsOptional()
  @IsString()
  ASTERISK_SIP_DOMAIN?: string;

  // Real-time AI voice pipeline (see backend/src/calling/ai-voice/).
  // ANTHROPIC_API_KEY is read directly by the Anthropic SDK — unset is only
  // an error if no `ant auth login` profile is active either.
  @IsOptional()
  @IsString()
  ANTHROPIC_API_KEY?: string;

  @IsOptional()
  @IsString()
  AI_VOICE_LLM_MODEL?: string;

  @IsOptional()
  @IsString()
  AI_VOICE_LLM_EFFORT?: string;

  @IsOptional()
  @IsString()
  AI_VOICE_SAMPLE_RATE_HZ?: string;

  @IsOptional()
  @IsString()
  SARVAM_API_KEY?: string;

  @IsOptional()
  @IsString()
  SARVAM_STT_WS_URL?: string;

  @IsOptional()
  @IsString()
  SARVAM_STT_MODEL?: string;

  @IsOptional()
  @IsString()
  SARVAM_TTS_WS_URL?: string;

  @IsOptional()
  @IsString()
  SARVAM_TTS_MODEL?: string;

  @IsOptional()
  @IsString()
  SARVAM_TTS_VOICE?: string;

  @IsOptional()
  @IsString()
  SARVAM_TTS_SAMPLE_RATE?: string;

  // Recording playback/download links (see backend/src/calling/recordings/).
  // RECORDING_URL_SECRET signs the short-lived query params on
  // /calling/recordings/:id/stream; falls back to JWT_SECRET when unset.
  // RECORDING_URL_TTL_SECONDS controls how long a minted link stays valid
  // (default 300s).
  @IsOptional()
  @IsString()
  RECORDING_URL_SECRET?: string;

  @IsOptional()
  @IsString()
  RECORDING_URL_TTL_SECONDS?: string;

  // Post-call analysis worker (see backend/src/calling/analysis/). Reuses
  // ANTHROPIC_API_KEY above. Defaults to claude-opus-5 at "medium" effort —
  // unlike the live-call reasoner this isn't latency-critical, so it can
  // afford more reasoning depth than AI_VOICE_LLM_EFFORT's "low" default.
  @IsOptional()
  @IsString()
  POST_CALL_ANALYSIS_LLM_MODEL?: string;

  @IsOptional()
  @IsString()
  POST_CALL_ANALYSIS_LLM_EFFORT?: string;
}

export function validateEnv(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    throw new Error(
      `Missing/invalid environment variables:\n${errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('\n')}`,
    );
  }

  return validatedConfig;
}
