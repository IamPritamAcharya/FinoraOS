import { describe, expect, it } from 'vitest';
import { WorkspaceRole, type RequestPrincipal } from '@finora/platform';
import { FinanceToolsService } from './finance-tools.service.js';

const principal = (role: WorkspaceRole): RequestPrincipal => ({
  organizationId: 'org-a',
  userId: 'user-a',
  role,
});

describe('FinanceToolsService role routing', () => {
  const service = new FinanceToolsService({} as never, {} as never, {} as never);

  it('limits employees to their identity and own expense evidence', () => {
    expect(service.allowedTools(principal(WorkspaceRole.EMPLOYEE))).toEqual([
      'getWorkspaceCapabilities',
      'getCurrentUser',
      'getMyExpenseSummary',
      'findMyExpenses',
    ]);
  });

  it('allows controllers to investigate but exposes writes only in explicit write mode', () => {
    const readonly = service.allowedTools(principal(WorkspaceRole.FINANCE_CONTROLLER));
    const writable = service.allowedTools(principal(WorkspaceRole.FINANCE_CONTROLLER), true);
    expect(readonly).toContain('investigateException');
    expect(readonly).toContain('findAuditEvents');
    expect(readonly).not.toContain('proposeRecordUpdate');
    expect(writable).toContain('proposeRecordUpdate');
  });

  it('keeps auditors read-only while retaining finance and audit evidence', () => {
    const tools = service.allowedTools(principal(WorkspaceRole.AUDITOR), true);
    expect(tools).toContain('getSettlementSummary');
    expect(tools).toContain('findAuditEvents');
    expect(tools).not.toContain('investigateException');
    expect(tools).not.toContain('proposeRecordUpdate');
  });
});
