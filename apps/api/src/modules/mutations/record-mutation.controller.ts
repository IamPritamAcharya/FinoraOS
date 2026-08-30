import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from '../auth/auth.service.js';
import { RecordMutationService } from './record-mutation.service.js';

const RejectSchema = z.object({ reason: z.string().trim().min(3).max(500) });
const UpdateSchema = z.object({
  expectedVersion: z.number().int().positive(),
  mutation: z.unknown(),
});

@Controller()
export class RecordMutationController {
  constructor(
    private readonly mutations: RecordMutationService,
    private readonly auth: AuthService,
  ) {}

  @Get('mutations') list() {
    return this.mutations.list(this.auth.currentPrincipal());
  }
  @Post('mutations/:id/approve') approve(@Param('id') id: string) {
    return this.mutations.approve(this.auth.currentPrincipal(), id);
  }
  @Post('mutations/:id/reject') reject(@Param('id') id: string, @Body() body: unknown) {
    return this.mutations.reject(this.auth.currentPrincipal(), id, RejectSchema.parse(body).reason);
  }
  @Post('finance/records') create(@Body() body: unknown) {
    return this.mutations.createRecord(this.auth.currentPrincipal(), body);
  }
  @Patch('finance/records/:id') update(@Param('id') id: string, @Body() body: unknown) {
    const parsed = UpdateSchema.parse(body);
    const mutation = parsed.mutation as Record<string, unknown>;
    return this.mutations.updateRecord(
      this.auth.currentPrincipal(),
      { ...mutation, recordId: id },
      { expectedVersion: parsed.expectedVersion },
    );
  }
}
