import { Controller, Get, Query } from '@nestjs/common';
import { FinanceService } from './finance.service.js';
import { AuthService } from '../auth/auth.service.js';
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly auth: AuthService,
  ) {}
  @Get('overview') overview() {
    return this.finance.overview(this.auth.currentPrincipal());
  }
  @Get('transactions') transactions(@Query('q') q?: string) {
    return this.finance.transactions(this.auth.currentPrincipal(), q);
  }
  @Get('settlements') settlements() {
    return this.finance.settlements(this.auth.currentPrincipal());
  }
  @Get('invoices') invoices() {
    return this.finance.invoices(this.auth.currentPrincipal());
  }
  @Get('cash-movements') cashMovements() {
    return this.finance.cashMovements(this.auth.currentPrincipal());
  }
  @Get('tax-lines') taxLines() {
    return this.finance.taxLines(this.auth.currentPrincipal());
  }
  @Get('forecast') forecast() {
    return this.finance.forecast(this.auth.currentPrincipal());
  }
}
