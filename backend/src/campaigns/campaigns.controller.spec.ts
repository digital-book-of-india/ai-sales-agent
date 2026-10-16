import { Test } from '@nestjs/testing';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';

describe('CampaignsController', () => {
  let controller: CampaignsController;
  let campaignsService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
    duplicate: jest.Mock;
    start: jest.Mock;
    pause: jest.Mock;
    resume: jest.Mock;
    stop: jest.Mock;
    stats: jest.Mock;
  };

  beforeEach(async () => {
    campaignsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      duplicate: jest.fn(),
      start: jest.fn(),
      pause: jest.fn(),
      resume: jest.fn(),
      stop: jest.fn(),
      stats: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [CampaignsController],
      providers: [{ provide: CampaignsService, useValue: campaignsService }],
    }).compile();

    controller = moduleRef.get(CampaignsController);
  });

  it('delegates findAll to the service', () => {
    void controller.findAll({});

    expect(campaignsService.findAll).toHaveBeenCalledWith({});
  });

  it('delegates create to the service', () => {
    const dto = { name: 'Diwali Outreach' };

    void controller.create(dto);

    expect(campaignsService.create).toHaveBeenCalledWith(dto);
  });

  it('delegates update to the service', () => {
    const dto = { name: 'Diwali Outreach v2' };

    void controller.update('campaign-1', dto);

    expect(campaignsService.update).toHaveBeenCalledWith('campaign-1', dto);
  });

  it('delegates remove to the service', () => {
    void controller.remove('campaign-1');

    expect(campaignsService.remove).toHaveBeenCalledWith('campaign-1');
  });

  it('delegates duplicate to the service', () => {
    void controller.duplicate('campaign-1');

    expect(campaignsService.duplicate).toHaveBeenCalledWith('campaign-1');
  });

  it.each(['start', 'pause', 'resume', 'stop'] as const)(
    'delegates %s to the service',
    (action) => {
      void controller[action]('campaign-1');

      expect(campaignsService[action]).toHaveBeenCalledWith('campaign-1');
    },
  );

  it('delegates stats to the service', () => {
    void controller.stats('campaign-1');

    expect(campaignsService.stats).toHaveBeenCalledWith('campaign-1');
  });
});
