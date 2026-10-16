import { Test } from '@nestjs/testing';
import { SystemSettingsController } from './system-settings.controller';
import { SystemSettingsService } from './system-settings.service';
import { DEFAULT_LEAD_SCORING_CONFIG } from './lead-scoring.config';
import { DEFAULT_COMPANY_INFO } from './company-info.config';

describe('SystemSettingsController', () => {
  let controller: SystemSettingsController;
  let settings: { get: jest.Mock; set: jest.Mock };

  beforeEach(async () => {
    settings = { get: jest.fn(), set: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      controllers: [SystemSettingsController],
      providers: [{ provide: SystemSettingsService, useValue: settings }],
    }).compile();

    controller = moduleRef.get(SystemSettingsController);
  });

  describe('get', () => {
    it('reports the known default for lead_scoring when nothing is stored', async () => {
      settings.get.mockResolvedValue(null);

      await expect(controller.get('lead_scoring')).resolves.toEqual({
        key: 'lead_scoring',
        value: DEFAULT_LEAD_SCORING_CONFIG,
      });
    });

    it('reports the known default for company when nothing is stored', async () => {
      settings.get.mockResolvedValue(null);

      await expect(controller.get('company')).resolves.toEqual({
        key: 'company',
        value: DEFAULT_COMPANY_INFO,
      });
    });

    it('reports null for an unknown key with nothing stored', async () => {
      settings.get.mockResolvedValue(null);

      await expect(controller.get('something_else')).resolves.toEqual({
        key: 'something_else',
        value: null,
      });
    });

    it('reports the stored value when present', async () => {
      settings.get.mockResolvedValue({ weights: { decisionMaker: 30 } });

      await expect(controller.get('lead_scoring')).resolves.toEqual({
        key: 'lead_scoring',
        value: { weights: { decisionMaker: 30 } },
      });
    });
  });

  describe('update', () => {
    it('persists the new value and echoes it back', async () => {
      const value = { weights: { decisionMaker: 30 } };

      await expect(
        controller.update('lead_scoring', { value }),
      ).resolves.toEqual({
        key: 'lead_scoring',
        value,
      });
      expect(settings.set).toHaveBeenCalledWith('lead_scoring', value);
    });
  });
});
