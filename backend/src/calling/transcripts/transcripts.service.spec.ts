import { Test } from '@nestjs/testing';
import { TranscriptsService } from './transcripts.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CallingGateway } from '../calling.gateway';
import { TranscriptSpeaker } from '../../../generated/prisma/enums';

describe('TranscriptsService', () => {
  let service: TranscriptsService;
  let prisma: {
    transcript: {
      findUnique: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    transcriptMessage: { create: jest.Mock };
  };
  let gateway: { emitTranscriptEvent: jest.Mock };

  beforeEach(async () => {
    prisma = {
      transcript: {
        findUnique: jest.fn(),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      transcriptMessage: { create: jest.fn() },
    };
    gateway = { emitTranscriptEvent: jest.fn() };

    const moduleRef = await Test.createTestingModule({
      providers: [
        TranscriptsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CallingGateway, useValue: gateway },
      ],
    }).compile();

    service = moduleRef.get(TranscriptsService);
  });

  describe('addMessage', () => {
    it('creates a transcript on the first message for a call', async () => {
      prisma.transcript.findUnique.mockResolvedValue(null);
      prisma.transcript.create.mockResolvedValue({ id: 'transcript-1' });
      prisma.transcriptMessage.create.mockResolvedValue({
        id: 'msg-1',
        speaker: TranscriptSpeaker.CUSTOMER,
        text: 'Hello there',
        timestamp: new Date('2026-08-26T10:00:00Z'),
        confidence: 0.92,
      });

      await service.addMessage(
        'call-1',
        TranscriptSpeaker.CUSTOMER,
        'Hello there',
        0.92,
      );

      expect(prisma.transcript.create).toHaveBeenCalledWith({
        data: { callId: 'call-1' },
        select: { id: true },
      });
      expect(prisma.transcriptMessage.create).toHaveBeenCalledWith({
        data: {
          transcriptId: 'transcript-1',
          speaker: TranscriptSpeaker.CUSTOMER,
          text: 'Hello there',
          confidence: 0.92,
        },
      });
    });

    it('reuses the existing transcript on later messages for the same call', async () => {
      prisma.transcript.findUnique.mockResolvedValue({ id: 'transcript-1' });
      prisma.transcriptMessage.create.mockResolvedValue({
        id: 'msg-2',
        speaker: TranscriptSpeaker.AI,
        text: 'How can I help?',
        timestamp: new Date('2026-08-26T10:00:05Z'),
        confidence: null,
      });

      await service.addMessage(
        'call-1',
        TranscriptSpeaker.AI,
        'How can I help?',
      );

      expect(prisma.transcript.create).not.toHaveBeenCalled();
      expect(prisma.transcriptMessage.create).toHaveBeenCalledWith({
        data: {
          transcriptId: 'transcript-1',
          speaker: TranscriptSpeaker.AI,
          text: 'How can I help?',
          confidence: null,
        },
      });
    });

    it('emits transcript.updated with the saved message', async () => {
      prisma.transcript.findUnique.mockResolvedValue({ id: 'transcript-1' });
      prisma.transcriptMessage.create.mockResolvedValue({
        id: 'msg-3',
        speaker: TranscriptSpeaker.CUSTOMER,
        text: 'Sure, sounds good',
        timestamp: new Date('2026-08-26T10:00:10Z'),
        confidence: 0.87,
      });

      await service.addMessage(
        'call-1',
        TranscriptSpeaker.CUSTOMER,
        'Sure, sounds good',
        0.87,
      );

      expect(gateway.emitTranscriptEvent).toHaveBeenCalledWith(
        'transcript.updated',
        {
          callId: 'call-1',
          message: {
            id: 'msg-3',
            speaker: TranscriptSpeaker.CUSTOMER,
            text: 'Sure, sounds good',
            timestamp: '2026-08-26T10:00:10.000Z',
            confidence: 0.87,
          },
        },
      );
    });

    it('ignores blank/whitespace-only text without writing or emitting', async () => {
      await service.addMessage('call-1', TranscriptSpeaker.CUSTOMER, '   ');

      expect(prisma.transcript.findUnique).not.toHaveBeenCalled();
      expect(prisma.transcriptMessage.create).not.toHaveBeenCalled();
      expect(gateway.emitTranscriptEvent).not.toHaveBeenCalled();
    });
  });

  describe('finalize', () => {
    it('stamps finalizedAt on the open transcript for the call', async () => {
      prisma.transcript.updateMany.mockResolvedValue({ count: 1 });

      await service.finalize('call-1');

      expect(prisma.transcript.updateMany).toHaveBeenCalledWith({
        where: { callId: 'call-1', finalizedAt: null },
        data: { finalizedAt: expect.any(Date) as Date },
      });
    });

    it('does not throw when the call never had a transcript', async () => {
      prisma.transcript.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.finalize('call-without-transcript'),
      ).resolves.toBeUndefined();
    });
  });

  describe('getForCall', () => {
    it('returns the transcript with its messages in speaking order', async () => {
      const transcript = {
        id: 'transcript-1',
        callId: 'call-1',
        finalizedAt: null,
        createdAt: new Date('2026-08-26T10:00:00Z'),
        messages: [],
      };
      prisma.transcript.findUnique.mockResolvedValue(transcript);

      const result = await service.getForCall('call-1');

      expect(prisma.transcript.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ where: { callId: 'call-1' } }),
      );
      expect(result).toBe(transcript);
    });

    it('returns null (not a 404) when the call has no transcript', async () => {
      prisma.transcript.findUnique.mockResolvedValue(null);

      const result = await service.getForCall('call-without-transcript');

      expect(result).toBeNull();
    });
  });
});
