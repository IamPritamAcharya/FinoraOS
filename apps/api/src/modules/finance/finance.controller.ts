import { Controller, Get, Query } from '@nestjs/common';
import { FinanceService } from './finance.service.js';
import { AuthService } from '../auth/auth.service.js';
import { WorkspacePermission } from '@finora/platform';
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly auth: AuthService,
  ) {}
  @Get('overview') overview() {
    return this.finance.overview(this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE));
  }
  @Get('transactions') transactions(@Query('q') q?: string) {
    return this.finance.transactions(
      this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE),
      q,
    );
  }
  @Get('settlements') settlements() {
    return this.finance.settlements(
      this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE),
    );
  }
  @Get('invoices') invoices() {
    return this.finance.invoices(this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE));
  }
  @Get('cash-movements') cashMovements() {
    return this.finance.cashMovements(
      this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE),
    );
  }
  @Get('tax-lines') taxLines() {
    return this.finance.taxLines(this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE));
  }
  @Get('expense-claims') expenseClaims() {
    return this.finance.expenseClaims(this.auth.require(WorkspacePermission.VIEW_OWN_FINANCE));
  }
  @Get('record-options') recordOptions() {
    return this.finance.recordOptions(
      this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE),
    );
  }
  @Get('forecast') forecast() {
    return this.finance.forecast(this.auth.require(WorkspacePermission.VIEW_ORGANIZATION_FINANCE));
  }
}
