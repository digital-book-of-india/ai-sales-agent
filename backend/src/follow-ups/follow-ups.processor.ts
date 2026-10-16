import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  FOLLOW_UPS_QUEUE,
  FOLLOW_UPS_TICK_JOB,
  FollowUpsService,
} from './follow-ups.service';

@Processor(FOLLOW_UPS_QUEUE)
export class FollowUpsProcessor extends WorkerHost {
  private readonly logger = new Logger(FollowUpsProcessor.name);

  constructor(private readonly followUpsService: FollowUpsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case FOLLOW_UPS_TICK_JOB:
        await this.followUpsService.processDue();
        return;
      default:
        this.logger.warn(`Unknown follow-ups job: ${job.name}`);
    }
  }
}
