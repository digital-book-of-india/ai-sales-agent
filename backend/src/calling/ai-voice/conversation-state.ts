/** One utterance in the call transcript. `kind` distinguishes the scripted
 * opening line (played verbatim from AiAgent/SalesPlaybook config, never
 * generated) from real LLM-driven dialogue — the LLM reasoner only ever
 * sees `dialogue` turns as conversation history (see LlmReasonerService),
 * while the full list including the opener is kept for the live monitor. */
export interface ConversationTurn {
  role: 'customer' | 'agent';
  kind: 'scripted_opening' | 'dialogue';
  text: string;
  at: Date;
}

export type DetectedIntent =
  | 'greeting'
  | 'question'
  | 'objection'
  | 'pricing'
  | 'interest'
  | 'negative'
  | 'other';

/** Per-call conversational memory — everything the pipeline needs to avoid
 * re-asking a question the customer already answered and to keep replying
 * in the language the call has settled into. Lives only as long as the
 * call's live audio session (see ConversationStateService). */
export interface ConversationState {
  callId: string;
  agentId: string;
  turns: ConversationTurn[];
  /** PlaybookQuestion ids the customer has answered, whether the agent
   * explicitly asked them or the customer volunteered the info. */
  answeredQuestionIds: Set<string>;
  languageCode: string;
  lastIntent?: DetectedIntent;
  startedAt: Date;
  lastActivityAt: Date;
}
