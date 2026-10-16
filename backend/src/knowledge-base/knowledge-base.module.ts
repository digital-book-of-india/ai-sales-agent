import { Module } from '@nestjs/common';
import { KnowledgeBaseController } from './knowledge-base.controller';
import { KnowledgeBaseService } from './knowledge-base.service';
import { FaqsController } from './faqs.controller';
import { FaqsService } from './faqs.service';
import { ObjectionsController } from './objections.controller';
import { ObjectionsService } from './objections.service';

@Module({
  controllers: [KnowledgeBaseController, FaqsController, ObjectionsController],
  providers: [KnowledgeBaseService, FaqsService, ObjectionsService],
  // Consumed by CallingModule's AI voice pipeline (see
  // ../calling/ai-voice/knowledge-retrieval.service.ts) to ground live-call
  // responses in this agent's knowledge base.
  exports: [KnowledgeBaseService],
})
export class KnowledgeBaseModule {}
