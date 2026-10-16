import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { SystemSettingsService } from './system-settings.service';
import { UpdateSystemSettingDto } from './dto/update-system-setting.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../../generated/prisma/enums';
import { DEFAULT_LEAD_SCORING_CONFIG } from './lead-scoring.config';
import { DEFAULT_HUMAN_TRANSFER_CONFIG } from './human-transfer.config';
import { DEFAULT_NOTIFICATIONS_CONFIG } from './notifications.config';
import { DEFAULT_COMPANY_INFO } from './company-info.config';
import { DEFAULT_CALLING_SETTINGS } from './calling-settings.config';
import { DEFAULT_AI_SETTINGS } from './ai-settings.config';
import { DEFAULT_SALES_SETTINGS } from './sales-settings.config';

// Every key defaults to something sensible (see lead-scoring.config.ts /
// human-transfer.config.ts / notifications.config.ts / company-info.config.ts
// / calling-settings.config.ts / ai-settings.config.ts /
// sales-settings.config.ts), so GET never 404s — an unset key just reports
// its default, same value the owning service would actually use.
const DEFAULTS: Record<string, unknown> = {
  lead_scoring: DEFAULT_LEAD_SCORING_CONFIG,
  human_transfer: DEFAULT_HUMAN_TRANSFER_CONFIG,
  notifications: DEFAULT_NOTIFICATIONS_CONFIG,
  company: DEFAULT_COMPANY_INFO,
  calling: DEFAULT_CALLING_SETTINGS,
  ai: DEFAULT_AI_SETTINGS,
  sales: DEFAULT_SALES_SETTINGS,
};

@Controller('system-settings')
@Roles(Role.ADMIN)
export class SystemSettingsController {
  constructor(private readonly settings: SystemSettingsService) {}

  @Get(':key')
  async get(@Param('key') key: string) {
    const value = await this.settings.get(key);
    return { key, value: value ?? DEFAULTS[key] ?? null };
  }

  @Patch(':key')
  async update(@Param('key') key: string, @Body() dto: UpdateSystemSettingDto) {
    await this.settings.set(key, dto.value);
    return { key, value: dto.value };
  }
}
