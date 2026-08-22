import { Controller, Get, Query } from '@nestjs/common';
import { FinanceService } from './finance.service.js';
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}
  @Get('overview') overview() {
    return this.finance.overview();
  }
  @Get('transactions') transactions(@Query('q') q?: string) {
    return this.finance.transactions(q);
  }
  @Get('settlements') settlements() {
    return this.finance.settlements();
  }
  @Get('tax-lines') taxLines() {
    return this.finance.taxLines();
  }
  @Get('forecast') forecast() {
    return this.finance.forecast();
  }
}
