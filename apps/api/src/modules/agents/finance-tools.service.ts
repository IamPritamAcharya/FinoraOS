import { Injectable } from '@nestjs/common';
import {
  WorkspacePermission,
  formatInr,
  hasWorkspacePermission,
  money,
  type RequestPrincipal,
} from '@finora/platform';
import {
  type FinanceToolCall,
  type FinanceToolExecutor,
  type FinanceToolName,
  type ToolObservation,
} from '@finora/agents';
import { AgentReadService } from './agent-read.service.js';
import { AgentsService } from './agents.service.js';
import { apiLogger } from '../../common/api-logger.js';
import { RecordMutationService } from '../mutations/record-mutation.service.js';

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
    private readonly mutations: RecordMutationService,
  ) {}

  forPrincipal(
    principal: RequestPrincipal,
    asOf: string,
    options: { writeMode?: boolean; threadId?: string } = {},
  ): FinanceToolExecutor {
    return { execute: (call, callId) => this.executeFor(principal, call, callId, asOf, options) };
  }

  allowedTools(principal: RequestPrincipal, writeMode = false): FinanceToolName[] {
    const allowed: FinanceToolName[] = [
      'getWorkspaceCapabilities',
      'getCurrentUser',
      'getMyExpenseSummary',
      'findMyExpenses',
    ];
    if (hasWorkspacePermission(principal, WorkspacePermission.VIEW_ORGANIZATION_FINANCE)) {
      allowed.push(
        'getOrganizationSummary',
        'getBudgetSummary',
        'getPaymentSummary',
        'getSettlementSummary',
        'getInvoiceSummary',
        'getTaxSummary',
        'listOrganizationUsers',
        'getExpenseSummary',
        'findCashMovements',
        'findTransactions',
        'getTransaction',
        'findSettlements',
        'findInvoices',
        'getInvoice',
        'getTaxLine',
        'getExpenseClaim',
        'getSettlement',
        'getException',
        'getExceptionEvidence',
        'findExceptions',
        'getCashForecast',
        'findUnmatchedTaxLines',
        'findReconciliationRuns',
      );
    }
    if (hasWorkspacePermission(principal, WorkspacePermission.REVIEW_EXPENSE)) {
      allowed.push('investigateException');
    }
    if (hasWorkspacePermission(principal, WorkspacePermission.VIEW_AUDIT)) {
      allowed.push('findAuditEvents');
    }
    if (hasWorkspacePermission(principal, WorkspacePermission.VIEW_AGENT_AUDIT)) {
      allowed.push('findAgentRuns');
    }
    if (
      writeMode &&
      hasWorkspacePermission(principal, WorkspacePermission.MANAGE_FINANCE_RECORDS)
    ) {
      allowed.push('proposeRecordUpdate');
    }
    return [...new Set(allowed)];
  }

  async activeSkills(principal: RequestPrincipal) {
    if (!hasWorkspacePermission(principal, WorkspacePermission.VIEW_ORGANIZATION_FINANCE)) {
      return [];
    }
    return this.reads.activeSkills(principal.organizationId) as Promise<
      Array<{
        id: string;
        name: string;
        description: string;
        instructions: string;
        allowedTools: FinanceToolCall['tool'][];
      }>
    >;
  }

  private async executeFor(
    principal: RequestPrincipal,
    call: FinanceToolCall,
    callId: string,
    asOf: string,
    options: { writeMode?: boolean; threadId?: string },
  ): Promise<ToolObservation> {
    const organizationId = principal.organizationId;
    apiLogger.info('Finance tool selected', {
      tool: call.tool,
      callId,
      organizationId,
    });
    const allowedTools = this.allowedTools(principal, options.writeMode === true);
    if (!allowedTools.includes(call.tool)) {
      return {
        callId,
        tool: call.tool,
        summary:
          'That information is outside your current workspace access. I did not query or expose restricted finance data.',
        data: { denied: true, role: principal.role, allowedTools },
      };
    }
    switch (call.tool) {
      case 'getWorkspaceCapabilities': {
        const capabilities = {
          role: principal.role ?? 'EMPLOYEE',
          scope: hasWorkspacePermission(principal, WorkspacePermission.VIEW_ORGANIZATION_FINANCE)
            ? 'ORGANIZATION'
            : 'OWN_RECORDS',
          connected: hasWorkspacePermission(
            principal,
            WorkspacePermission.VIEW_ORGANIZATION_FINANCE,
          )
            ? [
                'payments',
                'settlements',
                'invoices',
                'posted expenses',
                'cash position and forecast',
                'tax lines',
                'reconciliation and exceptions',
                'organization members',
              ]
            : ['profile', 'own expense claims', 'own receipts', 'own reimbursement status'],
          unavailable: [],
          requestedTopic: call.arguments.topic,
          allowedTools,
        };
        const budgetRequested = call.arguments.topic === 'BUDGETS';
        return {
          callId,
          tool: call.tool,
          summary: budgetRequested
            ? allowedTools.includes('getBudgetSummary')
              ? 'Operating budgets are available through the deterministic budget summary tool.'
              : 'Operating budgets are outside your current workspace role. Your own expense claims and receipts remain available.'
            : `As ${String(capabilities.role).replaceAll('_', ' ').toLowerCase()}, you can ask about ${capabilities.connected.join(', ')}.`,
          data: capabilities,
          artifact: {
            type: 'metrics',
            title: budgetRequested ? 'Budget availability' : 'Connected finance data',
            data: capabilities,
          },
        };
      }
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
      case 'getMyExpenseSummary': {
        const result = await this.reads.myExpenseSummary(
          organizationId,
          principal.userId,
          call.arguments,
        );
        return {
          callId,
          tool: call.tool,
          summary: result.count
            ? `You have ${result.count} expense claim${result.count === 1 ? '' : 's'} totaling ${formatInr(result.total.toString())}. ${result.missingReceipts ? `${result.missingReceipts} still ${result.missingReceipts === 1 ? 'needs' : 'need'} receipt evidence.` : 'Every claim has receipt evidence attached.'}`
            : 'You do not have any expense claims matching that period or status.',
          data: plain(result),
          artifact: {
            type: 'metrics',
            title: 'My expense claims',
            data: plain(result),
            href: '/records?tab=expense-claims',
          },
        };
      }
      case 'findMyExpenses': {
        const rows = await this.reads.findMyExpenses(organizationId, principal.userId, {
          ...call.arguments,
          take: call.arguments.limit,
        });
        const exact = call.arguments.externalId;
        return {
          callId,
          tool: call.tool,
          summary: rows.length
            ? exact
              ? `${rows[0].externalId} is a ${label(rows[0].status).toLowerCase()} expense claim for ${formatInr(rows[0].amount.toString())} at ${rows[0].merchant}. ${rows[0].documents.length ? `${rows[0].documents.length} receipt document${rows[0].documents.length === 1 ? ' is' : 's are'} attached.` : 'It still needs receipt evidence.'}`
              : `I found ${rows.length} of your expense claim${rows.length === 1 ? '' : 's'}.${call.arguments.missingReceipt ? ' Each still needs receipt evidence.' : ''}`
            : exact
              ? `${exact} was not found among your expense claims.`
              : 'None of your expense claims matched those filters.',
          data: plain(rows),
          artifact: {
            type: 'table',
            title: exact ?? 'My expense claims',
            data: { rows: plain(rows) },
            href: exact
              ? `/records?tab=expense-claims&record=${exact}`
              : '/records?tab=expense-claims',
          },
          references: rows.map((row) => row.externalId),
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
      case 'getBudgetSummary': {
        const result = await this.reads.budgetSummary(organizationId, call.arguments);
        return {
          callId,
          tool: call.tool,
          summary: result.count
            ? `${result.count} budget${result.count === 1 ? '' : 's'} allocate ${formatInr(result.allocated.toString())}. ${formatInr(result.committed.toString())} is committed, leaving ${formatInr(result.remaining.toString())}.`
            : 'No budgets matched that node, period, or status.',
          data: plain(result),
          artifact: {
            type: 'table',
            title: 'Organization budgets',
            data: { rows: plain(result.rows) },
            href: '/organization',
          },
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
            ? rows.length === 1
              ? `${rows[0].externalId} is the latest matching payment: ${formatInr(rows[0].amount.toString())}, ${label(rows[0].status)}, recorded on ${new Date(rows[0].occurredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}.`
              : `I found ${rows.length} payment transactions matching those filters.`
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
      case 'getTransaction': {
        const transaction = await this.reads.getTransaction(
          organizationId,
          call.arguments.transactionId,
        );
        if (!transaction) {
          return {
            callId,
            tool: call.tool,
            summary: `${call.arguments.transactionId} was not found in this organization.`,
            data: null,
          };
        }
        const data = plain(transaction);
        return {
          callId,
          tool: call.tool,
          summary: `${transaction.externalId} is a ${label(transaction.status).toLowerCase()} payment of ${formatInr(transaction.amount.toString())}, recorded on ${new Date(transaction.occurredAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}.${transaction.settlement ? ` It is linked to settlement ${transaction.settlement.externalId}.` : ' It is not linked to a settlement.'}`,
          data,
          artifact: {
            type: 'table',
            title: transaction.externalId,
            data: { rows: [data] },
            href: `/records?tab=transactions&id=${transaction.externalId}`,
          },
          references: [
            transaction.externalId,
            ...(transaction.settlement ? [transaction.settlement.externalId] : []),
          ],
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
      case 'getInvoice': {
        const invoice = await this.reads.getInvoice(organizationId, call.arguments.invoiceId);
        const data = plain(invoice);
        return {
          callId,
          tool: call.tool,
          summary: invoice
            ? `${invoice.externalId} is a ${label(invoice.direction).toLowerCase()} invoice for ${formatInr(invoice.amount.toString())} from ${invoice.vendor ?? 'an unspecified counterparty'}. It is ${label(invoice.status).toLowerCase()}${invoice.dueAt ? ` and due ${new Date(invoice.dueAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })}` : ''}.`
            : `${call.arguments.invoiceId} was not found in this organization.`,
          data,
          artifact: invoice
            ? {
                type: 'table',
                title: invoice.externalId,
                data: { rows: [data] },
                href: `/records?tab=invoices&record=${invoice.externalId}`,
              }
            : undefined,
          references: invoice ? [invoice.externalId] : [],
        };
      }
      case 'getTaxLine': {
        const taxLine = await this.reads.getTaxLine(organizationId, call.arguments.taxLineId);
        const data = plain(taxLine);
        return {
          callId,
          tool: call.tool,
          summary: taxLine
            ? `${taxLine.externalId} is a ${label(taxLine.taxType).toLowerCase()} line for ${formatInr(taxLine.amount.toString())} at ${taxLine.taxRate.toString()}%. It is ${taxLine.matched ? 'matched' : 'unmatched'}${taxLine.invoice ? ` and linked to ${taxLine.invoice.externalId}` : ''}.`
            : `${call.arguments.taxLineId} was not found in this organization.`,
          data,
          artifact: taxLine
            ? {
                type: 'table',
                title: taxLine.externalId,
                data: { rows: [data] },
                href: `/records?tab=tax-lines&record=${taxLine.externalId}`,
              }
            : undefined,
          references: taxLine
            ? [taxLine.externalId, ...(taxLine.invoice ? [taxLine.invoice.externalId] : [])]
            : [],
        };
      }
      case 'getExpenseClaim': {
        const expense = await this.reads.getExpenseClaim(organizationId, call.arguments.expenseId);
        const data = plain(expense);
        return {
          callId,
          tool: call.tool,
          summary: expense
            ? `${expense.externalId} is a ${label(expense.status).toLowerCase()} expense claim for ${formatInr(expense.amount.toString())} at ${expense.merchant}, submitted by ${expense.claimant.name}. ${expense.documents.length ? `${expense.documents.length} receipt document${expense.documents.length === 1 ? ' is' : 's are'} attached.` : 'Receipt evidence is missing.'}`
            : `${call.arguments.expenseId} was not found in this organization.`,
          data,
          artifact: expense
            ? {
                type: 'table',
                title: expense.externalId,
                data: { rows: [data] },
                href: `/records?tab=expense-claims&record=${expense.externalId}`,
              }
            : undefined,
          references: expense ? [expense.externalId] : [],
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
            ? investigation.result.status === 'PROPOSED'
              ? `${investigation.externalId} was investigated. A resolution was proposed with ${Math.round(investigation.result.confidence * 100)}% confidence; no financial record was changed.`
              : `${investigation.externalId} was investigated and remains ${label(investigation.result.status).toLowerCase()} at ${Math.round(investigation.result.confidence * 100)}% confidence; no financial record was changed.`
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
      case 'proposeRecordUpdate': {
        const proposal = await this.mutations.propose(
          principal,
          { ...call.arguments, operation: 'UPDATE' },
          { writeMode: options.writeMode === true, threadId: options.threadId },
        );
        return {
          callId,
          tool: call.tool,
          summary: `I prepared a ${Array.isArray(proposal.diff) ? proposal.diff.length : 0}-field change for ${proposal.recordExternalId}. Review the before-and-after diff below; nothing has been written yet.`,
          data: plain(proposal),
          artifact: {
            type: 'mutation',
            title: `Proposed change · ${proposal.recordExternalId}`,
            data: plain(proposal),
            href: '/audit',
          },
          references: [proposal.recordExternalId, proposal.id],
        };
      }
    }
  }
}
