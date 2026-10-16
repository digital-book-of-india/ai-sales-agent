import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import type { Job } from 'bullmq';
import {
  ANALYZE_CALL_JOB,
  CALL_ANALYSIS_QUEUE,
  CallAnalysisService,
} from './call-analysis.service';

interface AnalyzeCallJobData {
  callId: string;
}

@Processor(CALL_ANALYSIS_QUEUE, { concurrency: 3 })
export class CallAnalysisProcessor extends WorkerHost {
  private readonly logger = new Logger(CallAnalysisProcessor.name);

  constructor(private readonly callAnalysisService: CallAnalysisService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case ANALYZE_CALL_JOB: {
        const { callId } = job.data as AnalyzeCallJobData;
        await this.callAnalysisService.analyze(callId);
        return;
      }
      default:
        this.logger.warn(`Unknown call-analysis job: ${job.name}`);
    }
  }
}
