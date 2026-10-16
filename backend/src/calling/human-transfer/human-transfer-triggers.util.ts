import { LeadPriority } from '../../../generated/prisma/enums';
import type { HumanTransferConfig } from '../../system-settings/human-transfer.config';
import type {
  TransferReason,
  TransferTriggerInput,
} from './human-transfer.types';

function matchesAny(text: string, keywords: string[]): boolean {
  const normalized = text.toLowerCase();
  return keywords.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

/**
 * Pure function — the deterministic half of Prompt 18's trigger conditions,
 * checked fresh on every turn of a live AI call (see
 * HumanTransferService.evaluate). Every condition is independent and
 * additive: a turn can match several at once, and every match it produces
 * is reported (not just the first), so the salesperson sees the full
 * picture of why they were pulled in.
 *
 * Deliberately keyword/threshold-based rather than another LLM call — this
 * runs on every turn of every live call, and the LLM reasoner already has
 * its own chance to request a transfer via record_turn_outcome's
 * action: 'transfer_to_human' (folded in here as 'ai_judgment').
 */
export function evaluateTransferTriggers(
  input: TransferTriggerInput,
  config: HumanTransferConfig,
): TransferReason[] {
  const reasons: TransferReason[] = [];

  if (matchesAny(input.customerUtterance, config.explicitRequestKeywords)) {
    reasons.push('explicit_request');
  } else if (input.llmRequestedTransfer) {
    // Only counted when the deterministic keyword check above didn't
    // already explain it — avoids reporting both for the same utterance.
    reasons.push('ai_judgment');
  }

  if (matchesAny(input.customerUtterance, config.highIntentKeywords)) {
    reasons.push('high_positive_intent');
  }

  if (matchesAny(input.customerUtterance, config.negotiationKeywords)) {
    reasons.push('negotiation');
  }

  if (input.detectedIntent === 'question' && !input.groundedInKnowledgeBase) {
    reasons.push('unresolved_technical_question');
  }

  if (input.confidence < config.lowConfidenceThreshold) {
    reasons.push('low_ai_confidence');
  }

  if (
    input.leadPriority === LeadPriority.HIGH ||
    input.leadScore >= config.highValueLeadScore
  ) {
    reasons.push('high_value_lead');
  }

  return reasons;
}
