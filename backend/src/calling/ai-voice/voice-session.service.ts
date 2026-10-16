import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { CallingGateway } from '../calling.gateway';
import { TELEPHONY_PROVIDER } from '../telephony/telephony-provider.token';
import type { TelephonyProvider } from '../telephony/telephony-provider.interface';
import { SalesPlaybooksService } from '../../sales-playbooks/sales-playbooks.service';
import { STT_PROVIDER } from './stt/stt-provider.token';
import { TTS_PROVIDER } from './tts/tts-provider.token';
import type {
  SpeechToTextProvider,
  SttStream,
  SttTranscriptEvent,
} from './stt/stt-provider.interface';
import type {
  TextToSpeechProvider,
  TtsStream,
} from './tts/tts-provider.interface';
import { VoiceActivityDetector } from './vad/voice-activity-detector';
import { SentenceChunker } from './sentence-chunker';
import { ConversationStateService } from './conversation-state.service';
import { IntentDetectionService } from './intent-detection.service';
import { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { LlmReasonerService, type ReasonAction } from './llm-reasoner.service';
import { TranscriptsService } from '../transcripts/transcripts.service';
import {
  NotificationType,
  TranscriptSpeaker,
} from '../../../generated/prisma/enums';
import { HumanTransferService } from '../human-transfer/human-transfer.service';
import { NotificationsService } from '../../notifications/notifications.service';

export interface VoiceSessionAudioSink {
  /** Deliver one chunk of AI speech audio to the live call — implemented by
   * whatever bridges this session to the actual telephony audio path (see
   * AudioSocketGateway). */
  sendAudio(chunk: Buffer): void;
  /** Tells the telephony leg itself to drop whatever AI audio it has
   * buffered/is playing right now — the barge-in signal, distinct from
   * just not sending more audio (audio already handed off may still be
   * mid-air/queued on the provider's side). Optional: cancelling our own
   * TTS streams already stops new audio; a provider whose wire protocol
   * has a hard "clear" instruction can implement this for a cleaner
   * cutoff — AudioSocket (see audiosocket-protocol.ts) has no such
   * instruction, so AudioSocketGateway leaves this unimplemented. */
  clear?(): void;
}

/**
 * Orchestrates the full per-turn voice pipeline for one connected call:
 * inbound audio -> STT -> VAD/barge-in -> conversation memory -> intent
 * detection -> knowledge retrieval -> LLM reasoning -> sentence-chunked
 * TTS -> outbound audio, plus the ai.speaking/ai.stopped events the live
 * call monitor watches. One instance is shared across all calls; per-call
 * state is keyed by callId throughout (same shape as
 * ConversationStateService and MockTelephonyProvider's call map).
 */
@Injectable()
export class VoiceSessionService {
  private readonly logger = new Logger(VoiceSessionService.name);

  private readonly sinks = new Map<string, VoiceSessionAudioSink>();
  private readonly vads = new Map<string, VoiceActivityDetector>();
  private readonly sttStreams = new Map<string, SttStream>();
  private readonly activeTtsStream = new Map<string, TtsStream>();
  /** Resolves the in-flight speak() promise for a call, if any — invoked by
   * preempt() so a cancelled TtsStream (which never fires onComplete) does
   * not leave that promise hanging forever. */
  private readonly activeSpeakResolve = new Map<string, () => void>();
  private readonly speakQueues = new Map<string, Promise<void>>();
  private readonly speaking = new Map<string, boolean>();
  /** Bumped every time the AI's current/queued speech is invalidated
   * (barge-in, or a fresh customer utterance arriving) — queued/in-flight
   * TTS from a stale generation becomes a silent no-op once it checks in. */
  private readonly generation = new Map<string, number>();

  constructor(
    @Inject(STT_PROVIDER) private readonly stt: SpeechToTextProvider,
    @Inject(TTS_PROVIDER) private readonly tts: TextToSpeechProvider,
    @Inject(TELEPHONY_PROVIDER) private readonly telephony: TelephonyProvider,
    private readonly llm: LlmReasonerService,
    private readonly knowledge: KnowledgeRetrievalService,
    private readonly intent: IntentDetectionService,
    private readonly conversation: ConversationStateService,
    private readonly playbooks: SalesPlaybooksService,
    private readonly gateway: CallingGateway,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly transcripts: TranscriptsService,
    private readonly humanTransfer: HumanTransferService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Fire-and-forget: transcript writes must never block the live audio
   * pipeline (STT/TTS/barge-in timing). Failures are logged, not thrown. */
  private saveTranscriptMessage(
    callId: string,
    speaker: TranscriptSpeaker,
    text: string,
    confidence?: number,
  ): void {
    this.transcripts
      .addMessage(callId, speaker, text, confidence)
      .catch((error: Error) =>
        this.logger.error(
          `Failed to save transcript message for call ${callId}: ${error.message}`,
        ),
      );
  }

  /** Starts the pipeline for a call once its live audio path is up (called
   * from VoiceCallGateway on connect). Speaks the agent's scripted opening
   * line immediately, then drives the rest of the call off inbound audio. */
  async start(
    callId: string,
    sink: VoiceSessionAudioSink,
    sampleRateHz: number,
  ): Promise<void> {
    const call = await this.prisma.call.findUniqueOrThrow({
      where: { id: callId },
      select: { campaign: { select: { aiAgentId: true } } },
    });
    const agentId = call.campaign.aiAgentId;
    if (!agentId) {
      this.logger.warn(
        `Call ${callId}'s campaign has no AI agent configured — skipping voice session`,
      );
      return;
    }

    const agent = await this.prisma.aiAgent.findUniqueOrThrow({
      where: { id: agentId },
    });
    const playbook = await this.playbooks
      .findByAgent(agentId)
      .catch(() => null);

    const defaultLanguage = agent.language ?? 'en-IN';
    this.conversation.start(callId, agentId, defaultLanguage);
    this.sinks.set(callId, sink);
    this.vads.set(callId, new VoiceActivityDetector({ sampleRateHz }));
    this.speaking.set(callId, false);
    this.generation.set(callId, 0);

    const sttStream = this.stt.startStream(
      { languageHint: 'unknown', sampleRateHz }, // always auto-detect — Hindi/English/Hinglish can switch mid-call
      {
        onTranscript: (event) => this.handleTranscript(callId, event),
        onError: (error) =>
          this.logger.error(`STT error on call ${callId}: ${error.message}`),
        onClose: () =>
          this.logger.warn(
            `STT stream for call ${callId} closed by the provider`,
          ),
      },
    );
    this.sttStreams.set(callId, sttStream);

    const openingText = agent.openingMessage || playbook?.opening;
    if (openingText) {
      this.conversation.appendTurn(callId, {
        role: 'agent',
        kind: 'scripted_opening',
        text: openingText,
      });
      this.saveTranscriptMessage(callId, TranscriptSpeaker.AI, openingText);
      this.enqueueSpeak(
        callId,
        openingText,
        defaultLanguage,
        0,
        agent.voice ?? undefined,
      );
    }
  }

  /** Feeds one chunk of raw customer audio into the pipeline — VAD for
   * barge-in first (fast, local, no network round trip), then STT. */
  handleInboundAudio(callId: string, chunk: Buffer): void {
    const vad = this.vads.get(callId);
    const vadEvent = vad?.process(chunk);
    if (vadEvent === 'speech_start' && this.speaking.get(callId)) {
      this.preempt(callId, 'barge_in');
    }
    this.sttStreams.get(callId)?.sendAudio(chunk);
  }

  private handleTranscript(callId: string, event: SttTranscriptEvent): void {
    // Interim transcripts are for live-monitor display only (not built yet
    // on the frontend) — only a final transcript is stable enough to reason
    // over and speak from.
    if (!event.isFinal || !event.text.trim()) return;

    if (event.languageCode)
      this.conversation.setLanguage(callId, event.languageCode);
    this.conversation.appendTurn(callId, {
      role: 'customer',
      kind: 'dialogue',
      text: event.text,
    });
    this.saveTranscriptMessage(
      callId,
      TranscriptSpeaker.CUSTOMER,
      event.text,
      event.confidence,
    );

    // A final transcript is itself evidence the customer is talking — even
    // if VAD's energy threshold missed the onset, whatever the AI was
    // saying is now stale.
    this.preempt(callId, 'barge_in');

    void this.runTurn(callId, event.text).catch((error: Error) => {
      this.logger.error(
        `Turn processing failed for call ${callId}: ${error.message}`,
      );
      void this.notifyAiError(callId, error.message).catch(
        (notifyError: Error) =>
          this.logger.error(
            `Failed to notify AI_ERROR for call ${callId}: ${notifyError.message}`,
          ),
      );
    });
  }

  /**
   * Prompt 19 — one AI_ERROR notification per failed turn, to the lead's
   * rep (or a fallback manager). Deliberately its own try/catch chain
   * (see the caller) so a lookup failure here can never mask the original
   * turn-processing error that's already been logged.
   */
  private async notifyAiError(callId: string, message: string): Promise<void> {
    const call = await this.prisma.call.findUnique({
      where: { id: callId },
      select: {
        leadId: true,
        lead: { select: { name: true, assignedToId: true } },
      },
    });
    if (!call) return;

    const recipientId = await this.notifications.resolveLeadRecipient(
      call.lead.assignedToId,
    );
    if (!recipientId) return;

    await this.notifications.create({
      userId: recipientId,
      type: NotificationType.AI_ERROR,
      leadId: call.leadId,
      callId,
      title: `AI error on call with ${call.lead.name}`,
      body: message,
    });
  }

  private async runTurn(
    callId: string,
    customerUtterance: string,
  ): Promise<void> {
    const generation = this.generation.get(callId) ?? 0;
    const state = this.conversation.get(callId);

    const detectedIntent = this.intent.detect(customerUtterance);
    this.conversation.setLastIntent(callId, detectedIntent);

    const [knowledge, playbook] = await Promise.all([
      this.knowledge.retrieve(
        state.agentId,
        this.intent.buildRetrievalQuery(customerUtterance),
      ),
      this.playbooks.findByAgent(state.agentId).catch(() => null),
    ]);
    const agent = await this.prisma.aiAgent.findUniqueOrThrow({
      where: { id: state.agentId },
    });

    const languageForThisTurn = state.languageCode;
    const agentVoice = agent.voice ?? undefined;
    const chunker = new SentenceChunker();

    const outcome = await this.llm.reason(
      {
        agent: {
          name: agent.name,
          personality: agent.personality,
          objective: agent.objective,
        },
        playbookQuestions: (playbook?.questions ?? []).map((q) => ({
          id: q.id,
          question: q.question,
          purpose: q.purpose,
          expectedInfo: q.expectedInfo,
        })),
        answeredQuestionIds: [...state.answeredQuestionIds],
        qualificationRules: playbook?.qualificationRules,
        objectionHandling: playbook?.objectionHandling,
        closingRules: playbook?.closingRules,
        knowledge,
        conversation: this.conversation.dialogueTurns(callId).slice(0, -1), // exclude the utterance just appended — sent separately below
        customerUtterance,
        detectedLanguageCode: languageForThisTurn,
      },
      {
        onReplyTextDelta: (delta) => {
          for (const sentence of chunker.push(delta)) {
            this.enqueueSpeak(
              callId,
              sentence,
              languageForThisTurn,
              generation,
              agentVoice,
            );
          }
        },
      },
    );

    const remainder = chunker.flush();
    if (remainder)
      this.enqueueSpeak(
        callId,
        remainder,
        languageForThisTurn,
        generation,
        agentVoice,
      );

    this.conversation.appendTurn(callId, {
      role: 'agent',
      kind: 'dialogue',
      text: outcome.replyText,
    });
    this.saveTranscriptMessage(callId, TranscriptSpeaker.AI, outcome.replyText);
    if (outcome.coveredQuestionIds.length) {
      this.conversation.markQuestionsAnswered(
        callId,
        outcome.coveredQuestionIds,
      );
    }
    this.conversation.setLanguage(callId, outcome.languageCode);
    if (!outcome.groundedInKnowledgeBase) {
      this.logger.warn(
        `Call ${callId}: reply flagged as not fully grounded in knowledge base — "${outcome.replyText}"`,
      );
    }

    // Checked every turn regardless of the LLM's own action — a
    // high-value-lead flag or a low confidence score should trigger a
    // handoff even on a turn the LLM was otherwise happy to continue. The
    // LLM's own 'transfer_to_human' judgment is folded in as one more
    // trigger input (see HumanTransferService.evaluateAndTransfer), so a
    // successful handoff here fully replaces this action — nothing left
    // for handleAction to do with it.
    const transferred = await this.humanTransfer.evaluateAndTransfer(callId, {
      customerUtterance,
      detectedIntent,
      groundedInKnowledgeBase: outcome.groundedInKnowledgeBase,
      confidence: outcome.confidence,
      llmRequestedTransfer: outcome.action === 'transfer_to_human',
    });
    if (!transferred) {
      await this.handleAction(callId, outcome.action);
    }
  }

  /** Only 'end_call' remains here — 'transfer_to_human' is fully owned by
   * HumanTransferService (see runTurn above), and 'continue' is a no-op. */
  private async handleAction(
    callId: string,
    action: ReasonAction,
  ): Promise<void> {
    if (action !== 'end_call') return;

    const call = await this.prisma.call.findUnique({ where: { id: callId } });
    if (!call?.providerCallId) return;

    try {
      await this.telephony.hangupCall(call.providerCallId);
    } catch (error) {
      this.logger.error(
        `Failed to execute action "${action}" for call ${callId}: ${(error as Error).message}`,
      );
    }
  }

  /** Queues one sentence for TTS playback, in order, gated by `generation`
   * so a stale/interrupted turn's remaining sentences become no-ops instead
   * of playing after a barge-in. */
  private enqueueSpeak(
    callId: string,
    text: string,
    languageCode: string,
    generation: number,
    voice: string | undefined,
  ): void {
    const previous = this.speakQueues.get(callId) ?? Promise.resolve();
    const next = previous.then(() =>
      this.speak(callId, text, languageCode, generation, voice),
    );
    this.speakQueues.set(callId, next);
  }

  private speak(
    callId: string,
    text: string,
    languageCode: string,
    generation: number,
    voice: string | undefined,
  ): Promise<void> {
    return new Promise((resolve) => {
      if (this.generation.get(callId) !== generation) {
        resolve();
        return;
      }

      const sink = this.sinks.get(callId);
      this.speaking.set(callId, true);
      this.gateway.emitAiVoiceEvent('ai.speaking', { callId, text });
      this.activeSpeakResolve.set(callId, resolve);

      const finish = (reason: 'completed' | 'error') => {
        this.activeTtsStream.delete(callId);
        this.activeSpeakResolve.delete(callId);
        if (this.generation.get(callId) === generation) {
          this.speaking.set(callId, false);
          this.gateway.emitAiVoiceEvent('ai.stopped', { callId, reason });
        }
        resolve();
      };

      const stream = this.tts.synthesize(
        text,
        { languageCode, voice },
        {
          onAudioChunk: (chunk) => {
            if (this.generation.get(callId) === generation)
              sink?.sendAudio(chunk.audio);
          },
          onComplete: () => finish('completed'),
          onError: (error) => {
            this.logger.error(`TTS error on call ${callId}: ${error.message}`);
            finish('error');
          },
        },
      );
      this.activeTtsStream.set(callId, stream);
    });
  }

  /** Bumps the generation and cancels/clears any in-flight or queued
   * speech. Called on VAD-detected onset and on every fresh final
   * transcript — both mean "whatever the AI was about to say is stale". */
  private preempt(callId: string, reason: 'barge_in'): void {
    this.generation.set(callId, (this.generation.get(callId) ?? 0) + 1);
    this.activeTtsStream.get(callId)?.cancel();
    this.activeTtsStream.delete(callId);
    this.speakQueues.set(callId, Promise.resolve());
    // Cancelling our own TTS stream stops new audio; this additionally
    // tells the telephony leg to drop anything it's already buffered.
    this.sinks.get(callId)?.clear?.();

    if (this.speaking.get(callId)) {
      this.speaking.set(callId, false);
      this.gateway.emitAiVoiceEvent('ai.stopped', { callId, reason });
    }

    // cancel() on the underlying TtsStream never fires onComplete/onError —
    // resolve the orphaned speak() promise ourselves so its queue chain
    // (already superseded above) doesn't hang.
    this.activeSpeakResolve.get(callId)?.();
    this.activeSpeakResolve.delete(callId);
  }

  /** Tears the session down — call on call end or audio-bridge disconnect. */
  stop(callId: string): void {
    this.sttStreams.get(callId)?.close();
    this.sttStreams.delete(callId);
    this.activeTtsStream.get(callId)?.cancel();
    this.activeTtsStream.delete(callId);
    this.activeSpeakResolve.get(callId)?.();
    this.activeSpeakResolve.delete(callId);
    this.speakQueues.delete(callId);
    this.vads.delete(callId);
    this.generation.delete(callId);
    this.speaking.delete(callId);
    this.sinks.delete(callId);
    if (this.conversation.has(callId)) this.conversation.end(callId);
  }
}
