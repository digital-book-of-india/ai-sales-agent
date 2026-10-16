import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import type { ConversationTurn } from './conversation-state';
import type { RetrievedKnowledge } from './knowledge-retrieval.service';

export interface ReasonerPlaybookQuestion {
  id: string;
  question: string;
  purpose: string | null;
  expectedInfo: string | null;
}

export interface ReasonInput {
  agent: {
    name: string;
    personality: string | null;
    objective: string | null;
  };
  playbookQuestions: ReasonerPlaybookQuestion[];
  answeredQuestionIds: string[];
  qualificationRules: unknown;
  objectionHandling: unknown;
  closingRules: unknown;
  knowledge: RetrievedKnowledge;
  /** Prior dialogue turns (never includes the scripted opening — see
   * ConversationStateService.dialogueTurns). */
  conversation: ConversationTurn[];
  customerUtterance: string;
  detectedLanguageCode: string;
}

export type ReasonAction = 'continue' | 'transfer_to_human' | 'end_call';

export interface ReasonOutcome {
  replyText: string;
  languageCode: string;
  coveredQuestionIds: string[];
  askedQuestionId?: string;
  action: ReasonAction;
  groundedInKnowledgeBase: boolean;
  /** The model's own confidence (0-1) that this reply fully and correctly
   * addresses the customer — one of HumanTransferService's deterministic
   * trigger inputs (see ../human-transfer/human-transfer-triggers.util.ts).
   * 0 in the two fallback paths below (API failure, no tool call): a
   * fallback reply is by definition not one the model stands behind. */
  confidence: number;
}

export interface ReasonHandlers {
  /** Fired as the spoken reply streams in, in order — feed straight into
   * sentence-chunked TTS (see VoiceSessionService) instead of waiting for
   * the full response. */
  onReplyTextDelta(delta: string): void;
}

interface RecordTurnOutcomeInput {
  languageCode?: string;
  coveredQuestionIds?: string[];
  askedQuestionId?: string;
  action?: ReasonAction;
  groundedInKnowledgeBase?: boolean;
  confidence?: number;
}

const RECORD_TURN_OUTCOME_TOOL: Anthropic.Tool = {
  name: 'record_turn_outcome',
  description:
    'Call this exactly once, and only after you have already written your ' +
    'full spoken reply as plain text, to record the structured outcome of ' +
    'this conversation turn. Never call it before or instead of the reply text.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      languageCode: {
        type: 'string',
        description:
          "The language/register you replied in, matching the customer — e.g. 'hi-IN', 'en-IN', or 'hi-en' for Hinglish.",
      },
      coveredQuestionIds: {
        type: 'array',
        items: { type: 'string' },
        description:
          'IDs (from the playbook question list) of every question the customer has now answered — including ones they volunteered without being asked. Do not include questions from previous turns, only ones newly answered by this exchange.',
      },
      askedQuestionId: {
        type: 'string',
        description:
          "ID of the single playbook question your reply text asks next, or '' if the reply does not ask one.",
      },
      action: {
        type: 'string',
        enum: ['continue', 'transfer_to_human', 'end_call'],
        description:
          "'transfer_to_human' when the customer needs something outside the knowledge base or explicitly asks for a person; 'end_call' when the conversation has reached a natural close (qualified/disqualified/customer said goodbye); otherwise 'continue'.",
      },
      groundedInKnowledgeBase: {
        type: 'boolean',
        description:
          'True only if every factual claim in your reply is directly supported by the KNOWLEDGE BASE context you were given, or is small talk with no factual claims. False if you said anything you were not certain of from that context.',
      },
      confidence: {
        type: 'number',
        description:
          'Your confidence, from 0 to 1, that this reply fully and correctly addresses what the customer needs. Low (below 0.5) when you are guessing, the knowledge base only partially covers this, or you are unsure the customer understood you.',
      },
    },
    required: [
      'languageCode',
      'coveredQuestionIds',
      'askedQuestionId',
      'action',
      'groundedInKnowledgeBase',
      'confidence',
    ],
    additionalProperties: false,
  },
};

const FALLBACK_REPLY =
  "Sorry, I didn't quite catch that — could you say that again?";

// Deliberately not the SDK's `~64000` streaming default: one conversational
// turn is a sentence or two of spoken reply, never a long document.
const MAX_REPLY_TOKENS = 1024;

@Injectable()
export class LlmReasonerService {
  private readonly logger = new Logger(LlmReasonerService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';

  /** `client` is only ever passed explicitly in tests — production wiring
   * (see calling.module.ts) always omits it, which resolves credentials
   * from the environment the normal way (ANTHROPIC_API_KEY / ant profile). */
  constructor(
    private readonly config: ConfigService,
    @Optional() client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
    this.model =
      this.config.get<string>('AI_VOICE_LLM_MODEL') ?? 'claude-opus-5';
    // Real-time voice is latency-critical — every extra second of thinking is
    // dead air on a live phone call. Adaptive thinking stays on (never fully
    // disabled — see the two failure modes with thinking off), but effort
    // defaults to 'low' to keep turn latency down. Override via env for
    // agents where reasoning quality matters more than turn speed.
    this.effort =
      (this.config.get<string>('AI_VOICE_LLM_EFFORT') as
        'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined) ?? 'low';
  }

  async reason(
    input: ReasonInput,
    handlers: ReasonHandlers,
  ): Promise<ReasonOutcome> {
    const messages: Anthropic.MessageParam[] = [
      ...input.conversation.map((turn): Anthropic.MessageParam => ({
        role: turn.role === 'customer' ? 'user' : 'assistant',
        content: turn.text,
      })),
      { role: 'user', content: input.customerUtterance },
    ];

    let message: Anthropic.Message;
    try {
      const stream = this.client.messages.stream({
        model: this.model,
        max_tokens: MAX_REPLY_TOKENS,
        output_config: { effort: this.effort },
        system: this.buildSystemPrompt(input),
        tools: [RECORD_TURN_OUTCOME_TOOL],
        messages,
      });
      stream.on('text', (delta) => handlers.onReplyTextDelta(delta));
      message = await stream.finalMessage();
    } catch (error) {
      // Covers both a request that fails after streaming starts and one
      // that throws synchronously while being built/sent — either way the
      // customer still needs to hear *something* rather than dead air.
      this.logger.error(
        `Claude reasoning call failed: ${(error as Error).message}`,
      );
      return {
        replyText: FALLBACK_REPLY,
        languageCode: input.detectedLanguageCode,
        coveredQuestionIds: [],
        action: 'continue',
        groundedInKnowledgeBase: false,
        confidence: 0,
      };
    }

    const replyText = message.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('')
      .trim();

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'record_turn_outcome',
    );

    if (!toolUse) {
      this.logger.warn(
        `Model turn produced no record_turn_outcome call (stop_reason=${message.stop_reason}) — falling back to defaults`,
      );
      return {
        replyText: replyText || FALLBACK_REPLY,
        languageCode: input.detectedLanguageCode,
        coveredQuestionIds: [],
        action: 'continue',
        groundedInKnowledgeBase: false,
        confidence: 0,
      };
    }

    const outcome = toolUse.input as RecordTurnOutcomeInput;
    return {
      replyText: replyText || FALLBACK_REPLY,
      languageCode: outcome.languageCode || input.detectedLanguageCode,
      coveredQuestionIds: outcome.coveredQuestionIds ?? [],
      askedQuestionId: outcome.askedQuestionId || undefined,
      action: outcome.action ?? 'continue',
      groundedInKnowledgeBase: outcome.groundedInKnowledgeBase ?? false,
      confidence: outcome.confidence ?? 1,
    };
  }

  private buildSystemPrompt(input: ReasonInput): string {
    const unansweredQuestions = input.playbookQuestions.filter(
      (q) => !input.answeredQuestionIds.includes(q.id),
    );

    return [
      `You are ${input.agent.name}, an AI sales voice agent on a live phone call. ${
        input.agent.personality
          ? `Your personality/tone: ${input.agent.personality}.`
          : ''
      } ${input.agent.objective ? `Your objective for this call: ${input.agent.objective}.` : ''}`,
      '',
      'RESPONSE FORMAT: Your reply text is spoken aloud by text-to-speech — write ' +
        'natural, conversational sentences only. No markdown, no bullet points, no ' +
        'headings, no emoji. Keep it brief, like one side of a real phone conversation ' +
        '(usually 1-3 sentences).',
      '',
      'LANGUAGE: Reply in the same language and formality the customer is using — ' +
        'Hindi, English, or Hinglish (a natural code-mix), matching their register ' +
        `(formal "aap" vs casual "tum/tu" in Hindi, formal vs casual English). The ` +
        `conversation has been running in "${input.detectedLanguageCode}" so far — keep ` +
        'that unless the customer just switched languages.',
      '',
      'KNOWLEDGE BASE — the ONLY source of truth for facts about the company, ' +
        'products, services, pricing, and policies. Never invent, guess, or assume ' +
        'any fact not present here. If the customer asks something this knowledge ' +
        "base doesn't cover, say plainly that you'll check and follow up, or offer to " +
        'connect them with a team member — do not improvise an answer.',
      JSON.stringify(
        {
          companyInfo: input.knowledge.companyInfo,
          products: input.knowledge.products,
          services: input.knowledge.services,
          relevantFaqs: input.knowledge.faqs,
          relevantObjectionGuidance: input.knowledge.objections,
        },
        null,
        2,
      ),
      '',
      'SALES PLAYBOOK — discovery questions you may draw on. Choose at most one ' +
        'per turn, and only ask it if it fits naturally where the conversation is right ' +
        "now — never run through them in a fixed sequence, and never ask one that's " +
        'already answered below (including if the customer volunteered the answer ' +
        'without being asked).',
      `Already answered: ${input.answeredQuestionIds.join(', ') || '(none yet)'}`,
      `Still open: ${JSON.stringify(unansweredQuestions, null, 2)}`,
      `Qualification rules: ${safeJson(input.qualificationRules)}`,
      `Objection handling guidance: ${safeJson(input.objectionHandling)}`,
      `Closing rules: ${safeJson(input.closingRules)}`,
      '',
      'TOOL USE: After writing your spoken reply text, call the record_turn_outcome ' +
        'tool exactly once to record which questions this exchange covered, whether ' +
        'you asked a new one, whether the call should continue/transfer/end, whether ' +
        'your reply stayed fully grounded in the knowledge base above, and how ' +
        'confident you are in it.',
    ].join('\n');
  }
}

function safeJson(value: unknown): string {
  if (value === undefined || value === null) return '(none)';
  try {
    return JSON.stringify(value);
  } catch {
    return '(unavailable)';
  }
}
