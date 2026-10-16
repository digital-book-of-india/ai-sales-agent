import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
} from '@nestjs/common';
import { CallsService } from './calls.service';
import { TELEPHONY_PROVIDER } from './telephony-provider.token';
import type { TelephonyProvider } from './telephony-provider.interface';

// Deliberately provider-agnostic: this route name, and everything in this
// file, is the same regardless of which provider is configured. Signature
// verification and payload parsing happen inside whichever TelephonyProvider
// is bound to TELEPHONY_PROVIDER (see calling.module.ts) — never here.
@Controller('calling/telephony')
export class TelephonyController {
  constructor(
    @Inject(TELEPHONY_PROVIDER)
    private readonly provider: TelephonyProvider,
    private readonly callsService: CallsService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Body() payload: unknown,
    @Headers('x-webhook-signature') headerSignature?: string,
    @Query('token') queryToken?: string,
  ) {
    const signature = headerSignature ?? queryToken;
    const event = this.provider.handleWebhook(payload, signature);

    await this.callsService.applyStatusUpdate(event.providerCallId, {
      status: event.status,
      duration: event.duration,
      recordingUrl: event.recordingUrl,
    });

    return { received: true };
  }
}
