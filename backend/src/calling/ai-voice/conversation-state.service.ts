import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ConversationState, ConversationTurn } from './conversation-state';

/**
 * Holds live conversation memory for calls currently being handled by the AI
 * voice pipeline, keyed by callId. In-memory by design — same tradeoff as
 * MockTelephonyProvider's call map (see ../telephony/mock-telephony.provider.ts):
 * a call's live audio session is pinned to whichever process accepted its
 * websocket connection, so there is no cross-process access to coordinate.
 * Horizontal scaling would need sticky routing to that process, or moving
 * this to Redis — not needed at current scale.
 */
@Injectable()
export class ConversationStateService {
  private readonly logger = new Logger(ConversationStateService.name);
  private readonly sessions = new Map<string, ConversationState>();

  start(
    callId: string,
    agentId: string,
    defaultLanguageCode: string,
  ): ConversationState {
    const now = new Date();
    const state: ConversationState = {
      callId,
      agentId,
      turns: [],
      answeredQuestionIds: new Set(),
      languageCode: defaultLanguageCode,
      startedAt: now,
      lastActivityAt: now,
    };
    this.sessions.set(callId, state);
    return state;
  }

  get(callId: string): ConversationState {
    const state = this.sessions.get(callId);
    if (!state) {
      throw new NotFoundException(`No active voice session for call ${callId}`);
    }
    return state;
  }

  has(callId: string): boolean {
    return this.sessions.has(callId);
  }

  appendTurn(callId: string, turn: Omit<ConversationTurn, 'at'>): void {
    const state = this.get(callId);
    state.turns.push({ ...turn, at: new Date() });
    state.lastActivityAt = new Date();
  }

  /** Dialogue turns only, in order — what the LLM reasoner sends as history. */
  dialogueTurns(callId: string): ConversationTurn[] {
    return this.get(callId).turns.filter((t) => t.kind === 'dialogue');
  }

  markQuestionsAnswered(callId: string, questionIds: string[]): void {
    const state = this.get(callId);
    for (const id of questionIds) state.answeredQuestionIds.add(id);
  }

  unansweredQuestionIds(callId: string, allQuestionIds: string[]): string[] {
    const answered = this.get(callId).answeredQuestionIds;
    return allQuestionIds.filter((id) => !answered.has(id));
  }

  setLanguage(callId: string, languageCode: string): void {
    this.get(callId).languageCode = languageCode;
  }

  setLastIntent(callId: string, intent: ConversationState['lastIntent']): void {
    this.get(callId).lastIntent = intent;
  }

  end(callId: string): void {
    if (!this.sessions.delete(callId)) {
      this.logger.warn(
        `end() called for call ${callId} with no active session`,
      );
    }
  }
}
