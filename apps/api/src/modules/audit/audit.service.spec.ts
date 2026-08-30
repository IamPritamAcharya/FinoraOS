import { ForbiddenException } from '@nestjs/common';
import { WorkspaceRole, type RequestPrincipal } from '@finora/platform';
import { describe, expect, it, vi } from 'vitest';
import { AuditService } from './audit.service.js';

describe('AuditService', () => {
  it('scopes site and agent audit reads to the authenticated organization', async () => {
    const prisma = {
      auditLog: { findMany: vi.fn().mockResolvedValue([]) },
      agentRun: { findMany: vi.fn().mockResolvedValue([]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const principal: RequestPrincipal = {
      organizationId: 'org-a',
      userId: 'auditor-a',
      role: WorkspaceRole.AUDITOR,
    };
    await new AuditService(prisma as never).list(principal, { limit: 50 });
    expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' }, take: 50 }),
    );
    expect(prisma.agentRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' }, take: 50 }),
    );
    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { organizationId: 'org-a' } }),
    );
  });

  it('denies roles without audit permission', async () => {
    const service = new AuditService({} as never);
    await expect(
      service.list(
        { organizationId: 'org-a', userId: 'employee-a', role: WorkspaceRole.EMPLOYEE },
        {},
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
