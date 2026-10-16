import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  FETCH_RECORDING_JOB,
  RECORDINGS_QUEUE,
  RecordingsService,
} from './recordings.service';

interface FetchRecordingJobData {
  callId: string;
}

@Processor(RECORDINGS_QUEUE, { concurrency: 5 })
export class RecordingsProcessor extends WorkerHost {
  private readonly logger = new Logger(RecordingsProcessor.name);

  constructor(private readonly recordingsService: RecordingsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case FETCH_RECORDING_JOB: {
        const { callId } = job.data as FetchRecordingJobData;
        await this.recordingsService.fetchAndStore(callId);
        return;
      }
      default:
        this.logger.warn(`Unknown recordings job: ${job.name}`);
    }
  }
}
