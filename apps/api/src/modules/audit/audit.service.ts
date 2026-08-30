import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  WorkspacePermission,
  hasWorkspacePermission,
  type RequestPrincipal,
} from '@finora/platform';
import { Prisma, type PrismaClient } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';

type AuditClient = Pick<PrismaClient, 'auditLog'>;

export type AuditEntry = {
  action: string;
  entityType: string;
  entityId?: string;
  details?: Prisma.InputJsonValue;
  actorType?: 'USER' | 'AGENT' | 'SYSTEM';
  source?: string;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(principal: RequestPrincipal, entry: AuditEntry, client: AuditClient = this.prisma) {
    return client.auditLog.create({
      data: {
        organizationId: principal.organizationId,
        actor: principal.userId,
        actorType: entry.actorType ?? 'USER',
        source: entry.source ?? 'APPLICATION',
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        details: entry.details ?? Prisma.JsonNull,
      },
    });
  }

  async list(
    principal: RequestPrincipal,
    query: { search?: string; source?: string; entityType?: string; limit?: number },
  ) {
    if (
      !hasWorkspacePermission(principal, WorkspacePermission.VIEW_AUDIT) &&
      !hasWorkspacePermission(principal, WorkspacePermission.VIEW_AGENT_AUDIT)
    ) {
      throw new ForbiddenException('Your workspace role cannot view the audit trail.');
    }
    const take = Math.min(query.limit ?? 100, 250);
    const [events, runs, users] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          organizationId: principal.organizationId,
          ...(query.source ? { source: query.source } : {}),
          ...(query.entityType ? { entityType: query.entityType } : {}),
          ...(query.search
            ? {
                OR: [
                  { action: { contains: query.search, mode: 'insensitive' } },
                  { entityType: { contains: query.search, mode: 'insensitive' } },
                  { entityId: { contains: query.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        take,
      }),
      this.prisma.agentRun.findMany({
        where: { organizationId: principal.organizationId },
        include: {
          skill: { select: { name: true, version: true } },
          steps: { orderBy: { createdAt: 'asc' } },
        },
        orderBy: { startedAt: 'desc' },
        take: Math.min(take, 100),
      }),
      this.prisma.user.findMany({
        where: { organizationId: principal.organizationId },
        select: { id: true, name: true, email: true },
      }),
    ]);
    const usersById = new Map(users.map((user) => [user.id, user]));
    return {
      events: events.map((event) => ({ ...event, actorUser: usersById.get(event.actor) ?? null })),
      agentRuns: runs,
      summary: {
        events: events.length,
        agentRuns: runs.length,
        mutations: events.filter((event) => event.entityType === 'MutationProposal').length,
        failures: runs.filter((run) => run.status === 'FAILED').length,
      },
    };
  }
}
