import { Test } from '@nestjs/testing';
import { AiAgentsController } from './ai-agents.controller';
import { AiAgentsService } from './ai-agents.service';

describe('AiAgentsController', () => {
  let controller: AiAgentsController;
  let aiAgentsService: {
    findAll: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    remove: jest.Mock;
  };

  beforeEach(async () => {
    aiAgentsService = {
      findAll: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AiAgentsController],
      providers: [{ provide: AiAgentsService, useValue: aiAgentsService }],
    }).compile();

    controller = moduleRef.get(AiAgentsController);
  });

  it('delegates findAll to the service', () => {
    void controller.findAll({});

    expect(aiAgentsService.findAll).toHaveBeenCalledWith({});
  });

  it('delegates findOne to the service', () => {
    void controller.findOne('agent-1');

    expect(aiAgentsService.findOne).toHaveBeenCalledWith('agent-1');
  });

  it('delegates create to the service', () => {
    const dto = { name: 'Riya' };

    void controller.create(dto);

    expect(aiAgentsService.create).toHaveBeenCalledWith(dto);
  });

  it('delegates update to the service', () => {
    const dto = { name: 'Riya v2' };

    void controller.update('agent-1', dto);

    expect(aiAgentsService.update).toHaveBeenCalledWith('agent-1', dto);
  });

  it('delegates remove to the service', () => {
    void controller.remove('agent-1');

    expect(aiAgentsService.remove).toHaveBeenCalledWith('agent-1');
  });
});
