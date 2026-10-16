import type { ConfigService } from '@nestjs/config';
import {
  VoiceSessionService,
  type VoiceSessionAudioSink,
} from './voice-session.service';
import type {
  SpeechToTextProvider,
  SttStreamHandlers,
  SttTranscriptEvent,
} from './stt/stt-provider.interface';
import type {
  TextToSpeechProvider,
  TtsStreamHandlers,
} from './tts/tts-provider.interface';
import type { TelephonyProvider } from '../telephony/telephony-provider.interface';
import type { CallingGateway } from '../calling.gateway';
import type { PrismaService } from '../../prisma/prisma.service';
import type { SalesPlaybooksService } from '../../sales-playbooks/sales-playbooks.service';
import type { LlmReasonerService, ReasonOutcome } from './llm-reasoner.service';
import type { KnowledgeRetrievalService } from './knowledge-retrieval.service';
import { ConversationStateService } from './conversation-state.service';
import { IntentDetectionService } from './intent-detection.service';
import type { TranscriptsService } from '../transcripts/transcripts.service';
import type { HumanTransferService } from '../human-transfer/human-transfer.service';
import type { TransferTarget } from '../human-transfer/human-transfer.types';
import type { NotificationsService } from '../../notifications/notifications.service';

function flushPromises() {
  return new Promise((resolve) => setImmediate(resolve));
}

const SAMPLE_RATE = 8000;

function loudFrame(): Buffer {
  const buf = Buffer.alloc(320);
  for (let i = 0; i < 160; i++) {
    buf.writeInt16LE(i % 2 === 0 ? 20000 : -20000, i * 2);
  }
  return buf;
}

describe('VoiceSessionService', () => {
  // Every collaborator is faked via a standalone jest.fn() const, asserted
  // on directly (not as `object.method`, which trips
  // @typescript-eslint/unbound-method against real class/interface methods
  // like CallingGateway.emitAiVoiceEvent or TelephonyProvider.transferCall).
  let sttHandlers: SttStreamHandlers;
  const sttStreamClose = jest.fn();
  const sttStreamSendAudio = jest.fn();
  const startStream = jest.fn((_options, handlers: SttStreamHandlers) => {
    sttHandlers = handlers;
    return { sendAudio: sttStreamSendAudio, close: sttStreamClose };
  });
  const fakeStt = {
    name: 'fake-stt',
    startStream,
  } as unknown as SpeechToTextProvider;

  let ttsHandlersByCall: TtsStreamHandlers[];
  const ttsCancel = jest.fn();
  const synthesizeCalls: {
    text: string;
    languageCode: string;
    voice?: string;
  }[] = [];
  const synthesize = jest.fn(
    (
      text: string,
      options: { languageCode: string; voice?: string },
      handlers: TtsStreamHandlers,
    ) => {
      synthesizeCalls.push({
        text,
        languageCode: options.languageCode,
        voice: options.voice,
      });
      ttsHandlersByCall.push(handlers);
      return { cancel: ttsCancel };
    },
  );
  const fakeTts = {
    name: 'fake-tts',
    synthesize,
  } as unknown as TextToSpeechProvider;

  const transferCall = jest.fn().mockResolvedValue(undefined);
  const hangupCall = jest.fn().mockResolvedValue(undefined);
  const telephony = {
    transferCall,
    hangupCall,
  } as unknown as TelephonyProvider;

  const emitAiVoiceEvent = jest.fn();
  const gateway = {
    emitAiVoiceEvent,
    emitEvent: jest.fn(),
  } as unknown as CallingGateway;

  const call = {
    id: 'call-1',
    providerCallId: 'provider-call-1',
    campaign: { aiAgentId: 'agent-1' },
  };
  const agent = {
    id: 'agent-1',
    name: 'Riya',
    personality: 'friendly',
    objective: 'qualify the lead',
    openingMessage: 'Hi, this is Riya calling from Acme.',
    language: 'en-IN',
    voice: 'riya-warm',
  };
  const playbook = {
    opening: 'Hi, this is Riya calling from Acme.',
    qualificationRules: {},
    objectionHandling: {},
    closingRules: {},
    questions: [
      {
        id: 'q1',
        question: 'What is your budget?',
        purpose: null,
        expectedInfo: null,
      },
    ],
  };

  const prisma = {
    call: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(call),
      findUnique: jest.fn().mockResolvedValue(call),
      update: jest.fn().mockResolvedValue(call),
    },
    aiAgent: {
      findUniqueOrThrow: jest.fn().mockResolvedValue(agent),
    },
  } as unknown as PrismaService;

  const playbooksService = {
    findByAgent: jest.fn().mockResolvedValue(playbook),
  } as unknown as SalesPlaybooksService;

  const retrieveKnowledge = jest.fn().mockResolvedValue({
    companyInfo: {},
    products: [],
    services: [],
    faqs: [],
    objections: [],
  });
  const knowledgeService = {
    retrieve: retrieveKnowledge,
  } as unknown as KnowledgeRetrievalService;

  let llmOutcome: ReasonOutcome;
  const reasonFn = jest.fn(
    (_input, handlers: { onReplyTextDelta: (d: string) => void }) => {
      handlers.onReplyTextDelta('Sure, we can help. ');
      return Promise.resolve(llmOutcome);
    },
  );
  const llmReasoner = { reason: reasonFn } as unknown as LlmReasonerService;

  const config = { get: jest.fn() } as unknown as ConfigService;

  const addMessage = jest.fn().mockResolvedValue(undefined);
  const transcripts = { addMessage } as unknown as TranscriptsService;

  let transferTarget: TransferTarget | null;
  const evaluateAndTransfer = jest.fn(() => Promise.resolve(transferTarget));
  const humanTransfer = {
    evaluateAndTransfer,
  } as unknown as HumanTransferService;

  const resolveLeadRecipient = jest.fn().mockResolvedValue('exec-1');
  const notificationsCreate = jest.fn();
  const notifications = {
    resolveLeadRecipient,
    create: notificationsCreate,
  } as unknown as NotificationsService;

  let conversation: ConversationStateService;
  let intent: IntentDetectionService;
  let service: VoiceSessionService;
  let sink: VoiceSessionAudioSink;
  let sinkChunks: Buffer[];

  beforeEach(() => {
    jest.clearAllMocks();
    synthesizeCalls.length = 0;
    ttsHandlersByCall = [];
    sinkChunks = [];
    sink = { sendAudio: (chunk) => sinkChunks.push(chunk) };

    llmOutcome = {
      replyText: 'Sure, we can help.',
      languageCode: 'en-IN',
      coveredQuestionIds: ['q1'],
      askedQuestionId: undefined,
      action: 'continue',
      groundedInKnowledgeBase: true,
      confidence: 0.9,
    };
    transferTarget = null;

    conversation = new ConversationStateService();
    intent = new IntentDetectionService();

    service = new VoiceSessionService(
      fakeStt,
      fakeTts,
      telephony,
      llmReasoner,
      knowledgeService,
      intent,
      conversation,
      playbooksService,
      gateway,
      prisma,
      config,
      transcripts,
      humanTransfer,
      notifications,
    );
  });

  async function startCall() {
    await service.start('call-1', sink, SAMPLE_RATE);
    await flushPromises();
  }

  it('starts STT with auto-detect and speaks the scripted opening line', async () => {
    await startCall();

    expect(startStream).toHaveBeenCalledWith(
      { languageHint: 'unknown', sampleRateHz: SAMPLE_RATE },
      expect.anything(),
    );
    expect(synthesizeCalls[0]).toEqual({
      text: 'Hi, this is Riya calling from Acme.',
      languageCode: 'en-IN',
      voice: 'riya-warm', // the agent's configured voice reaches TTS, not just its language
    });
    expect(emitAiVoiceEvent).toHaveBeenCalledWith('ai.speaking', {
      callId: 'call-1',
      text: 'Hi, this is Riya calling from Acme.',
    });

    // Opening turn is recorded but as a scripted turn, not dialogue.
    expect(conversation.dialogueTurns('call-1')).toEqual([]);

    // ...but it is still saved to the transcript, as an AI message.
    expect(addMessage).toHaveBeenCalledWith(
      'call-1',
      'AI',
      'Hi, this is Riya calling from Acme.',
      undefined,
    );
  });

  it('delivers TTS audio chunks to the sink and emits ai.stopped on completion', async () => {
    await startCall();
    const handlers = ttsHandlersByCall[0];

    handlers.onAudioChunk({ audio: Buffer.from([1, 2, 3]) });
    handlers.onComplete();
    await flushPromises();

    expect(sinkChunks).toEqual([Buffer.from([1, 2, 3])]);
    expect(emitAiVoiceEvent).toHaveBeenCalledWith('ai.stopped', {
      callId: 'call-1',
      reason: 'completed',
    });
  });

  it('runs a full turn on a final transcript: retrieves knowledge, reasons, speaks, and tracks answered questions', async () => {
    await startCall();
    // Let the opening finish speaking.
    ttsHandlersByCall[0].onComplete();
    await flushPromises();

    const event: SttTranscriptEvent = {
      text: 'My budget is around 50k',
      isFinal: true,
      languageCode: 'en-IN',
    };
    sttHandlers.onTranscript(event);
    await flushPromises();

    expect(retrieveKnowledge).toHaveBeenCalledWith(
      'agent-1',
      'My budget is around 50k',
    );
    expect(reasonFn).toHaveBeenCalledWith(
      expect.objectContaining({
        answeredQuestionIds: [],
        customerUtterance: 'My budget is around 50k',
      }),
      expect.anything(),
    );

    // The customer turn + the AI's reply are both recorded as dialogue.
    expect(conversation.dialogueTurns('call-1').map((t) => t.text)).toEqual([
      'My budget is around 50k',
      'Sure, we can help.',
    ]);

    const state = conversation.get('call-1');
    expect(state.answeredQuestionIds.has('q1')).toBe(true);

    // Reply text was spoken, with the agent's configured voice.
    expect(synthesizeCalls.at(-1)).toEqual({
      text: 'Sure, we can help.',
      languageCode: 'en-IN',
      voice: 'riya-warm',
    });

    // Both the customer's utterance and the AI's reply were saved to the
    // transcript, customer with its STT confidence, AI with none.
    expect(addMessage).toHaveBeenCalledWith(
      'call-1',
      'CUSTOMER',
      'My budget is around 50k',
      undefined,
    );
    expect(addMessage).toHaveBeenCalledWith(
      'call-1',
      'AI',
      'Sure, we can help.',
      undefined,
    );
  });

  it('passes the STT confidence score through to the saved transcript message', async () => {
    await startCall();
    ttsHandlersByCall[0].onComplete();
    await flushPromises();

    sttHandlers.onTranscript({
      text: 'Yes, that works for me',
      isFinal: true,
      languageCode: 'en-IN',
      confidence: 0.94,
    });
    await flushPromises();

    expect(addMessage).toHaveBeenCalledWith(
      'call-1',
      'CUSTOMER',
      'Yes, that works for me',
      0.94,
    );
  });

  it('cancels in-flight TTS and suppresses queued sentences on barge-in', async () => {
    await startCall();
    // Opening is now "speaking" — activeTtsStream is set, nothing completed yet.

    service.handleInboundAudio('call-1', loudFrame());
    service.handleInboundAudio('call-1', loudFrame()); // 2nd onset frame crosses the debounce

    expect(ttsCancel).toHaveBeenCalledTimes(1);
    expect(emitAiVoiceEvent).toHaveBeenCalledWith('ai.stopped', {
      callId: 'call-1',
      reason: 'barge_in',
    });

    // Audio still reaches STT even during/after barge-in.
    expect(sttStreamSendAudio).toHaveBeenCalledTimes(2);
  });

  it('a fresh final transcript preempts any still-queued reply from the previous turn', async () => {
    await startCall();
    ttsHandlersByCall[0].onComplete();
    await flushPromises();
    synthesizeCalls.length = 0;

    // First turn's reply never gets to finish synthesizing before the
    // customer's next utterance arrives (no onComplete fired for it).
    sttHandlers.onTranscript({
      text: 'first question',
      isFinal: true,
      languageCode: 'en-IN',
    });
    await flushPromises();
    expect(synthesizeCalls).toHaveLength(1); // the first reply started speaking

    sttHandlers.onTranscript({
      text: 'second question',
      isFinal: true,
      languageCode: 'en-IN',
    });
    await flushPromises();

    // The second turn's reasoning ran against the superseded generation but
    // still produced its own new speech — the key guarantee is the first
    // reply's stream was cancelled the moment the new transcript arrived.
    expect(ttsCancel).toHaveBeenCalled();
  });

  it('ignores interim (non-final) transcripts', async () => {
    await startCall();
    sttHandlers.onTranscript({ text: 'umm', isFinal: false });
    await flushPromises();

    expect(reasonFn).not.toHaveBeenCalled();
  });

  it('delegates to HumanTransferService when the LLM signals transfer_to_human, and skips end/continue handling once transferred', async () => {
    llmOutcome = { ...llmOutcome, action: 'transfer_to_human' };
    transferTarget = { userId: 'user-1', extension: '1002' };
    await startCall();
    ttsHandlersByCall[0].onComplete();
    await flushPromises();

    sttHandlers.onTranscript({
      text: 'I need something not in the KB',
      isFinal: true,
    });
    await flushPromises();

    expect(evaluateAndTransfer).toHaveBeenCalledWith('call-1', {
      customerUtterance: 'I need something not in the KB',
      detectedIntent: expect.any(String) as string,
      groundedInKnowledgeBase: true,
      confidence: 0.9,
      llmRequestedTransfer: true,
    });
    // The actual TelephonyProvider.transferCall/Call.update are owned by
    // HumanTransferService (see its own spec) — VoiceSessionService neither
    // calls the telephony provider itself nor falls through to hangupCall
    // once a transfer already happened.
    expect(transferCall).not.toHaveBeenCalled();
    expect(hangupCall).not.toHaveBeenCalled();
  });

  it('checks the deterministic transfer triggers even when the LLM says continue, and skips further action handling if it transfers', async () => {
    // The LLM was happy to continue, but a deterministic trigger (e.g. a
    // high-value lead flag) still fired independently.
    transferTarget = { userId: 'user-1', extension: '1002' };
    await startCall();
    ttsHandlersByCall[0].onComplete();
    await flushPromises();

    sttHandlers.onTranscript({ text: 'sounds good', isFinal: true });
    await flushPromises();

    expect(evaluateAndTransfer).toHaveBeenCalled();
    expect(hangupCall).not.toHaveBeenCalled();
  });

  it('hangs up when the LLM signals end_call and no transfer trigger fired', async () => {
    llmOutcome = { ...llmOutcome, action: 'end_call' };
    await startCall();
    ttsHandlersByCall[0].onComplete();
    await flushPromises();

    sttHandlers.onTranscript({ text: "that's all, bye", isFinal: true });
    await flushPromises();

    expect(evaluateAndTransfer).toHaveBeenCalled();
    expect(hangupCall).toHaveBeenCalledWith('provider-call-1');
  });

  it('notifies AI_ERROR on the lead when a turn throws, without crashing the pipeline', async () => {
    await startCall();
    ttsHandlersByCall[0].onComplete();
    await flushPromises();

    reasonFn.mockImplementationOnce(() =>
      Promise.reject(new Error('LLM timeout')),
    );
    (prisma.call.findUnique as jest.Mock).mockResolvedValueOnce({
      leadId: 'lead-1',
      lead: { name: 'Asha Verma', assignedToId: 'exec-1' },
    });

    sttHandlers.onTranscript({ text: 'hello', isFinal: true });
    await flushPromises();
    await flushPromises();

    expect(resolveLeadRecipient).toHaveBeenCalledWith('exec-1');
    expect(notificationsCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'exec-1',
        type: 'AI_ERROR',
        leadId: 'lead-1',
        callId: 'call-1',
        body: 'LLM timeout',
      }),
    );
  });

  it('skips the AI_ERROR notification when there is no rep or fallback manager', async () => {
    await startCall();
    ttsHandlersByCall[0].onComplete();
    await flushPromises();

    reasonFn.mockImplementationOnce(() =>
      Promise.reject(new Error('LLM timeout')),
    );
    (prisma.call.findUnique as jest.Mock).mockResolvedValueOnce({
      leadId: 'lead-1',
      lead: { name: 'Asha Verma', assignedToId: null },
    });
    resolveLeadRecipient.mockResolvedValueOnce(null);

    sttHandlers.onTranscript({ text: 'hello', isFinal: true });
    await flushPromises();
    await flushPromises();

    expect(notificationsCreate).not.toHaveBeenCalled();
  });

  it('stop() closes the STT stream and cancels any active TTS', async () => {
    await startCall();
    service.stop('call-1');

    expect(sttStreamClose).toHaveBeenCalled();
    expect(ttsCancel).toHaveBeenCalled();
    expect(conversation.has('call-1')).toBe(false);
  });
});
