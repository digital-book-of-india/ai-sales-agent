import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { FollowUpsController } from './follow-ups.controller';
import { FollowUpsService, FOLLOW_UPS_QUEUE } from './follow-ups.service';
import { FollowUpsProcessor } from './follow-ups.processor';
import { CallingModule } from '../calling/calling.module';
import { ActivityModule } from '../activity/activity.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    // BullModule.forRootAsync (registered once, in CallingModule) is
    // { global: true } — registerQueue here just needs that shared
    // connection config to already be in the graph, not re-imported.
    BullModule.registerQueue({ name: FOLLOW_UPS_QUEUE }),
    // For CallingQueueService.requeueForFollowUp — see
    // FollowUpsService.processDue.
    CallingModule,
    ActivityModule,
    NotificationsModule,
  ],
  controllers: [FollowUpsController],
  providers: [FollowUpsService, FollowUpsProcessor],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
