import type { ConversationState } from '../ai-voice/conversation-state';

const MAX_QUOTE_LENGTH = 140;

function truncate(text: string): string {
  return text.length > MAX_QUOTE_LENGTH
    ? `${text.slice(0, MAX_QUOTE_LENGTH).trimEnd()}…`
    : text;
}

/**
 * Builds a short, heuristic recap of a live call for the transfer context
 * popup's "AI summary so far" field — deliberately not another LLM call
 * (see HumanTransferContext.aiSummary): the call is already mid-handoff, so
 * this needs to be ready instantly, not after a model round trip.
 */
export function buildLiveSummary(state: ConversationState): string {
  const dialogue = state.turns.filter((t) => t.kind === 'dialogue');
  const lastCustomerTurn = [...dialogue]
    .reverse()
    .find((t) => t.role === 'customer');

  const turnCount = dialogue.length;
  if (turnCount === 0) {
    return 'Call just started — no customer dialogue yet.';
  }

  const parts = [
    `${turnCount} turn${turnCount === 1 ? '' : 's'} into the call.`,
  ];
  if (state.lastIntent) {
    parts.push(`Last detected intent: ${state.lastIntent}.`);
  }
  if (lastCustomerTurn) {
    parts.push(`Customer last said: "${truncate(lastCustomerTurn.text)}"`);
  }
  if (state.answeredQuestionIds.size > 0) {
    parts.push(
      `${state.answeredQuestionIds.size} playbook question(s) already covered.`,
    );
  }

  return parts.join(' ');
}
