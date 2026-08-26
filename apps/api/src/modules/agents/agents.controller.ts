import { Controller, Param, Post } from '@nestjs/common';
import { AgentsService } from './agents.service.js';
import { AuthService } from '../auth/auth.service.js';
@Controller('agents')
export class AgentsController {
  constructor(
    private readonly service: AgentsService,
    private readonly auth: AuthService,
  ) {}
  @Post('exceptions/:id/investigate') investigate(@Param('id') id: string) {
    return this.service.investigate(this.auth.currentPrincipal(), id);
  }
}
