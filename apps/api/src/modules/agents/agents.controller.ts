import { Controller, Param, Post } from '@nestjs/common';
import { AgentsService } from './agents.service.js';
@Controller('agents')
export class AgentsController {
  constructor(private readonly service: AgentsService) {}
  @Post('exceptions/:id/investigate') investigate(@Param('id') id: string) {
    return this.service.investigate(id);
  }
}
