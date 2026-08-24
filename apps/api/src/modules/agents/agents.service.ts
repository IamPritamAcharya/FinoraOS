import { Inject, Injectable } from '@nestjs/common';
import { ExceptionInvestigator } from '@finora/agents';
import { apiLogger } from '../../common/api-logger.js';
import { AI_GATEWAY, type AiGateway } from '../../gateways/ai/ai.gateway.js';
import { ExceptionInvestigatorAiGateway } from '../../gateways/ai/exception-investigator-ai.gateway.js';
import { PrismaService } from '../../prisma/prisma.service.js';
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(AI_GATEWAY) private readonly ai: AiGateway,
  ) {}
  async investigate(exceptionId: string) {
    apiLogger.info('Exception investigation started', { exceptionId });
    const exception = await this.prisma.exception.findUnique({
      where: { id: exceptionId },
      include: { evidence: true },
    });
    if (!exception) {
      apiLogger.warn('Exception investigation requested for missing exception', { exceptionId });
      throw new Error('Exception not found');
    }
    const investigator = new ExceptionInvestigator(
      {
        getSettlementEvidence: async () => {
          const e = exception.evidence[0]?.payload as Record<string, string> | undefined;
          return e
            ? {
                settlementId: e.settlementId,
                expectedAmount: e.expectedAmount,
                receivedAmount: e.receivedAmount,
                gatewayFees: e.gatewayFees,
                gstOnFees: e.gstOnFees,
                refunds: e.refunds,
              }
            : null;
        },
      },
      new ExceptionInvestigatorAiGateway(this.ai),
    );
    const result = await investigator.investigate(exceptionId);
    apiLogger.info('Exception investigation completed', {
      exceptionId,
      organizationId: exception.organizationId,
      status: result.status,
      confidence: result.confidence,
    });
    const resultJson = JSON.parse(JSON.stringify(result));
    const agentRun = await this.prisma.agentRun.create({
      data: {
        organizationId: exception.organizationId,
        exceptionId,
        agentType: 'EXCEPTION_INVESTIGATOR',
        status: result.status,
        input: { exceptionId },
        output: resultJson,
        completedAt: new Date(),
        steps: {
          create: [
            { label: 'Fetched controlled settlement evidence' },
            { label: 'Calculated deterministic settlement breakdown' },
            { label: 'Validated typed proposed action' },
          ],
        },
      },
    });
    await this.prisma.exception.update({
      where: { id: exceptionId },
      data: {
        status: result.status,
        confidence: result.confidence,
        reason: result.reason,
        resolution: resultJson,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        organizationId: exception.organizationId,
        actor: 'Exception Investigator',
        action: 'PROPOSED_RESOLUTION',
        entityType: 'Exception',
        entityId: exceptionId,
        details: { agentRunId: agentRun.id, confidence: result.confidence },
      },
    });
    apiLogger.info('Exception investigation persisted', {
      exceptionId,
      agentRunId: agentRun.id,
      status: result.status,
    });
    return result;
  }
}
