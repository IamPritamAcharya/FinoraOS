import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthService } from '../auth/auth.service.js';
import {
  CreateAgentSkillSchema,
  CreateBudgetSchema,
  CreateOrganizationNodeSchema,
  UpdateAgentSkillSchema,
} from './workspace.schemas.js';
import { WorkspaceService } from './workspace.service.js';

@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly workspace: WorkspaceService,
    private readonly auth: AuthService,
  ) {}

  @Get('organization') organization() {
    return this.workspace.organization(this.auth.currentPrincipal());
  }
  @Post('organization/nodes') createOrganizationNode(@Body() body: unknown) {
    return this.workspace.createOrganizationNode(
      this.auth.currentPrincipal(),
      CreateOrganizationNodeSchema.parse(body),
    );
  }
  @Post('budgets') createBudget(@Body() body: unknown) {
    return this.workspace.createBudget(
      this.auth.currentPrincipal(),
      CreateBudgetSchema.parse(body),
    );
  }
  @Get('expenses') expenses() {
    return this.workspace.expenses(this.auth.currentPrincipal());
  }
  @Post('expenses/:id/receipt')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024, files: 1 } }))
  receipt(
    @Param('id') id: string,
    @UploadedFile()
    file: { originalname: string; mimetype: string; size: number; buffer: Buffer } | undefined,
  ) {
    if (!file) throw new BadRequestException('A receipt file is required.');
    return this.workspace.uploadReceipt(this.auth.currentPrincipal(), id, file);
  }
  @Get('skills') skills() {
    return this.workspace.skills(this.auth.currentPrincipal());
  }
  @Post('skills') createSkill(@Body() body: unknown) {
    return this.workspace.createSkill(
      this.auth.currentPrincipal(),
      CreateAgentSkillSchema.parse(body),
    );
  }
  @Patch('skills/:id') updateSkill(@Param('id') id: string, @Body() body: unknown) {
    return this.workspace.updateSkillStatus(
      this.auth.currentPrincipal(),
      id,
      UpdateAgentSkillSchema.parse(body).status,
    );
  }
  @Get('agent-audit') agentAudit() {
    return this.workspace.agentAudit(this.auth.currentPrincipal());
  }
  @Get('notifications') notifications() {
    return this.workspace.notifications(this.auth.currentPrincipal());
  }
  @Post('notifications/:id/read') markRead(@Param('id') id: string) {
    return this.workspace.markNotificationRead(this.auth.currentPrincipal(), id);
  }
  @Get('operations') operations() {
    return this.workspace.operations(this.auth.currentPrincipal());
  }
  @Post('jobs/:id/run') runJob(@Param('id') id: string) {
    return this.workspace.runReceiptReminderJob(this.auth.currentPrincipal(), id);
  }
}
