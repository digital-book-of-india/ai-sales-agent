import { LeadPriority } from '../../../generated/prisma/enums';
import { evaluateTransferTriggers } from './human-transfer-triggers.util';
import { DEFAULT_HUMAN_TRANSFER_CONFIG } from '../../system-settings/human-transfer.config';
import type { TransferTriggerInput } from './human-transfer.types';

function baseInput(
  overrides: Partial<TransferTriggerInput> = {},
): TransferTriggerInput {
  return {
    customerUtterance: 'Tell me more about the product',
    detectedIntent: 'other',
    groundedInKnowledgeBase: true,
    confidence: 0.9,
    llmRequestedTransfer: false,
    leadPriority: LeadPriority.MEDIUM,
    leadScore: 40,
    ...overrides,
  };
}

describe('evaluateTransferTriggers', () => {
  it('returns no reasons when nothing matches', () => {
    expect(
      evaluateTransferTriggers(baseInput(), DEFAULT_HUMAN_TRANSFER_CONFIG),
    ).toEqual([]);
  });

  it('flags an explicit request for a human', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ customerUtterance: 'Can I talk to a person please?' }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['explicit_request']);
  });

  it('flags an explicit request phrased in Hinglish', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ customerUtterance: 'Mujhe kisi aadmi se baat karao' }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['explicit_request']);
  });

  it('falls back to ai_judgment when the LLM requested a transfer but no keyword matched', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ llmRequestedTransfer: true }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['ai_judgment']);
  });

  it('does not double-report when both a keyword matches and the LLM also requested a transfer', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({
        customerUtterance: 'I want to talk to a person',
        llmRequestedTransfer: true,
      }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['explicit_request']);
  });

  it('flags high positive buying intent', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ customerUtterance: "Great, let's go ahead with this" }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['high_positive_intent']);
  });

  it('flags a negotiation attempt', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ customerUtterance: 'Can you do a better price for me?' }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['negotiation']);
  });

  it('flags an unresolved technical question only when it is a question AND ungrounded', () => {
    expect(
      evaluateTransferTriggers(
        baseInput({
          detectedIntent: 'question',
          groundedInKnowledgeBase: false,
        }),
        DEFAULT_HUMAN_TRANSFER_CONFIG,
      ),
    ).toEqual(['unresolved_technical_question']);

    // Grounded question: no trigger.
    expect(
      evaluateTransferTriggers(
        baseInput({
          detectedIntent: 'question',
          groundedInKnowledgeBase: true,
        }),
        DEFAULT_HUMAN_TRANSFER_CONFIG,
      ),
    ).toEqual([]);

    // Ungrounded reply that wasn't answering a question: no trigger.
    expect(
      evaluateTransferTriggers(
        baseInput({ detectedIntent: 'other', groundedInKnowledgeBase: false }),
        DEFAULT_HUMAN_TRANSFER_CONFIG,
      ),
    ).toEqual([]);
  });

  it('flags low AI confidence below the configured threshold', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ confidence: 0.2 }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['low_ai_confidence']);
  });

  it('does not flag confidence right at the threshold', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({
        confidence: DEFAULT_HUMAN_TRANSFER_CONFIG.lowConfidenceThreshold,
      }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual([]);
  });

  it('flags a high-value lead by priority even with a low score', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ leadPriority: LeadPriority.HIGH, leadScore: 5 }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['high_value_lead']);
  });

  it('flags a high-value lead by score even with normal priority', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({ leadPriority: LeadPriority.LOW, leadScore: 90 }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(['high_value_lead']);
  });

  it('reports every reason that matches at once', () => {
    const reasons = evaluateTransferTriggers(
      baseInput({
        customerUtterance:
          'Can you give me a better price, or let me talk to a person',
        confidence: 0.1,
        leadPriority: LeadPriority.HIGH,
      }),
      DEFAULT_HUMAN_TRANSFER_CONFIG,
    );
    expect(reasons).toEqual(
      expect.arrayContaining([
        'explicit_request',
        'negotiation',
        'low_ai_confidence',
        'high_value_lead',
      ]),
    );
    expect(reasons).toHaveLength(4);
  });

  it('respects overridden config thresholds/keywords', () => {
    const customConfig = {
      ...DEFAULT_HUMAN_TRANSFER_CONFIG,
      highValueLeadScore: 10,
      lowConfidenceThreshold: 0.95,
    };
    const reasons = evaluateTransferTriggers(
      baseInput({ leadScore: 20, confidence: 0.9 }),
      customConfig,
    );
    expect(reasons).toEqual(
      expect.arrayContaining(['high_value_lead', 'low_ai_confidence']),
    );
  });
});
