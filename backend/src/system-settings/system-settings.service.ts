import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_LEAD_SCORING_CONFIG,
  LEAD_SCORING_SETTINGS_KEY,
  type LeadScoringConfig,
} from './lead-scoring.config';
import {
  DEFAULT_HUMAN_TRANSFER_CONFIG,
  HUMAN_TRANSFER_SETTINGS_KEY,
  type HumanTransferConfig,
} from './human-transfer.config';
import {
  DEFAULT_NOTIFICATIONS_CONFIG,
  NOTIFICATIONS_SETTINGS_KEY,
  type NotificationsConfig,
} from './notifications.config';
import {
  COMPANY_SETTINGS_KEY,
  DEFAULT_COMPANY_INFO,
  type CompanyInfo,
} from './company-info.config';
import {
  CALLING_SETTINGS_KEY,
  DEFAULT_CALLING_SETTINGS,
  type CallingSettings,
} from './calling-settings.config';
import {
  AI_SETTINGS_KEY,
  DEFAULT_AI_SETTINGS,
  type AiSettings,
} from './ai-settings.config';
import {
  DEFAULT_SALES_SETTINGS,
  SALES_SETTINGS_KEY,
  type SalesSettings,
} from './sales-settings.config';

/**
 * Owns the generic `system_settings` key/value store — admin-editable
 * config that shouldn't need a migration to tune (see SystemSetting in
 * schema.prisma). Each key's value shape is defined by whoever reads it;
 * this service itself stays untyped except for the one convenience method
 * below (getLeadScoringConfig), since lead scoring is the only consumer so
 * far.
 */
@Injectable()
export class SystemSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get<T>(key: string): Promise<T | null> {
    const row = await this.prisma.systemSetting.findUnique({ where: { key } });
    return (row?.value as T | undefined) ?? null;
  }

  async set(key: string, value: unknown): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });
  }

  /** Merges whatever's stored under lead_scoring over the defaults, one
   * level deep per sub-object — so an admin can override a single weight or
   * threshold (e.g. just `{ weights: { decisionMaker: 20 } }`) without
   * having to restate the whole config. */
  async getLeadScoringConfig(): Promise<LeadScoringConfig> {
    const stored = await this.get<Partial<LeadScoringConfig>>(
      LEAD_SCORING_SETTINGS_KEY,
    );
    if (!stored) return DEFAULT_LEAD_SCORING_CONFIG;

    return {
      weights: {
        ...DEFAULT_LEAD_SCORING_CONFIG.weights,
        ...stored.weights,
      },
      thresholds: {
        ...DEFAULT_LEAD_SCORING_CONFIG.thresholds,
        ...stored.thresholds,
      },
    };
  }

  /** Merges whatever's stored under human_transfer over the defaults — every
   * field here is a top-level scalar/array, so (unlike lead_scoring's nested
   * weights/thresholds) a flat spread is enough for an admin to override
   * just one field. */
  async getHumanTransferConfig(): Promise<HumanTransferConfig> {
    const stored = await this.get<Partial<HumanTransferConfig>>(
      HUMAN_TRANSFER_SETTINGS_KEY,
    );
    if (!stored) return DEFAULT_HUMAN_TRANSFER_CONFIG;

    return { ...DEFAULT_HUMAN_TRANSFER_CONFIG, ...stored };
  }

  /** Merges whatever's stored under notifications over the defaults — same
   * flat-scalar posture as getHumanTransferConfig. */
  async getNotificationsConfig(): Promise<NotificationsConfig> {
    const stored = await this.get<Partial<NotificationsConfig>>(
      NOTIFICATIONS_SETTINGS_KEY,
    );
    if (!stored) return DEFAULT_NOTIFICATIONS_CONFIG;

    return { ...DEFAULT_NOTIFICATIONS_CONFIG, ...stored };
  }

  /** Merges whatever's stored under company over the defaults — businessHours
   * is the one nested object here, so (like getLeadScoringConfig) it gets
   * merged one level deep rather than replaced wholesale. */
  async getCompanyInfo(): Promise<CompanyInfo> {
    const stored = await this.get<Partial<CompanyInfo>>(COMPANY_SETTINGS_KEY);
    if (!stored) return DEFAULT_COMPANY_INFO;

    return {
      ...DEFAULT_COMPANY_INFO,
      ...stored,
      businessHours: {
        ...DEFAULT_COMPANY_INFO.businessHours,
        ...stored.businessHours,
      },
    };
  }

  /** Merges whatever's stored under calling over the defaults — every field
   * is a flat scalar, same posture as getHumanTransferConfig. */
  async getCallingSettings(): Promise<CallingSettings> {
    const stored =
      await this.get<Partial<CallingSettings>>(CALLING_SETTINGS_KEY);
    if (!stored) return DEFAULT_CALLING_SETTINGS;

    return { ...DEFAULT_CALLING_SETTINGS, ...stored };
  }

  /** Merges whatever's stored under ai over the defaults — same flat-scalar
   * posture as getHumanTransferConfig. */
  async getAiSettings(): Promise<AiSettings> {
    const stored = await this.get<Partial<AiSettings>>(AI_SETTINGS_KEY);
    if (!stored) return DEFAULT_AI_SETTINGS;

    return { ...DEFAULT_AI_SETTINGS, ...stored };
  }

  /** Merges whatever's stored under sales over the defaults — followUpRules
   * is the one nested object, merged one level deep like getCompanyInfo. */
  async getSalesSettings(): Promise<SalesSettings> {
    const stored = await this.get<Partial<SalesSettings>>(SALES_SETTINGS_KEY);
    if (!stored) return DEFAULT_SALES_SETTINGS;

    return {
      followUpRules: {
        ...DEFAULT_SALES_SETTINGS.followUpRules,
        ...stored.followUpRules,
      },
    };
  }
}
