import { ConfigService } from '@nestjs/config';
import type Anthropic from '@anthropic-ai/sdk';
import { LlmReasonerService, type ReasonInput } from './llm-reasoner.service';

/** Minimal fake of the object returned by client.messages.stream(...) —
 * only the surface LlmReasonerService actually uses (.on('text', cb) and
 * .finalMessage()). */
function fakeStream(textDeltas: string[], finalMessage: unknown) {
  return {
    on: (event: string, cb: (delta: string) => void) => {
      if (event === 'text') {
        for (const delta of textDeltas) cb(delta);
      }
    },
    finalMessage: () => Promise.resolve(finalMessage as Anthropic.Message),
  };
}

function baseInput(overrides: Partial<ReasonInput> = {}): ReasonInput {
  return {
    agent: {
      name: 'Riya',
      personality: 'friendly',
      objective: 'qualify the lead',
    },
    playbookQuestions: [
      {
        id: 'q1',
        question: 'What is your budget?',
        purpose: null,
        expectedInfo: null,
      },
      {
        id: 'q2',
        question: 'When do you need this?',
        purpose: null,
        expectedInfo: null,
      },
    ],
    answeredQuestionIds: [],
    qualificationRules: {},
    objectionHandling: {},
    closingRules: {},
    knowledge: {
      companyInfo: {},
      products: [],
      services: [],
      faqs: [],
      objections: [],
    },
    conversation: [],
    customerUtterance: 'Hi, tell me about your product',
    detectedLanguageCode: 'en-IN',
    ...overrides,
  };
}

describe('LlmReasonerService', () => {
  const config = { get: jest.fn() } as unknown as ConfigService;

  it('streams reply text deltas and parses the structured tool outcome', async () => {
    const client = {
      messages: {
        stream: jest.fn().mockReturnValue(
          fakeStream(['Sure, ', 'we can help with that.'], {
            content: [
              { type: 'text', text: 'Sure, we can help with that.' },
              {
                type: 'tool_use',
                id: 'tool_1',
                name: 'record_turn_outcome',
                input: {
                  languageCode: 'en-IN',
                  coveredQuestionIds: [],
                  askedQuestionId: 'q1',
                  action: 'continue',
                  groundedInKnowledgeBase: true,
                  confidence: 0.9,
                },
              },
            ],
            stop_reason: 'tool_use',
          }),
        ),
      },
    } as unknown as Anthropic;

    const service = new LlmReasonerService(config, client);
    const deltas: string[] = [];

    const outcome = await service.reason(baseInput(), {
      onReplyTextDelta: (delta) => deltas.push(delta),
    });

    expect(deltas.join('')).toBe('Sure, we can help with that.');
    expect(outcome).toEqual({
      replyText: 'Sure, we can help with that.',
      languageCode: 'en-IN',
      coveredQuestionIds: [],
      askedQuestionId: 'q1',
      action: 'continue',
      groundedInKnowledgeBase: true,
      confidence: 0.9,
    });
  });

  it('falls back to a safe default when the model does not call the tool', async () => {
    const client = {
      messages: {
        stream: jest.fn().mockReturnValue(
          fakeStream(['Umm, okay.'], {
            content: [{ type: 'text', text: 'Umm, okay.' }],
            stop_reason: 'end_turn',
          }),
        ),
      },
    } as unknown as Anthropic;

    const service = new LlmReasonerService(config, client);
    const outcome = await service.reason(baseInput(), {
      onReplyTextDelta: () => {},
    });

    expect(outcome.replyText).toBe('Umm, okay.');
    expect(outcome.action).toBe('continue');
    expect(outcome.groundedInKnowledgeBase).toBe(false);
    expect(outcome.coveredQuestionIds).toEqual([]);
    expect(outcome.confidence).toBe(0);
  });

  it('falls back to a scripted apology when the API call fails', async () => {
    const client = {
      messages: {
        stream: jest.fn().mockImplementation(() => {
          throw new Error('network error');
        }),
      },
    } as unknown as Anthropic;

    const service = new LlmReasonerService(config, client);
    const outcome = await service.reason(
      baseInput({ detectedLanguageCode: 'hi-IN' }),
      {
        onReplyTextDelta: () => {},
      },
    );

    expect(outcome.replyText).toMatch(/didn't quite catch/i);
    expect(outcome.languageCode).toBe('hi-IN');
    expect(outcome.action).toBe('continue');
    expect(outcome.confidence).toBe(0);
  });

  it('surfaces a transfer_to_human action for out-of-scope questions', async () => {
    const client = {
      messages: {
        stream: jest.fn().mockReturnValue(
          fakeStream(['Let me get someone who can help with that.'], {
            content: [
              {
                type: 'text',
                text: 'Let me get someone who can help with that.',
              },
              {
                type: 'tool_use',
                id: 'tool_2',
                name: 'record_turn_outcome',
                input: {
                  languageCode: 'en-IN',
                  coveredQuestionIds: [],
                  askedQuestionId: '',
                  action: 'transfer_to_human',
                  groundedInKnowledgeBase: true,
                  confidence: 0.3,
                },
              },
            ],
            stop_reason: 'tool_use',
          }),
        ),
      },
    } as unknown as Anthropic;

    const service = new LlmReasonerService(config, client);
    const outcome = await service.reason(baseInput(), {
      onReplyTextDelta: () => {},
    });

    expect(outcome.action).toBe('transfer_to_human');
    expect(outcome.askedQuestionId).toBeUndefined();
  });
});
