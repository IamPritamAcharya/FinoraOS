import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { apiLogger } from '../../common/api-logger.js';
import { WorkspaceService } from './workspace.service.js';

@Injectable()
export class WorkspaceScheduler {
  constructor(private readonly workspace: WorkspaceService) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'finora-due-finance-jobs', waitForCompletion: true })
  async runDueJobs() {
    if (process.env.AUTOMATION_JOBS_ENABLED === 'false') return;
    const count = await this.workspace.runDueReceiptReminderJobs();
    if (count) apiLogger.info('Due finance automation jobs completed', { jobCount: count });
  }
}
