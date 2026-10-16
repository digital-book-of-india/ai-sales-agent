import { Module } from '@nestjs/common';
import { SalesPlaybooksController } from './sales-playbooks.controller';
import { SalesPlaybooksService } from './sales-playbooks.service';
import { PlaybookQuestionsController } from './playbook-questions.controller';
import { PlaybookQuestionsService } from './playbook-questions.service';

@Module({
  controllers: [SalesPlaybooksController, PlaybookQuestionsController],
  providers: [SalesPlaybooksService, PlaybookQuestionsService],
  // Consumed by CallingModule's AI voice pipeline (see
  // ../calling/ai-voice/voice-session.service.ts) to load the agent's
  // playbook questions/rules for a live call.
  exports: [SalesPlaybooksService],
})
export class SalesPlaybooksModule {}
