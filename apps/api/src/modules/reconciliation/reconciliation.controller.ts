import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { ReconciliationService } from './reconciliation.service.js';
import { AuthService } from '../auth/auth.service.js';
import { WorkspacePermission } from '@finora/platform';
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly service: ReconciliationService,
    private readonly auth: AuthService,
  ) {}
  @Get('runs/latest') latest() {
    return this.service.latestRun(this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE));
  }
  @Get('exceptions') exceptions() {
    return this.service.exceptions(
      this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE),
    );
  }
  @Post('runs') run() {
    return this.service.run(this.auth.require(WorkspacePermission.REVIEW_EXPENSE));
  }
  @Post('exceptions/:id/approve') approve(@Param('id') id: string) {
    return this.service.approve(this.auth.require(WorkspacePermission.APPROVE_FINANCE_ACTION), id);
  }
  @Post('exceptions/:id/reject') reject(@Param('id') id: string, @Body() body: unknown) {
    const { reason } = z.object({ reason: z.string().trim().min(3).max(500) }).parse(body);
    return this.service.reject(
      this.auth.require(WorkspacePermission.APPROVE_FINANCE_ACTION),
      id,
      reason,
    );
  }
}
