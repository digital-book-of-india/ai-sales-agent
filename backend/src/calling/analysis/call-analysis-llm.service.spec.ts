import { ConfigService } from '@nestjs/config';
import type Anthropic from '@anthropic-ai/sdk';
import { CallAnalysisLlmService } from './call-analysis-llm.service';
import {
  CallIntent,
  CallSentiment,
  DecisionMaker,
} from '../../../generated/prisma/enums';

describe('CallAnalysisLlmService', () => {
  const config = { get: jest.fn() } as unknown as ConfigService;

  const input = {
    leadName: 'Priya Sharma',
    campaignName: 'Diwali Outreach',
    messages: [
      { speaker: 'AI' as const, text: 'Hi, is this Priya?' },
      { speaker: 'CUSTOMER' as const, text: 'Yes speaking.' },
    ],
  };

  const qualityScore = {
    opening: 80,
    discovery: 70,
    productKnowledge: 90,
    objectionHandling: 60,
    closing: 75,
    naturalness: 85,
    total: 77,
  };

  it('parses the record_call_analysis tool result', async () => {
    const createMock = jest.fn().mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          id: 'tool_1',
          name: 'record_call_analysis',
          input: {
            summary: 'Prospect is interested in a CRM upgrade.',
            requirement: 'CRM for a 20-person team',
            budget: 'around 5 lakh',
            timeline: 'next quarter',
            decisionMaker: 'YES',
            intent: 'HIGH',
            sentiment: 'POSITIVE',
            demoRequested: true,
            objections: [
              { objection: 'Price', response: 'Offered a discount' },
            ],
            customerQuestions: ['Contract length'],
            nextAction: 'Send pricing sheet',
            qualityScore,
            coachingFeedback: 'Great discovery, could close sooner.',
            callbackRequested: true,
            callbackAt: '2026-08-28T10:00:00.000Z',
            callbackReason: 'Wants to review the proposal with her manager',
            meetingRequested: true,
            meetingAt: '2026-08-29T15:00:00.000Z',
            meetingType: 'Demo',
          },
        },
      ],
      stop_reason: 'tool_use',
    });
    const client = {
      messages: { create: createMock },
    } as unknown as Anthropic;

    const service = new CallAnalysisLlmService(config, client);
    const result = await service.analyze(input);

    expect(result).toEqual({
      summary: 'Prospect is interested in a CRM upgrade.',
      requirement: 'CRM for a 20-person team',
      budget: 'around 5 lakh',
      timeline: 'next quarter',
      decisionMaker: DecisionMaker.YES,
      intent: CallIntent.HIGH,
      sentiment: CallSentiment.POSITIVE,
      demoRequested: true,
      objections: [{ objection: 'Price', response: 'Offered a discount' }],
      customerQuestions: ['Contract length'],
      nextAction: 'Send pricing sheet',
      qualityScore,
      coachingFeedback: 'Great discovery, could close sooner.',
      callbackRequested: true,
      callbackAt: '2026-08-28T10:00:00.000Z',
      callbackReason: 'Wants to review the proposal with her manager',
      meetingRequested: true,
      meetingAt: '2026-08-29T15:00:00.000Z',
      meetingType: 'Demo',
    });

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tool_choice: { type: 'tool', name: 'record_call_analysis' },
      }),
    );
  });

  it('treats empty extraction strings as null, not empty string', async () => {
    const client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [
            {
              type: 'tool_use',
              id: 'tool_1',
              name: 'record_call_analysis',
              input: {
                summary: 'Short call, no details shared.',
                requirement: '',
                budget: '',
                timeline: '',
                decisionMaker: 'UNKNOWN',
                intent: 'NONE',
                sentiment: 'NEUTRAL',
                demoRequested: false,
                objections: [],
                nextAction: '',
                qualityScore,
                coachingFeedback: '',
                callbackRequested: false,
                callbackAt: '',
                callbackReason: '',
                meetingRequested: false,
                meetingAt: '',
                meetingType: '',
              },
            },
          ],
          stop_reason: 'tool_use',
        }),
      },
    } as unknown as Anthropic;

    const service = new CallAnalysisLlmService(config, client);
    const result = await service.analyze(input);

    expect(result.requirement).toBeNull();
    expect(result.budget).toBeNull();
    expect(result.timeline).toBeNull();
    expect(result.nextAction).toBeNull();
    expect(result.callbackRequested).toBe(false);
    expect(result.callbackAt).toBeNull();
    expect(result.callbackReason).toBeNull();
    expect(result.meetingRequested).toBe(false);
    expect(result.meetingAt).toBeNull();
    expect(result.meetingType).toBeNull();
  });

  it('falls back to a safe default when the LLM call throws', async () => {
    const client = {
      messages: { create: jest.fn().mockRejectedValue(new Error('boom')) },
    } as unknown as Anthropic;

    const service = new CallAnalysisLlmService(config, client);
    const result = await service.analyze(input);

    expect(result.decisionMaker).toBe(DecisionMaker.UNKNOWN);
    expect(result.intent).toBe(CallIntent.NONE);
    expect(result.sentiment).toBe(CallSentiment.NEUTRAL);
    expect(result.demoRequested).toBe(false);
    expect(result.callbackRequested).toBe(false);
    expect(result.callbackAt).toBeNull();
  });

  it('falls back to a safe default when no tool call is produced', async () => {
    const client = {
      messages: {
        create: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'I could not analyze this.' }],
          stop_reason: 'end_turn',
        }),
      },
    } as unknown as Anthropic;

    const service = new CallAnalysisLlmService(config, client);
    const result = await service.analyze(input);

    expect(result.decisionMaker).toBe(DecisionMaker.UNKNOWN);
    expect(result.objections).toEqual([]);
  });
});
