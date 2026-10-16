import {
  BadGatewayException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { RecordingsService, RECORDINGS_QUEUE } from './recordings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { TELEPHONY_PROVIDER } from '../telephony/telephony-provider.token';
import { RecordingRetentionStatus } from '../../../generated/prisma/enums';
import { signRecordingToken } from './recording-url.util';

describe('RecordingsService', () => {
  let service: RecordingsService;
  let prisma: {
    call: { findUnique: jest.Mock };
    recording: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let provider: { getRecording: jest.Mock };
  let queue: { add: jest.Mock };
  let fetchMock: jest.Mock;

  const SECRET = 'test-secret';

  const recordingRow = (overrides: Record<string, unknown> = {}) => ({
    id: 'rec-1',
    callId: 'call-1',
    recordingUrl: 'https://provider.example/rec.mp3',
    duration: 42,
    startedAt: new Date('2026-08-21T10:00:00Z'),
    endedAt: new Date('2026-08-21T10:00:42Z'),
    storageProvider: 'mock',
    retentionStatus: RecordingRetentionStatus.ACTIVE,
    createdAt: new Date('2026-08-21T10:00:42Z'),
    ...overrides,
  });

  beforeEach(async () => {
    prisma = {
      call: { findUnique: jest.fn() },
      recording: { findUnique: jest.fn(), upsert: jest.fn() },
    };
    provider = { getRecording: jest.fn() };
    queue = { add: jest.fn() };
    fetchMock = jest.fn();
    global.fetch = fetchMock;

    const moduleRef = await Test.createTestingModule({
      providers: [
        RecordingsService,
        { provide: PrismaService, useValue: prisma },
        { provide: TELEPHONY_PROVIDER, useValue: provider },
        { provide: getQueueToken(RECORDINGS_QUEUE), useValue: queue },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === 'RECORDING_URL_SECRET' ? SECRET : undefined,
            getOrThrow: (key: string) =>
              key === 'JWT_SECRET' ? SECRET : undefined,
          },
        },
      ],
    }).compile();

    service = moduleRef.get(RecordingsService);
  });

  describe('enqueueFetch', () => {
    it('queues a fetch-recording job keyed to the call id, with retry backoff', async () => {
      await service.enqueueFetch('call-1');

      expect(queue.add).toHaveBeenCalledWith(
        'fetch-recording',
        { callId: 'call-1' },
        expect.objectContaining({
          jobId: 'fetch-recording-call-1',
          attempts: 5,
        }),
      );
    });
  });

  describe('fetchAndStore', () => {
    it('does nothing when the call has no providerCallId yet', async () => {
      prisma.call.findUnique.mockResolvedValue({
        id: 'call-1',
        providerCallId: null,
      });

      await service.fetchAndStore('call-1');

      expect(provider.getRecording).not.toHaveBeenCalled();
      expect(prisma.recording.upsert).not.toHaveBeenCalled();
    });

    it('throws (to trigger a BullMQ retry) when the provider has no recording yet', async () => {
      prisma.call.findUnique.mockResolvedValue({
        id: 'call-1',
        providerCallId: 'prov-1',
      });
      provider.getRecording.mockResolvedValue({ url: null });

      await expect(service.fetchAndStore('call-1')).rejects.toThrow();
      expect(prisma.recording.upsert).not.toHaveBeenCalled();
    });

    it('upserts a recording row once the provider has a URL', async () => {
      prisma.call.findUnique.mockResolvedValue({
        id: 'call-1',
        providerCallId: 'prov-1',
        provider: 'mock',
        duration: 42,
        startedAt: new Date('2026-08-21T10:00:00Z'),
        endedAt: new Date('2026-08-21T10:00:42Z'),
      });
      provider.getRecording.mockResolvedValue({
        url: 'https://provider.example/rec.mp3',
      });

      await service.fetchAndStore('call-1');

      const [args] = prisma.recording.upsert.mock.calls[0] as [
        { where: { callId: string }; create: Record<string, unknown> },
      ];
      expect(args.where).toEqual({ callId: 'call-1' });
      expect(args.create).toMatchObject({
        callId: 'call-1',
        recordingUrl: 'https://provider.example/rec.mp3',
        storageProvider: 'mock',
      });
    });
  });

  describe('getForCall', () => {
    it('returns null when there is no recording for the call', async () => {
      prisma.recording.findUnique.mockResolvedValue(null);
      expect(await service.getForCall('call-1')).toBeNull();
    });

    it('returns null (not a signed URL) once the recording has expired retention', async () => {
      prisma.recording.findUnique.mockResolvedValue(
        recordingRow({ retentionStatus: RecordingRetentionStatus.EXPIRED }),
      );
      expect(await service.getForCall('call-1')).toBeNull();
    });

    it('returns a summary with a signed inline playUrl', async () => {
      prisma.recording.findUnique.mockResolvedValue(recordingRow());

      const summary = await service.getForCall('call-1');

      expect(summary?.id).toBe('rec-1');
      expect(summary?.playUrl).toContain('/calling/recordings/rec-1/stream');
      expect(summary?.playUrl).toContain('disp=inline');
    });
  });

  describe('getDownloadUrl', () => {
    it('throws NotFoundException for a missing recording', async () => {
      prisma.recording.findUnique.mockResolvedValue(null);
      await expect(service.getDownloadUrl('missing')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws GoneException for a non-active recording', async () => {
      prisma.recording.findUnique.mockResolvedValue(
        recordingRow({ retentionStatus: RecordingRetentionStatus.DELETED }),
      );
      await expect(service.getDownloadUrl('rec-1')).rejects.toThrow(
        GoneException,
      );
    });

    it('mints a signed attachment URL for an active recording', async () => {
      prisma.recording.findUnique.mockResolvedValue(recordingRow());

      const { url } = await service.getDownloadUrl('rec-1');

      expect(url).toContain('disp=attachment');
    });
  });

  describe('resolveStream', () => {
    it('rejects an invalid/expired signature', async () => {
      await expect(
        service.resolveStream('rec-1', {
          exp: String(Date.now() + 60_000),
          disp: 'inline',
          sig: 'bogus',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('synthesizes a mock tone for a mock-storage recording, without touching fetch', async () => {
      prisma.recording.findUnique.mockResolvedValue(recordingRow());

      const expiresAt = Date.now() + 60_000;
      const sig = signRecordingToken(
        { recordingId: 'rec-1', disposition: 'inline', expiresAt },
        SECRET,
      );

      const result = await service.resolveStream('rec-1', {
        exp: String(expiresAt),
        disp: 'inline',
        sig,
      });

      expect(result.disposition).toBe('inline');
      expect(result.contentType).toBe('audio/wav');
      expect(result.body.length).toBeGreaterThan(0);
      expect(result.filename).toBe('recording-call-1.wav');
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches the audio bytes from storage for a non-mock (Asterisk) recording and names the file .wav to match MixMonitor/nginx', async () => {
      prisma.recording.findUnique.mockResolvedValue(
        recordingRow({
          storageProvider: 'asterisk',
          recordingUrl: 'https://recordings.internal/call-1.wav',
        }),
      );
      // Real Asterisk deployment: nginx's default_type is audio/wav (see
      // infra/asterisk/nginx/recordings-internal.conf) — not the mp3 the
      // pre-Asterisk Exotel integration used to deliver.
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'audio/wav' },
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      });

      const expiresAt = Date.now() + 60_000;
      const sig = signRecordingToken(
        { recordingId: 'rec-1', disposition: 'inline', expiresAt },
        SECRET,
      );

      const result = await service.resolveStream('rec-1', {
        exp: String(expiresAt),
        disp: 'inline',
        sig,
      });

      expect(result.disposition).toBe('inline');
      expect(result.contentType).toBe('audio/wav');
      expect(result.body).toEqual(Buffer.from([1, 2, 3]));
      expect(result.filename).toBe('recording-call-1.wav');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://recordings.internal/call-1.wav',
      );
    });

    it('derives the filename extension from Content-Type rather than storageProvider', async () => {
      prisma.recording.findUnique.mockResolvedValue(
        recordingRow({
          storageProvider: 'asterisk',
          recordingUrl: 'https://provider.example/rec.mp3',
        }),
      );
      fetchMock.mockResolvedValue({
        ok: true,
        headers: { get: () => 'audio/mpeg' },
        arrayBuffer: () => Promise.resolve(new Uint8Array([1, 2, 3]).buffer),
      });

      const expiresAt = Date.now() + 60_000;
      const sig = signRecordingToken(
        { recordingId: 'rec-1', disposition: 'inline', expiresAt },
        SECRET,
      );

      const result = await service.resolveStream('rec-1', {
        exp: String(expiresAt),
        disp: 'inline',
        sig,
      });

      expect(result.filename).toBe('recording-call-1.mp3');
    });

    it('surfaces a BadGatewayException when the upstream fetch fails for a non-mock recording', async () => {
      prisma.recording.findUnique.mockResolvedValue(
        recordingRow({ storageProvider: 'asterisk' }),
      );
      fetchMock.mockResolvedValue({ ok: false, status: 502 });

      const expiresAt = Date.now() + 60_000;
      const sig = signRecordingToken(
        { recordingId: 'rec-1', disposition: 'inline', expiresAt },
        SECRET,
      );

      await expect(
        service.resolveStream('rec-1', {
          exp: String(expiresAt),
          disp: 'inline',
          sig,
        }),
      ).rejects.toThrow(BadGatewayException);
    });
  });
});
