import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { validateEnv } from './config/env.validation';
import { RedisModule } from './config/redis.module';
import { PrismaModule } from './prisma/prisma.module';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { LeadsModule } from './leads/leads.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { CallingModule } from './calling/calling.module';
import { AiAgentsModule } from './ai-agents/ai-agents.module';
import { KnowledgeBaseModule } from './knowledge-base/knowledge-base.module';
import { SalesPlaybooksModule } from './sales-playbooks/sales-playbooks.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { ActivityModule } from './activity/activity.module';
import { FollowUpsModule } from './follow-ups/follow-ups.module';
import { MeetingsModule } from './meetings/meetings.module';
import { PipelineModule } from './pipeline/pipeline.module';
import { DealsModule } from './deals/deals.module';
import { TasksModule } from './tasks/tasks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { TeamModule } from './team/team.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    RedisModule,
    PrismaModule,
    HealthModule,
    AuthModule,
    LeadsModule,
    CampaignsModule,
    DashboardModule,
    AnalyticsModule,
    CallingModule,
    AiAgentsModule,
    KnowledgeBaseModule,
    SalesPlaybooksModule,
    SystemSettingsModule,
    ActivityModule,
    FollowUpsModule,
    MeetingsModule,
    PipelineModule,
    DealsModule,
    TasksModule,
    NotificationsModule,
    TeamModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
