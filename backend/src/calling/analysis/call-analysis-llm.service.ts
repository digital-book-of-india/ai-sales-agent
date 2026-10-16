import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  CallIntent,
  CallSentiment,
  DecisionMaker,
} from '../../../generated/prisma/enums';
import type {
  AnalysisTranscriptMessage,
  CallAnalysisResult,
} from './call-analysis.types';

export interface AnalyzeTranscriptInput {
  leadName: string;
  campaignName: string;
  messages: AnalysisTranscriptMessage[];
  // When the call happened — lets the LLM resolve a relative date the
  // customer mentioned ("Friday", "next week") into callbackAt's absolute
  // ISO datetime. Defaults to "now" when omitted (tests only — production
  // callers always pass the call's own createdAt, see CallAnalysisService).
  callDate?: Date;
}

const RECORD_CALL_ANALYSIS_TOOL: Anthropic.Tool = {
  name: 'record_call_analysis',
  description:
    'Call this exactly once with your complete structured analysis of the sales call transcript above.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description: 'A 2-4 sentence plain-language summary of the call.',
      },
      requirement: {
        type: 'string',
        description:
          'What the customer said they need, in their own terms. Empty string if never discussed.',
      },
      budget: {
        type: 'string',
        description:
          "The customer's stated or implied budget, verbatim-ish (e.g. 'around 5 lakh', '₹50,000/month'). Empty string if never discussed.",
      },
      timeline: {
        type: 'string',
        description:
          "When the customer wants to move forward (e.g. 'this month', 'next quarter'). Empty string if never discussed.",
      },
      decisionMaker: {
        type: 'string',
        enum: ['YES', 'NO', 'UNKNOWN'],
        description:
          'Whether the person on the call can approve a purchase themselves, based on what they said.',
      },
      intent: {
        type: 'string',
        enum: ['HIGH', 'MEDIUM', 'LOW', 'NONE'],
        description:
          "The customer's buying intent as shown in the conversation.",
      },
      sentiment: {
        type: 'string',
        enum: ['POSITIVE', 'NEUTRAL', 'NEGATIVE'],
        description: "The customer's overall sentiment/tone across the call.",
      },
      demoRequested: {
        type: 'boolean',
        description: 'True if the customer asked for, or agreed to, a demo.',
      },
      objections: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            objection: { type: 'string' },
            response: { type: 'string' },
          },
          required: ['objection', 'response'],
          additionalProperties: false,
        },
        description:
          'Every objection the customer raised and how it was handled on the call. Empty array if none.',
      },
      customerQuestions: {
        type: 'array',
        items: { type: 'string' },
        description:
          'Every question the customer asked, phrased generically/normalized ' +
          "(e.g. 'Pricing', 'Refund policy', 'Contract length') rather than " +
          'quoted verbatim, so the same underlying question from other calls ' +
          'would produce identical text. Empty array if the customer asked ' +
          'nothing.',
      },
      nextAction: {
        type: 'string',
        description:
          "The single best next step for the sales team (e.g. 'Send pricing sheet and follow up Friday'). Empty string if the call reached a clean close/dead end with nothing further to do.",
      },
      qualityScore: {
        type: 'object',
        description:
          'How well the call was handled (by the AI agent or sales rep), 0-100 each. Score naturalness/conversational quality even for a rep-handled call.',
        properties: {
          opening: { type: 'integer' },
          discovery: { type: 'integer' },
          productKnowledge: { type: 'integer' },
          objectionHandling: { type: 'integer' },
          closing: { type: 'integer' },
          naturalness: { type: 'integer' },
          total: {
            type: 'integer',
            description: 'The average of the six scores above, rounded.',
          },
        },
        required: [
          'opening',
          'discovery',
          'productKnowledge',
          'objectionHandling',
          'closing',
          'naturalness',
          'total',
        ],
        additionalProperties: false,
      },
      coachingFeedback: {
        type: 'string',
        description:
          'One paragraph of specific, actionable coaching for whoever handled this call — what to keep doing and what to change next time.',
      },
      callbackRequested: {
        type: 'boolean',
        description:
          'True only if the customer explicitly asked to be called back at a specific later time (e.g. "call me Friday", "try me again Monday morning"). False for a vague "maybe later"/"I\'ll think about it" with no time given.',
      },
      callbackAt: {
        type: 'string',
        description:
          "When callbackRequested is true: the requested callback time as a full ISO 8601 datetime (e.g. '2026-08-28T10:00:00'), resolving whatever relative date the customer gave (e.g. 'Friday', 'next week') against the call date supplied above. Empty string if callbackRequested is false.",
      },
      callbackReason: {
        type: 'string',
        description:
          'When callbackRequested is true: one short sentence on what to follow up about. Empty string if callbackRequested is false.',
      },
      meetingRequested: {
        type: 'boolean',
        description:
          'True only if the call actually scheduled a meeting/demo/call for a specific later date and time (e.g. "let\'s do the demo Tuesday at 3pm"). False for a vague "let\'s set something up" with no time agreed.',
      },
      meetingAt: {
        type: 'string',
        description:
          "When meetingRequested is true: the agreed meeting time as a full ISO 8601 datetime (e.g. '2026-08-28T15:00:00'), resolved against the call date supplied above. Empty string if meetingRequested is false.",
      },
      meetingType: {
        type: 'string',
        description:
          "When meetingRequested is true: what kind of meeting was agreed (e.g. 'Demo', 'Video Call', 'In Person', 'Phone Call'). Empty string if meetingRequested is false.",
      },
    },
    required: [
      'summary',
      'requirement',
      'budget',
      'timeline',
      'decisionMaker',
      'intent',
      'sentiment',
      'demoRequested',
      'objections',
      'customerQuestions',
      'nextAction',
      'qualityScore',
      'coachingFeedback',
      'callbackRequested',
      'callbackAt',
      'callbackReason',
      'meetingRequested',
      'meetingAt',
      'meetingType',
    ],
    additionalProperties: false,
  },
};

interface RecordCallAnalysisInput {
  summary: string;
  requirement: string;
  budget: string;
  timeline: string;
  decisionMaker: DecisionMaker;
  intent: CallIntent;
  sentiment: CallSentiment;
  demoRequested: boolean;
  objections: { objection: string; response: string }[];
  customerQuestions: string[];
  nextAction: string;
  qualityScore: {
    opening: number;
    discovery: number;
    productKnowledge: number;
    objectionHandling: number;
    closing: number;
    naturalness: number;
    total: number;
  };
  coachingFeedback: string;
  callbackRequested: boolean;
  callbackAt: string;
  callbackReason: string;
  meetingRequested: boolean;
  meetingAt: string;
  meetingType: string;
}

const EMPTY_QUALITY_SCORE = {
  opening: 0,
  discovery: 0,
  productKnowledge: 0,
  objectionHandling: 0,
  closing: 0,
  naturalness: 0,
  total: 0,
};

const FALLBACK_RESULT: CallAnalysisResult = {
  summary: 'Analysis unavailable — the LLM call failed or returned no result.',
  requirement: null,
  budget: null,
  timeline: null,
  decisionMaker: DecisionMaker.UNKNOWN,
  intent: CallIntent.NONE,
  sentiment: CallSentiment.NEUTRAL,
  demoRequested: false,
  objections: [],
  customerQuestions: [],
  nextAction: null,
  qualityScore: EMPTY_QUALITY_SCORE,
  coachingFeedback: '',
  callbackRequested: false,
  callbackAt: null,
  callbackReason: null,
  meetingRequested: false,
  meetingAt: null,
  meetingType: null,
};

// Not latency-critical like the live-call reasoner (LlmReasonerService) —
// this runs once, after the call has already ended, so a higher default
// effort trades a few extra seconds for a better-quality analysis.
const MAX_ANALYSIS_TOKENS = 4096;

@Injectable()
export class CallAnalysisLlmService {
  private readonly logger = new Logger(CallAnalysisLlmService.name);
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly effort: 'low' | 'medium' | 'high' | 'xhigh' | 'max';

  constructor(
    private readonly config: ConfigService,
    @Optional() client?: Anthropic,
  ) {
    this.client = client ?? new Anthropic();
    this.model =
      this.config.get<string>('POST_CALL_ANALYSIS_LLM_MODEL') ??
      'claude-opus-5';
    this.effort =
      (this.config.get<string>('POST_CALL_ANALYSIS_LLM_EFFORT') as
        'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined) ?? 'medium';
  }

  async analyze(input: AnalyzeTranscriptInput): Promise<CallAnalysisResult> {
    const transcriptText = input.messages
      .map((m) => `${m.speaker}: ${m.text}`)
      .join('\n');

    let message: Anthropic.Message;
    try {
      message = await this.client.messages.create({
        model: this.model,
        max_tokens: MAX_ANALYSIS_TOKENS,
        output_config: { effort: this.effort },
        system: this.buildSystemPrompt(input),
        tools: [RECORD_CALL_ANALYSIS_TOOL],
        tool_choice: { type: 'tool', name: 'record_call_analysis' },
        messages: [
          {
            role: 'user',
            content: `TRANSCRIPT:\n${transcriptText}`,
          },
        ],
      });
    } catch (error) {
      this.logger.error(
        `Post-call analysis LLM call failed: ${(error as Error).message}`,
      );
      return FALLBACK_RESULT;
    }

    const toolUse = message.content.find(
      (block): block is Anthropic.ToolUseBlock =>
        block.type === 'tool_use' && block.name === 'record_call_analysis',
    );

    if (!toolUse) {
      this.logger.warn(
        `Analysis call produced no record_call_analysis tool use (stop_reason=${message.stop_reason})`,
      );
      return FALLBACK_RESULT;
    }

    const result = toolUse.input as RecordCallAnalysisInput;
    return {
      summary: result.summary || FALLBACK_RESULT.summary,
      requirement: result.requirement || null,
      budget: result.budget || null,
      timeline: result.timeline || null,
      decisionMaker: result.decisionMaker ?? DecisionMaker.UNKNOWN,
      intent: result.intent ?? CallIntent.NONE,
      sentiment: result.sentiment ?? CallSentiment.NEUTRAL,
      demoRequested: result.demoRequested ?? false,
      objections: result.objections ?? [],
      customerQuestions: result.customerQuestions ?? [],
      nextAction: result.nextAction || null,
      qualityScore: result.qualityScore ?? EMPTY_QUALITY_SCORE,
      coachingFeedback: result.coachingFeedback || '',
      callbackRequested: result.callbackRequested ?? false,
      callbackAt: result.callbackAt || null,
      callbackReason: result.callbackReason || null,
      meetingRequested: result.meetingRequested ?? false,
      meetingAt: result.meetingAt || null,
      meetingType: result.meetingType || null,
    };
  }

  private buildSystemPrompt(input: AnalyzeTranscriptInput): string {
    const callDate = input.callDate ?? new Date();
    return [
      'You are a sales call analyst reviewing the transcript of a completed ' +
        `phone call with a prospect named ${input.leadName}, made as part of the ` +
        `"${input.campaignName}" campaign. AI is whoever/whatever was speaking on ` +
        'our side (could be an AI voice agent or a human sales rep whose speech ' +
        'was transcribed under that label) and CUSTOMER is the prospect.',
      '',
      `This call took place on ${callDate.toISOString()}. Resolve any relative ` +
        'date/time the customer mentioned for a callback or a scheduled ' +
        'meeting (e.g. "Friday", "next week", "tomorrow morning") against ' +
        'that date.',
      '',
      'Read the full transcript and call record_call_analysis exactly once with ' +
        'your complete analysis. Base every field strictly on what was actually ' +
        'said — never invent facts, and use empty string/NONE/UNKNOWN/false for ' +
        'anything the transcript does not support.',
    ].join('\n');
  }
}
