import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { AuditService } from './audit.service.js';

const AuditQuerySchema = z.object({
  search: z.string().trim().max(100).optional(),
  source: z.string().trim().max(50).optional(),
  entityType: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().min(1).max(250).optional(),
});

@Controller('audit')
export class AuditController {
  constructor(
    private readonly audit: AuditService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  list(@Query() query: unknown) {
    return this.audit.list(this.auth.currentPrincipal(), AuditQuerySchema.parse(query));
  }
}
