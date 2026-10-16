import { Test } from '@nestjs/testing';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';

describe('KnowledgeBaseController', () => {
  let controller: KnowledgeBaseController;
  let knowledgeBaseService: {
    findByAgent: jest.Mock;
    upsertForAgent: jest.Mock;
  };

  beforeEach(async () => {
    knowledgeBaseService = {
      findByAgent: jest.fn(),
      upsertForAgent: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [KnowledgeBaseController],
      providers: [
        { provide: KnowledgeBaseService, useValue: knowledgeBaseService },
      ],
    }).compile();

    controller = moduleRef.get(KnowledgeBaseController);
  });

  it('delegates findByAgent to the service', () => {
    void controller.findByAgent('agent-1');

    expect(knowledgeBaseService.findByAgent).toHaveBeenCalledWith('agent-1');
  });

  it('delegates upsert to the service', () => {
    const dto = { companyInfo: { name: 'Acme' } };

    void controller.upsert('agent-1', dto);

    expect(knowledgeBaseService.upsertForAgent).toHaveBeenCalledWith(
      'agent-1',
      dto,
    );
  });
});
