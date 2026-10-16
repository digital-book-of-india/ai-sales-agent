import { NotFoundException } from '@nestjs/common';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { KnowledgeBaseService } from '../../knowledge-base/knowledge-base.service';

describe('KnowledgeRetrievalService', () => {
  const kbService = {
    findByAgent: jest.fn(),
  } as unknown as jest.Mocked<KnowledgeBaseService>;

  let service: KnowledgeRetrievalService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new KnowledgeRetrievalService(kbService);
  });

  const kbFixture = {
    companyInfo: { name: 'Acme' },
    products: [{ name: 'Widget Pro' }],
    services: [{ name: 'Onboarding' }],
    faqs: [
      {
        question: 'What is your refund policy?',
        answer: '30 day refund window.',
      },
      { question: 'Do you offer a demo?', answer: 'Yes, book a free demo.' },
    ],
    objections: [
      {
        objection: 'This is too expensive for us',
        recommendedResponse: 'We offer flexible plans.',
        followUpQuestion: "What's your budget range?",
        escalationRule: null,
      },
      {
        objection: 'We already use a competitor',
        recommendedResponse: 'We can run a side-by-side comparison.',
        followUpQuestion: null,
        escalationRule: null,
      },
    ],
  };

  it('returns empty knowledge when the agent has no knowledge base', async () => {
    kbService.findByAgent.mockRejectedValue(new NotFoundException());

    const result = await service.retrieve('agent-1', 'refund policy');

    expect(result).toEqual({
      companyInfo: {},
      products: [],
      services: [],
      faqs: [],
      objections: [],
    });
  });

  it('ranks FAQs by token overlap with the query', async () => {
    kbService.findByAgent.mockResolvedValue(kbFixture as never);

    const result = await service.retrieve(
      'agent-1',
      'what is your refund policy',
    );

    expect(result.faqs[0]).toEqual({
      question: 'What is your refund policy?',
      answer: '30 day refund window.',
    });
    expect(result.faqs).toHaveLength(1); // the demo FAQ shares no meaningful tokens
  });

  it('matches the relevant objection and carries its follow-up question through', async () => {
    kbService.findByAgent.mockResolvedValue(kbFixture as never);

    const result = await service.retrieve(
      'agent-1',
      'too expensive for our budget',
    );

    expect(result.objections[0].objection).toBe('This is too expensive for us');
    expect(result.objections[0].followUpQuestion).toBe(
      "What's your budget range?",
    );
  });

  it('falls back to top FAQs and skips objections when the query is empty', async () => {
    kbService.findByAgent.mockResolvedValue(kbFixture as never);

    const result = await service.retrieve('agent-1', '', 1);

    expect(result.faqs).toHaveLength(1);
    expect(result.objections).toHaveLength(0);
    expect(result.companyInfo).toEqual({ name: 'Acme' });
  });
});
