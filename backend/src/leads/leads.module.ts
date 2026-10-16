import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { LeadImportService } from './import/lead-import.service';
import { LeadImportStoreService } from './import/lead-import-store.service';
import { UsersModule } from '../users/users.module';
import { CallingModule } from '../calling/calling.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  // CallingModule is imported for ManualCallService — see
  // LeadsController's POST :id/call (click-to-call, Prompt C). ActivityModule
  // backs GET :id/activity (the Lead Detail page's activity timeline).
  imports: [UsersModule, CallingModule, ActivityModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadImportService, LeadImportStoreService],
})
export class LeadsModule {}
