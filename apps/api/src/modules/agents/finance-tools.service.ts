import { Injectable } from '@nestjs/common';
import { formatInr, money, type RequestPrincipal } from '@finora/platform';
import {
  type FinanceToolCall,
  type FinanceToolExecutor,
  type ToolObservation,
} from '@finora/agents';
import { AgentReadService } from './agent-read.service.js';
import { AgentsService } from './agents.service.js';
import { apiLogger } from '../../common/api-logger.js';

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const label = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');

@Injectable()
export class FinanceToolsService {
  constructor(
    private readonly reads: AgentReadService,
    private readonly agents: AgentsService,
  ) {}

  forPrincipal(principal: RequestPrincipal, asOf: string): FinanceToolExecutor {
    return { execute: (call, callId) => this.executeFor(principal, call, callId, asOf) };
  }

  private async executeFor(
    principal: RequestPrincipal,
    call: FinanceToolCall,
    callId: string,
    asOf: string,
  ): Promise<ToolObservation> {
    const organizationId = principal.organizationId;
    apiLogger.info('Finance tool selected', {
      tool: call.tool,
      callId,
      organizationId,
    });
    switch (call.tool) {
      case 'getCurrentUser': {
        const user = await this.reads.getCurrentUser(organizationId, principal.userId);
        return {
          callId,
          tool: call.tool,
          summary: user
            ? `You are signed in as ${user.name}. Your email is ${user.email}.`
            : 'I could not find the signed-in user in this organization.',
          data: user,
          artifact: user ? { type: 'profile', title: 'Your profile', data: user } : undefined,
        };
      }
      case 'getOrganizationSummary': {
        const summary = await this.reads.organizationSummary(organizationId);
        return {
          callId,
          tool: call.tool,
          summary: `This organization has ${summary.users} member${summary.users === 1 ? '' : 's'}, ${summary.transactions} payment records, ${summary.settlements} settlements, ${summary.invoices} invoices, and ${summary.exceptions} reconciliation exceptions.`,
          data: summary,
          artifact: { type: 'metrics', title: 'Organization summary', data: summary },
        };
      }
      case 'getPaymentSummary': {
        const result = await this.reads.paymentSummary(organizationId, call.arguments);
        return {
          callId,
          tool: call.tool,
          summary: `${result.count} payment${result.count === 1 ? '' : 's'} total ${formatInr(result.total.toString())}, with an average value of ${formatInr(result.average.toString())}.`,
          data: plain(result),
          artifact: {
            type: 'metrics',
            title: 'Payment summary',
            data: plain(result),
            href: '/records?tab=transactions',
          },
        };
      }
      case 'getSettlementSummary': {
        const result = await this.reads.settlementSummary(organizationId, call.arguments);
        return {
          callId,
          tool: call.tool,
          summary: `${result.count} settlements delivered ${formatInr(result.received.toString())} from ${formatInr(result.expected.toString())} expected. Fees, GST and refunds total ${formatInr(result.fees.plus(result.gst).plus(result.refunds).toString())}; ${formatInr(result.unexplained.abs().toString())} remains unexplained.`,
          data: plain(result),
          artifact: {
            type: 'metrics',
            title: 'Settlement summary',
            data: plain(result),
            href: '/records?tab=settlements',
          },
        };
      }
      case 'getInvoiceSummary': {
        const result = await this.reads.invoiceSummary(organizationId, call.arguments);
        return {
          callId,
          tool: call.tool,
          summary: `${result.count} invoice${result.count === 1 ? '' : 's'} total ${formatInr(result.total.toString())}, averaging ${formatInr(result.average.toString())}.`,
          data: plain(result),
          artifact: {
            type: 'metrics',
            title: 'Invoice summary',
            data: plain(result),
            href: '/records?tab=invoices',
          },
        };
      }
      case 'getTaxSummary': {
        const result = await this.reads.taxSummary(organizationId, call.arguments);
        return {
          callId,
          tool: call.tool,
          summary: `${result.count} tax line${result.count === 1 ? '' : 's'} total ${formatInr(result.total.toString())}; ${result.matched} are matched and ${result.unmatched} remain unmatched.`,
          data: plain(result),
          artifact: {
            type: 'metrics',
            title: 'Tax-line summary',
            data: plain(result),
            href: '/records?tab=tax-lines',
          },
        };
      }
      case 'listOrganizationUsers': {
        const users = await this.reads.listUsers(organizationId, call.arguments.limit);
        return {
          callId,
          tool: call.tool,
          summary: users.length
            ? `There ${users.length === 1 ? 'is' : 'are'} ${users.length} member${users.length === 1 ? '' : 's'} in this organization: ${users.map((user) => `${user.name} (${user.email})`).join(', ')}.`
            : 'There are no members in this organization.',
          data: users,
          artifact: { type: 'table', title: 'Organization members', data: { rows: users } },
        };
      }
      case 'getExpenseSummary': {
        const current = new Date(asOf);
        const from =
          call.arguments.from ??
          new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1)).toISOString();
        const to =
          call.arguments.to ??
          new Date(
            Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 1) - 1,
          ).toISOString();
        const result = await this.reads.expenseSummary(organizationId, {
          ...call.arguments,
          from,
          to,
        });
        const largest = result.categories[0];
        const period = `${new Date(result.from).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' })}–${new Date(result.to).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}`;
        return {
          callId,
          tool: call.tool,
          summary: result.count
            ? `Recorded expenses for ${period} total ${formatInr(result.total.toString())} across ${result.count} outflows.${largest ? ` The largest category is ${label(largest.category)} at ${formatInr(largest.amount.toString())}.` : ''}`
            : `No posted expenses were recorded for ${period}.`,
          data: plain(result),
          artifact: {
            type: 'metrics',
            title: 'Expense summary',
            data: plain(result),
            href: '/records?tab=cash-movements&direction=OUTFLOW',
          },
        };
      }
      case 'findCashMovements': {
        const rows = await this.reads.findCashMovements(organizationId, call.arguments);
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? `I found ${rows.length} cash movement${rows.length === 1 ? '' : 's'}. The largest is ${rows[0].description} for ${formatInr(rows[0].amount.toString())}.`
            : 'No cash movements matched those filters.',
          data: plain(rows),
          artifact: {
            type: 'table',
            title: 'Cash movements',
            data: { rows: plain(rows) },
            href: '/records?tab=cash-movements',
          },
          references: rows.map((row) => row.externalId),
        };
      }
      case 'findTransactions': {
        const rows = await this.reads.findTransactions(organizationId, {
          minimumAmount: call.arguments.minimumAmount,
          status: call.arguments.status,
          from: call.arguments.from,
          to: call.arguments.to,
          take: call.arguments.limit,
        });
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? `I found ${rows.length} payment transaction${rows.length === 1 ? '' : 's'} matching those filters.`
            : 'No payment transactions matched those filters.',
          data: plain(rows),
          artifact: {
            type: 'table',
            title: 'Payment transactions',
            data: { rows: plain(rows) },
            href: '/records?tab=transactions',
          },
          references: rows.map((row) => row.externalId),
        };
      }
      case 'findSettlements': {
        const rows = await this.reads.findSettlements(organizationId, {
          ...call.arguments,
          take: call.arguments.limit,
        });
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? `I found ${rows.length} settlement${rows.length === 1 ? '' : 's'} matching those filters.`
            : 'No settlements matched those filters.',
          data: plain(rows),
          artifact: {
            type: 'table',
            title: 'Settlements',
            data: { rows: plain(rows) },
            href: '/records?tab=settlements',
          },
          references: rows.map((row) => row.externalId),
        };
      }
      case 'findInvoices': {
        const rows = await this.reads.findInvoices(organizationId, call.arguments.limit);
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? `I found ${rows.length} invoice${rows.length === 1 ? '' : 's'}; the newest is ${rows[0].externalId} for ${formatInr(rows[0].amount.toString())}.`
            : 'No invoices were found.',
          data: plain(rows),
          artifact: {
            type: 'table',
            title: 'Invoices',
            data: { rows: plain(rows) },
            href: '/records?tab=invoices',
          },
          references: rows.map((row) => row.externalId),
        };
      }
      case 'getSettlement': {
        const settlement = await this.reads.getSettlement(
          organizationId,
          call.arguments.settlementId,
        );
        if (!settlement)
          return {
            callId,
            tool: call.tool,
            summary: `${call.arguments.settlementId} was not found in this organization.`,
            data: null,
          };
        const variance = money(settlement.expectedAmount.toString()).minus(
          settlement.receivedAmount.toString(),
        );
        const recorded = money(settlement.feeAmount.toString())
          .plus(settlement.gstAmount.toString())
          .plus(settlement.refundAmount.toString());
        const unexplained = variance.minus(recorded);
        const data = {
          ...plain(settlement),
          variance: variance.toFixed(2),
          unexplained: unexplained.toFixed(2),
        };
        return {
          callId,
          tool: call.tool,
          summary: unexplained.isZero()
            ? `${settlement.externalId} is short by ${formatInr(variance)}; fees, GST, and refunds explain the full difference.`
            : `${settlement.externalId} is short by ${formatInr(variance)} with ${formatInr(unexplained.abs())} still unexplained.`,
          data,
          artifact: {
            type: 'settlement',
            title: settlement.externalId,
            data,
            href: `/records?tab=settlements&id=${settlement.externalId}`,
          },
          references: [settlement.externalId],
        };
      }
      case 'getException': {
        const exception = await this.reads.getException(organizationId, call.arguments.exceptionId);
        return {
          callId,
          tool: call.tool,
          summary: exception
            ? `${exception.externalId} is ${label(exception.status)}. ${exception.reason}`
            : `${call.arguments.exceptionId} was not found in this organization.`,
          data: plain(exception),
          artifact: exception
            ? {
                type: 'exception',
                title: exception.externalId,
                data: plain(exception),
                href: `/exceptions?id=${exception.externalId}`,
              }
            : undefined,
          references: exception ? [exception.externalId] : [],
        };
      }
      case 'getExceptionEvidence': {
        const rows = await this.reads.findExceptionEvidence(
          organizationId,
          call.arguments.exceptionId,
        );
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? `${call.arguments.exceptionId} has ${rows.length} supporting evidence item${rows.length === 1 ? '' : 's'}: ${rows.map((row) => row.label).join(', ')}.`
            : `No evidence was found for ${call.arguments.exceptionId}.`,
          data: plain(rows),
          artifact: {
            type: 'table',
            title: `Evidence for ${call.arguments.exceptionId}`,
            data: { rows: plain(rows) },
            href: `/exceptions?id=${call.arguments.exceptionId}`,
          },
          references: [
            call.arguments.exceptionId,
            ...rows.flatMap((row) => (row.referenceId ? [row.referenceId] : [])),
          ],
        };
      }
      case 'investigateException': {
        const investigation = await this.agents.investigateByExternalId(
          principal,
          call.arguments.exceptionId,
        );
        return {
          callId,
          tool: call.tool,
          summary: investigation
            ? `${investigation.externalId} was investigated. A ${label(investigation.result.status)} proposal was created with ${Math.round(investigation.result.confidence * 100)}% confidence; no financial record was changed.`
            : `${call.arguments.exceptionId} was not found in this organization.`,
          data: plain(investigation),
          artifact: investigation
            ? {
                type: 'exception',
                title: `${investigation.externalId} investigation`,
                data: plain(investigation),
                href: `/exceptions?id=${investigation.externalId}`,
              }
            : undefined,
          references: investigation ? [investigation.externalId] : [],
        };
      }
      case 'findExceptions': {
        const rows = await this.reads.findExceptions(organizationId, call.arguments.minimumAmount);
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? `There are ${rows.length} open reconciliation exception${rows.length === 1 ? '' : 's'} matching those filters.`
            : 'No open reconciliation exceptions matched those filters.',
          data: plain(rows),
          artifact: {
            type: 'table',
            title: 'Open exceptions',
            data: { rows: plain(rows) },
            href: '/exceptions',
          },
          references: rows.map((row) => row.externalId),
        };
      }
      case 'getCashForecast': {
        const rows = await this.reads.cashForecast(organizationId);
        const risks = rows.filter((row) => row.risk);
        return {
          callId,
          tool: call.tool,
          summary: `${risks.length ? `${risks.length} shortfall point${risks.length === 1 ? '' : 's'} appear` : 'No shortfall appears'} in the known cash schedule. The latest projected balance is ${formatInr(rows.at(-1)?.amount.toString() ?? '0')}.`,
          data: plain(rows),
          artifact: {
            type: 'forecast',
            title: 'Cash forecast',
            data: { rows: plain(rows) },
            href: '/overview',
          },
        };
      }
      case 'findUnmatchedTaxLines': {
        const rows = await this.reads.findUnmatchedTaxLines(organizationId);
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? `${rows.length} tax line${rows.length === 1 ? '' : 's'} remain unmatched.`
            : 'All tax lines are matched.',
          data: plain(rows),
          artifact: {
            type: 'table',
            title: 'Unmatched tax lines',
            data: { rows: plain(rows) },
            href: '/records?tab=tax-lines',
          },
          references: rows.map((row) => row.externalId),
        };
      }
      case 'findAuditEvents': {
        const rows = await this.reads.findAuditEvents(organizationId, call.arguments.limit);
        return {
          callId,
          tool: call.tool,
          summary: `I found ${rows.length} recent audit event${rows.length === 1 ? '' : 's'}.`,
          data: plain(rows),
          artifact: { type: 'table', title: 'Audit trail', data: { rows: plain(rows) } },
        };
      }
      case 'findAgentRuns': {
        const rows = await this.reads.findAgentRuns(organizationId, call.arguments.limit);
        return {
          callId,
          tool: call.tool,
          summary: `I found ${rows.length} recent agent run${rows.length === 1 ? '' : 's'}.`,
          data: plain(rows),
          artifact: { type: 'table', title: 'Agent activity', data: { rows: plain(rows) } },
        };
      }
      case 'findReconciliationRuns': {
        const rows = await this.reads.findReconciliationRuns(organizationId, call.arguments.limit);
        return {
          callId,
          tool: call.tool,
          summary: `I found ${rows.length} reconciliation run${rows.length === 1 ? '' : 's'}.`,
          data: plain(rows),
          artifact: {
            type: 'table',
            title: 'Reconciliation runs',
            data: { rows: plain(rows) },
            href: '/reconciliation',
          },
        };
      }
    }
  }
}
