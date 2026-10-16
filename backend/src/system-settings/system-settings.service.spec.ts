import { Test } from '@nestjs/testing';
import { SystemSettingsService } from './system-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_LEAD_SCORING_CONFIG } from './lead-scoring.config';
import { DEFAULT_NOTIFICATIONS_CONFIG } from './notifications.config';
import { DEFAULT_COMPANY_INFO } from './company-info.config';
import { DEFAULT_CALLING_SETTINGS } from './calling-settings.config';
import { DEFAULT_AI_SETTINGS } from './ai-settings.config';
import { DEFAULT_SALES_SETTINGS } from './sales-settings.config';

describe('SystemSettingsService', () => {
  let service: SystemSettingsService;
  let prisma: {
    systemSetting: { findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      systemSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        SystemSettingsService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = moduleRef.get(SystemSettingsService);
  });

  describe('get', () => {
    it('returns null when the key has never been set', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      await expect(service.get('anything')).resolves.toBeNull();
    });

    it('returns the stored value', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        value: { foo: 'bar' },
      });
      await expect(service.get('anything')).resolves.toEqual({ foo: 'bar' });
    });
  });

  describe('set', () => {
    it('upserts the key/value pair', async () => {
      await service.set('lead_scoring', { weights: { decisionMaker: 30 } });

      expect(prisma.systemSetting.upsert).toHaveBeenCalledWith({
        where: { key: 'lead_scoring' },
        create: {
          key: 'lead_scoring',
          value: { weights: { decisionMaker: 30 } },
        },
        update: { value: { weights: { decisionMaker: 30 } } },
      });
    });
  });

  describe('getLeadScoringConfig', () => {
    it('falls back to the full default config when nothing is stored', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      await expect(service.getLeadScoringConfig()).resolves.toEqual(
        DEFAULT_LEAD_SCORING_CONFIG,
      );
    });

    it('merges a partial override one level deep over the defaults', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        value: { weights: { decisionMaker: 30 } },
      });

      const config = await service.getLeadScoringConfig();

      expect(config.weights).toEqual({
        ...DEFAULT_LEAD_SCORING_CONFIG.weights,
        decisionMaker: 30,
      });
      expect(config.thresholds).toEqual(DEFAULT_LEAD_SCORING_CONFIG.thresholds);
    });
  });

  describe('getNotificationsConfig', () => {
    it('falls back to the default config when nothing is stored', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      await expect(service.getNotificationsConfig()).resolves.toEqual(
        DEFAULT_NOTIFICATIONS_CONFIG,
      );
    });

    it('merges a stored override over the defaults', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        value: { failedCallsThreshold: 10 },
      });

      await expect(service.getNotificationsConfig()).resolves.toEqual({
        failedCallsThreshold: 10,
      });
    });
  });

  describe('getCompanyInfo', () => {
    it('falls back to the default company info when nothing is stored', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      await expect(service.getCompanyInfo()).resolves.toEqual(
        DEFAULT_COMPANY_INFO,
      );
    });

    it('merges a partial override one level deep over the defaults', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        value: { name: 'Acme', businessHours: { opensAt: '10:00' } },
      });

      const info = await service.getCompanyInfo();

      expect(info.name).toBe('Acme');
      expect(info.businessHours).toEqual({
        ...DEFAULT_COMPANY_INFO.businessHours,
        opensAt: '10:00',
      });
    });
  });

  describe('getCallingSettings', () => {
    it('falls back to the default calling settings when nothing is stored', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      await expect(service.getCallingSettings()).resolves.toEqual(
        DEFAULT_CALLING_SETTINGS,
      );
    });

    it('merges a stored override over the defaults', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        value: { concurrentCalls: 5 },
      });

      await expect(service.getCallingSettings()).resolves.toEqual({
        ...DEFAULT_CALLING_SETTINGS,
        concurrentCalls: 5,
      });
    });
  });

  describe('getAiSettings', () => {
    it('falls back to the default AI settings when nothing is stored', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      await expect(service.getAiSettings()).resolves.toEqual(
        DEFAULT_AI_SETTINGS,
      );
    });

    it('merges a stored override over the defaults', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        value: { defaultLanguage: 'hi-IN' },
      });

      await expect(service.getAiSettings()).resolves.toEqual({
        ...DEFAULT_AI_SETTINGS,
        defaultLanguage: 'hi-IN',
      });
    });
  });

  describe('getSalesSettings', () => {
    it('falls back to the default sales settings when nothing is stored', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue(null);
      await expect(service.getSalesSettings()).resolves.toEqual(
        DEFAULT_SALES_SETTINGS,
      );
    });

    it('merges a partial followUpRules override one level deep over the defaults', async () => {
      prisma.systemSetting.findUnique.mockResolvedValue({
        value: { followUpRules: { defaultDueInHours: 48 } },
      });

      await expect(service.getSalesSettings()).resolves.toEqual({
        followUpRules: {
          ...DEFAULT_SALES_SETTINGS.followUpRules,
          defaultDueInHours: 48,
        },
      });
    });
  });
});
