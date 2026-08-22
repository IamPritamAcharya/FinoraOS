import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ExceptionStatus } from '@finora/platform';
const org = () => process.env.DEMO_ORGANIZATION_ID ?? 'demo-org';
@Injectable()
export class ReconciliationService {
  constructor(private readonly prisma: PrismaService) {}
  latestRun() {
    return this.prisma.reconciliationRun.findFirst({
      where: { organizationId: org() },
      orderBy: { startedAt: 'desc' },
      include: { matches: true, exceptions: true },
    });
  }
  exceptions() {
    return this.prisma.exception.findMany({
      where: { organizationId: org() },
      include: { evidence: true, agentRuns: { include: { steps: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
  async approve(id: string) {
    return this.prisma.exception.update({
      where: { id },
      data: {
        status: ExceptionStatus.RESOLVED,
        resolution: { approved: true, actor: 'demo.finance@finora.local' },
      },
    });
  }
}
