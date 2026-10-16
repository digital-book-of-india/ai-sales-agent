import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  DIALER_QUEUE,
  DIAL_JOB,
  TICK_JOB,
  DialerService,
} from './dialer.service';

interface DialJobData {
  queueItemId: string;
}

@Processor(DIALER_QUEUE, { concurrency: 10 })
export class DialerProcessor extends WorkerHost {
  private readonly logger = new Logger(DialerProcessor.name);

  constructor(private readonly dialerService: DialerService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case TICK_JOB:
        await this.dialerService.runTick();
        return;
      case DIAL_JOB: {
        const { queueItemId } = job.data as DialJobData;
        await this.dialerService.processDial(queueItemId);
        return;
      }
      default:
        this.logger.warn(`Unknown dialer job: ${job.name}`);
    }
  }
}
