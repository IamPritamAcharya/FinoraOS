import { Controller, Get, Param, Post } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service.js';
@Controller('reconciliation')
export class ReconciliationController {
  constructor(private readonly service: ReconciliationService) {}
  @Get('runs/latest') latest() {
    return this.service.latestRun();
  }
  @Get('exceptions') exceptions() {
    return this.service.exceptions();
  }
  @Post('exceptions/:id/approve') approve(@Param('id') id: string) {
    return this.service.approve(id);
  }
}
