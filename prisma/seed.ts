import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const orgId = 'demo-org';
const iso = (day: number) => new Date(Date.UTC(2026, 7, day, 10, 0, 0));

async function main() {
  await prisma.organization.upsert({
    where: { id: orgId },
    update: {},
    create: { id: orgId, name: 'Acme Commerce India' },
  });
  const demoUsers = [
    {
      id: 'demo-user',
      name: 'Aarav Mehta',
      email: 'finance@finora.local',
      role: 'FINANCE_CONTROLLER' as const,
      identityProviderId: '11111111-1111-4111-8111-111111111111',
      slackUserId: 'U_FINANCE_01',
    },
    {
      id: 'demo-admin',
      name: 'Ananya Rao',
      email: 'admin@finora.local',
      role: 'ENTERPRISE_ADMIN' as const,
      identityProviderId: '22222222-2222-4222-8222-222222222222',
      slackUserId: 'U_ADMIN_01',
    },
    {
      id: 'demo-employee-priya',
      name: 'Priya Sharma',
      email: 'priya@finora.local',
      role: 'EMPLOYEE' as const,
      identityProviderId: '33333333-3333-4333-8333-333333333333',
      slackUserId: 'U_EMPLOYEE_01',
    },
    {
      id: 'demo-employee-rohan',
      name: 'Rohan Desai',
      email: 'rohan@finora.local',
      role: 'EMPLOYEE' as const,
      identityProviderId: '44444444-4444-4444-8444-444444444444',
      slackUserId: 'U_EMPLOYEE_02',
    },
  ];
  for (const user of demoUsers) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: {
        name: user.name,
        role: user.role,
        identityProviderId: user.identityProviderId,
        slackUserId: user.slackUserId,
      },
      create: { ...user, organizationId: orgId },
    });
  }
  if (process.argv.includes('--if-empty')) {
    const [existingRecords, existingNodes] = await Promise.all([
      prisma.transaction.count({ where: { organizationId: orgId } }),
      prisma.organizationNode.count({ where: { organizationId: orgId } }),
    ]);
    if (existingRecords > 0 && existingNodes > 0) {
      console.log(`Seed skipped: ${existingRecords} demo transactions already exist.`);
      return;
    }
  }
  await prisma.automationJobRun.deleteMany();
  await prisma.automationJob.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.receiptRequest.deleteMany();
  await prisma.financialDocument.deleteMany();
  await prisma.expenseClaim.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.importBatch.deleteMany();
  await prisma.budget.deleteMany();
  await prisma.spendLimit.deleteMany();
  await prisma.approvalPolicy.deleteMany();
  await prisma.agentStep.deleteMany();
  await prisma.agentRun.deleteMany();
  await prisma.agentSkill.deleteMany();
  await prisma.chatMessage.deleteMany();
  await prisma.chatThread.deleteMany();
  await prisma.adjustment.deleteMany();
  await prisma.exceptionEvidence.deleteMany();
  await prisma.exception.deleteMany();
  await prisma.reconciliationMatch.deleteMany();
  await prisma.reconciliationRun.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.taxLine.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.settlement.deleteMany();
  await prisma.cashMovement.deleteMany();
  await prisma.cashAccount.deleteMany();
  await prisma.integrationConnection.deleteMany();
  await prisma.organizationNode.deleteMany();

  await prisma.integrationConnection.createMany({
    data: [
      {
        id: 'integration-mock-razorpay',
        organizationId: orgId,
        type: 'PAYMENT',
        provider: 'MOCK_PAYMENT',
        status: 'CONNECTED',
        displayName: 'Razorpay sandbox projection',
        externalAccountId: 'acc_demo_razorpay',
        credentialRef: 'env:RAZORPAY_KEY_ID',
        config: { mode: 'test', simulated: true },
        lastSyncAt: iso(24),
      },
      {
        id: 'integration-mock-bank',
        organizationId: orgId,
        type: 'BANKING',
        provider: 'MOCK_BANKING',
        status: 'CONNECTED',
        displayName: 'Mock operating bank',
        externalAccountId: 'bank_demo_operating',
        config: { simulated: true },
        lastSyncAt: iso(24),
      },
      {
        id: 'integration-slack',
        organizationId: orgId,
        type: 'MESSAGING',
        provider: 'SLACK',
        status: 'DISCONNECTED',
        displayName: 'Slack receipt collection',
        credentialRef: 'env:SLACK_BOT_TOKEN',
        config: { requiredScopes: ['chat:write', 'files:read', 'im:history'] },
      },
      {
        id: 'integration-erp',
        organizationId: orgId,
        type: 'ERP',
        provider: 'GENERIC_ERP',
        status: 'DISCONNECTED',
        displayName: 'ERP connector',
        credentialRef: 'vault:erp/demo',
      },
    ],
  });

  await prisma.organizationNode.createMany({
    data: [
      {
        id: 'node-company',
        organizationId: orgId,
        type: 'COMPANY',
        name: 'Acme Commerce India',
        code: 'ACME-IN',
        ownerUserId: 'demo-admin',
      },
      {
        id: 'node-mumbai',
        organizationId: orgId,
        parentId: 'node-company',
        type: 'OFFICE',
        name: 'Mumbai Office',
        code: 'OFF-MUM',
        ownerUserId: 'demo-admin',
      },
      {
        id: 'node-finance',
        organizationId: orgId,
        parentId: 'node-mumbai',
        type: 'DEPARTMENT',
        name: 'Finance',
        code: 'DEPT-FIN',
        ownerUserId: 'demo-user',
      },
      {
        id: 'node-operations',
        organizationId: orgId,
        parentId: 'node-mumbai',
        type: 'DEPARTMENT',
        name: 'Operations',
        code: 'DEPT-OPS',
        ownerUserId: 'demo-user',
      },
      {
        id: 'node-priya',
        organizationId: orgId,
        parentId: 'node-operations',
        memberUserId: 'demo-employee-priya',
        type: 'EMPLOYEE',
        name: 'Priya Sharma',
        code: 'EMP-PRIYA',
        ownerUserId: 'demo-employee-priya',
      },
      {
        id: 'node-rohan',
        organizationId: orgId,
        parentId: 'node-operations',
        memberUserId: 'demo-employee-rohan',
        type: 'EMPLOYEE',
        name: 'Rohan Desai',
        code: 'EMP-ROHAN',
        ownerUserId: 'demo-employee-rohan',
      },
    ],
  });

  const limitStart = new Date(Date.UTC(2026, 7, 1));
  const limitEnd = new Date(Date.UTC(2026, 8, 1));
  const spendLimits = [
    [
      'limit-company-aug',
      'node-company',
      '3000000.00',
      [
        ['PAYROLL', '600000.00'],
        ['TRAVEL', '120000.00'],
      ],
    ],
    [
      'limit-mumbai-aug',
      'node-mumbai',
      '2500000.00',
      [
        ['TRAVEL', '100000.00'],
        ['SOFTWARE', '300000.00'],
      ],
    ],
    ['limit-finance-aug', 'node-finance', '800000.00', [['PROFESSIONAL_SERVICES', '150000.00']]],
    [
      'limit-operations-aug',
      'node-operations',
      '1500000.00',
      [
        ['TRAVEL', '80000.00'],
        ['MEALS', '30000.00'],
        ['SOFTWARE', '150000.00'],
      ],
    ],
    [
      'limit-priya-aug',
      'node-priya',
      '40000.00',
      [
        ['TRAVEL', '9000.00'],
        ['LOCAL_TRANSPORT', '5000.00'],
      ],
    ],
    [
      'limit-rohan-aug',
      'node-rohan',
      '60000.00',
      [
        ['MEALS', '5000.00'],
        ['SOFTWARE', '20000.00'],
      ],
    ],
  ] as const;
  for (const [id, nodeId, amount, categories] of spendLimits) {
    await prisma.spendLimit.create({
      data: {
        id,
        organizationId: orgId,
        nodeId,
        createdById: 'demo-admin',
        updatedById: 'demo-admin',
        amount,
        currency: 'INR',
        periodStart: limitStart,
        periodEnd: limitEnd,
        status: 'ACTIVE',
        categoryLimits: {
          create: categories.map(([category, categoryAmount]) => ({
            category,
            amount: categoryAmount,
          })),
        },
      },
    });
  }

  await prisma.budget.createMany({
    data: [
      {
        id: 'budget-finance-aug',
        organizationId: orgId,
        nodeId: 'node-finance',
        createdById: 'demo-admin',
        name: 'Finance operations · August 2026',
        amount: '1200000.00',
        currency: 'INR',
        periodStart: new Date(Date.UTC(2026, 7, 1)),
        periodEnd: new Date(Date.UTC(2026, 7, 31, 23, 59, 59)),
        status: 'ACTIVE',
      },
      {
        id: 'budget-operations-aug',
        organizationId: orgId,
        nodeId: 'node-operations',
        createdById: 'demo-admin',
        name: 'Operations · August 2026',
        amount: '1800000.00',
        currency: 'INR',
        periodStart: new Date(Date.UTC(2026, 7, 1)),
        periodEnd: new Date(Date.UTC(2026, 7, 31, 23, 59, 59)),
        status: 'ACTIVE',
      },
      {
        id: 'budget-priya-travel-aug',
        organizationId: orgId,
        nodeId: 'node-priya',
        createdById: 'demo-user',
        name: 'Priya travel · August 2026',
        category: 'TRAVEL',
        amount: '45000.00',
        currency: 'INR',
        periodStart: new Date(Date.UTC(2026, 7, 1)),
        periodEnd: new Date(Date.UTC(2026, 7, 31, 23, 59, 59)),
        status: 'ACTIVE',
      },
    ],
  });
  const settlements = Array.from({ length: 12 }, (_, index) => {
    const expected = 142000 + index * 17350;
    const fees = 2450 + index * 110;
    const gst = Math.round(fees * 0.18 * 100) / 100;
    const refunds = index % 4 === 0 ? 3200 : 0;
    const unexplained = index === 10 ? 850 : 0;
    return {
      id: `settlement-${index + 1}`,
      organizationId: orgId,
      externalId: `STL_${String(index + 1).padStart(4, '0')}`,
      expectedAmount: expected.toFixed(2),
      receivedAmount: (expected - fees - gst - refunds - unexplained).toFixed(2),
      feeAmount: fees.toFixed(2),
      gstAmount: gst.toFixed(2),
      refundAmount: refunds.toFixed(2),
      settledAt: iso(index + 1),
    };
  });
  await prisma.settlement.createMany({ data: settlements });
  const cashAccount = await prisma.cashAccount.create({
    data: {
      id: 'cash-account-operating',
      organizationId: orgId,
      name: 'Operating Account',
      currency: 'INR',
      openingBalance: '1800000.00',
    },
  });
  const settlementMovements = settlements.flatMap((settlement, index) => [
    {
      organizationId: orgId,
      accountId: cashAccount.id,
      externalId: `CM_COLLECTION_${String(index + 1).padStart(3, '0')}`,
      direction: 'INFLOW' as const,
      category: 'COLLECTION' as const,
      status: 'POSTED' as const,
      amount: settlement.receivedAmount,
      currency: 'INR',
      description: `Settlement collection ${settlement.externalId}`,
      counterparty: 'Razorpay',
      occurredAt: settlement.settledAt,
      sourceType: 'SETTLEMENT',
      sourceId: settlement.id,
    },
    {
      organizationId: orgId,
      accountId: cashAccount.id,
      externalId: `CM_FEE_${String(index + 1).padStart(3, '0')}`,
      direction: 'OUTFLOW' as const,
      category: 'GATEWAY_FEE' as const,
      status: 'POSTED' as const,
      amount: settlement.feeAmount,
      currency: 'INR',
      description: `Gateway fee for ${settlement.externalId}`,
      counterparty: 'Razorpay',
      occurredAt: settlement.settledAt,
      sourceType: 'SETTLEMENT_FEE',
      sourceId: settlement.id,
    },
    {
      organizationId: orgId,
      accountId: cashAccount.id,
      externalId: `CM_GST_${String(index + 1).padStart(3, '0')}`,
      direction: 'OUTFLOW' as const,
      category: 'GST' as const,
      status: 'POSTED' as const,
      amount: settlement.gstAmount,
      currency: 'INR',
      description: `GST on gateway fee for ${settlement.externalId}`,
      counterparty: 'Razorpay',
      occurredAt: settlement.settledAt,
      sourceType: 'SETTLEMENT_GST',
      sourceId: settlement.id,
    },
    ...(Number(settlement.refundAmount) > 0
      ? [
          {
            organizationId: orgId,
            accountId: cashAccount.id,
            externalId: `CM_REFUND_${String(index + 1).padStart(3, '0')}`,
            direction: 'OUTFLOW' as const,
            category: 'REFUND' as const,
            status: 'POSTED' as const,
            amount: settlement.refundAmount,
            currency: 'INR',
            description: `Customer refunds in ${settlement.externalId}`,
            counterparty: 'Customers',
            occurredAt: settlement.settledAt,
            sourceType: 'REFUND',
            sourceId: settlement.id,
          },
        ]
      : []),
  ]);
  const operatingMovements = [
    ['CM_VENDOR_001', 'VENDOR_PAYMENT', '78500.00', 4, 'Cloud infrastructure', 'Nimbus Cloud'],
    ['CM_VENDOR_002', 'VENDOR_PAYMENT', '42600.00', 9, 'Logistics services', 'Swift Logistics'],
    ['CM_VENDOR_003', 'VENDOR_PAYMENT', '31250.00', 14, 'Customer support software', 'SupportDesk'],
    ['CM_PAYROLL_001', 'PAYROLL', '480000.00', 7, 'August payroll', 'Employees'],
    ['CM_RENT_001', 'RENT', '120000.00', 2, 'Office rent', 'Orbit Properties'],
    ['CM_TAX_001', 'TAX_PAYMENT', '145000.00', 12, 'Advance tax payment', 'Income Tax Department'],
  ].map(([externalId, category, amount, day, description, counterparty]) => ({
    organizationId: orgId,
    accountId: cashAccount.id,
    externalId: String(externalId),
    direction: 'OUTFLOW' as const,
    category: category as 'VENDOR_PAYMENT' | 'PAYROLL' | 'RENT' | 'TAX_PAYMENT',
    status: 'POSTED' as const,
    amount: String(amount),
    currency: 'INR',
    description: String(description),
    counterparty: String(counterparty),
    occurredAt: iso(Number(day)),
    sourceType: 'BANK_TRANSACTION',
  }));
  const scheduledMovements = [
    ['CM_SCHEDULED_001', 'OUTFLOW', 'PAYROLL', '480000.00', 27, 'September payroll'],
    ['CM_SCHEDULED_002', 'OUTFLOW', 'VENDOR_PAYMENT', '210000.00', 29, 'Inventory supplier'],
    ['CM_SCHEDULED_003', 'INFLOW', 'COLLECTION', '760000.00', 31, 'Scheduled settlement'],
    ['CM_SCHEDULED_004', 'OUTFLOW', 'TAX_PAYMENT', '185000.00', 2, 'GST payment'],
  ].map(([externalId, direction, category, amount, day, description], index) => ({
    organizationId: orgId,
    accountId: cashAccount.id,
    externalId: String(externalId),
    direction: direction as 'INFLOW' | 'OUTFLOW',
    category: category as 'COLLECTION' | 'PAYROLL' | 'VENDOR_PAYMENT' | 'TAX_PAYMENT',
    status: 'SCHEDULED' as const,
    amount: String(amount),
    currency: 'INR',
    description: String(description),
    counterparty: index === 2 ? 'Razorpay' : 'Scheduled obligation',
    occurredAt:
      Number(day) <= 2 ? new Date(Date.UTC(2026, 8, Number(day), 10, 0, 0)) : iso(Number(day)),
    sourceType: 'SCHEDULE',
  }));
  await prisma.cashMovement.createMany({
    data: [...settlementMovements, ...operatingMovements, ...scheduledMovements],
  });
  await prisma.expenseClaim.createMany({
    data: [
      {
        id: 'expense-1',
        organizationId: orgId,
        externalId: 'EXP_0001',
        claimantUserId: 'demo-employee-priya',
        nodeId: 'node-priya',
        budgetId: 'budget-priya-travel-aug',
        approvedById: 'demo-user',
        status: 'APPROVED',
        amount: '8500.00',
        currency: 'INR',
        merchant: 'IndiGo',
        category: 'TRAVEL',
        categorySource: 'RULE',
        categoryStatus: 'CONFIRMED',
        categoryConfidence: '0.990',
        categoryReason: 'Airline merchant matched the travel rule.',
        incurredAt: iso(5),
        description: 'Customer visit flight to Bengaluru',
        sourceType: 'WEB',
        submittedAt: iso(6),
        approvedAt: iso(7),
      },
      {
        id: 'expense-2',
        organizationId: orgId,
        externalId: 'EXP_0002',
        claimantUserId: 'demo-employee-priya',
        nodeId: 'node-priya',
        budgetId: 'budget-priya-travel-aug',
        status: 'RECEIPT_REQUIRED',
        amount: '2400.00',
        currency: 'INR',
        merchant: 'City Cabs',
        category: 'LOCAL_TRANSPORT',
        categorySource: 'RULE',
        categoryStatus: 'CONFIRMED',
        categoryConfidence: '0.990',
        categoryReason: 'Cab merchant matched the local transport rule.',
        incurredAt: iso(8),
        description: 'Airport transfer',
        sourceType: 'BANK_IMPORT',
      },
      {
        id: 'expense-3',
        organizationId: orgId,
        externalId: 'EXP_0003',
        claimantUserId: 'demo-employee-rohan',
        nodeId: 'node-rohan',
        budgetId: 'budget-operations-aug',
        status: 'SUBMITTED',
        amount: '6800.00',
        currency: 'INR',
        merchant: 'Copper Chimney',
        category: 'MEALS',
        categorySource: 'RULE',
        categoryStatus: 'CONFIRMED',
        categoryConfidence: '0.990',
        categoryReason: 'Restaurant merchant matched the meals rule.',
        incurredAt: iso(10),
        description: 'Client operations review dinner',
        sourceType: 'SLACK',
        submittedAt: iso(11),
      },
      {
        id: 'expense-4',
        organizationId: orgId,
        externalId: 'EXP_0004',
        claimantUserId: 'demo-employee-rohan',
        nodeId: 'node-rohan',
        budgetId: 'budget-operations-aug',
        status: 'RECEIPT_REQUIRED',
        amount: '14999.00',
        currency: 'INR',
        merchant: 'FieldOps Software',
        category: 'SOFTWARE',
        categorySource: 'RULE',
        categoryStatus: 'CONFIRMED',
        categoryConfidence: '0.990',
        categoryReason: 'Software subscription matched the software rule.',
        incurredAt: iso(13),
        description: 'Monthly field operations subscription',
        sourceType: 'BANK_IMPORT',
      },
    ],
  });
  await prisma.financialDocument.createMany({
    data: [
      {
        id: 'document-receipt-1',
        organizationId: orgId,
        expenseClaimId: 'expense-1',
        uploadedById: 'demo-employee-priya',
        type: 'RECEIPT',
        status: 'EXTRACTED',
        fileName: 'indigo-receipt.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 184320,
        storageKey: 'demo/receipts/indigo-receipt.pdf',
        sha256: 'demo-sha256-india-flight-receipt-0001',
        extractedData: { merchant: 'IndiGo', amount: '8500.00', currency: 'INR' },
      },
      {
        id: 'document-receipt-3',
        organizationId: orgId,
        expenseClaimId: 'expense-3',
        uploadedById: 'demo-employee-rohan',
        connectionId: 'integration-slack',
        type: 'RECEIPT',
        status: 'EXTRACTED',
        fileName: 'client-dinner.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 928144,
        storageKey: 'demo/receipts/client-dinner.jpg',
        sha256: 'demo-sha256-client-dinner-receipt-0003',
        sourceExternalId: 'F_SLACK_DEMO_003',
        extractedData: { merchant: 'Copper Chimney', amount: '6800.00', currency: 'INR' },
      },
    ],
  });
  await prisma.receiptRequest.createMany({
    data: [
      {
        id: 'receipt-request-2',
        organizationId: orgId,
        expenseClaimId: 'expense-2',
        employeeUserId: 'demo-employee-priya',
        status: 'SENT',
        channel: 'SLACK',
        dueAt: iso(28),
        nextAttemptAt: iso(27),
        attempts: 1,
        lastSentAt: iso(24),
        externalThreadId: 'D_PRIYA_DEMO:1724500000.000001',
      },
      {
        id: 'receipt-request-4',
        organizationId: orgId,
        expenseClaimId: 'expense-4',
        employeeUserId: 'demo-employee-rohan',
        status: 'PENDING',
        channel: 'IN_APP',
        dueAt: iso(29),
        nextAttemptAt: iso(27),
      },
    ],
  });
  await prisma.notification.createMany({
    data: [
      {
        organizationId: orgId,
        userId: 'demo-employee-priya',
        type: 'RECEIPT_REQUEST',
        channel: 'SLACK',
        status: 'SENT',
        title: 'Receipt needed for ₹2,400 cab expense',
        body: 'Upload the City Cabs receipt so Finance can close EXP_0002.',
        actionUrl: '/expenses?id=EXP_0002',
        entityType: 'ExpenseClaim',
        entityId: 'expense-2',
        sentAt: iso(24),
      },
      {
        organizationId: orgId,
        userId: 'demo-employee-rohan',
        type: 'RECEIPT_REQUEST',
        channel: 'IN_APP',
        status: 'PENDING',
        title: 'Receipt needed for FieldOps Software',
        body: 'Attach the ₹14,999 invoice or receipt for EXP_0004.',
        actionUrl: '/expenses?id=EXP_0004',
        entityType: 'ExpenseClaim',
        entityId: 'expense-4',
      },
      {
        organizationId: orgId,
        userId: 'demo-user',
        type: 'EXCEPTION_REVIEW',
        channel: 'IN_APP',
        status: 'PENDING',
        title: 'Four exceptions need finance review',
        body: 'The deterministic run left four ambiguous records for approval.',
        actionUrl: '/exceptions',
        entityType: 'ReconciliationRun',
      },
      ...['demo-user', 'demo-admin', 'demo-employee-rohan'].map((userId) => ({
        organizationId: orgId,
        userId,
        type: 'CATEGORY_LIMIT_EXCEEDED',
        channel: 'IN_APP' as const,
        status: 'PENDING' as const,
        title: 'MEALS limit exceeded',
        body: 'Rohan Desai is ₹1,800.00 above the ₹5,000.00 soft meals limit. The expense remains recorded because the ₹60,000.00 hard limit is intact.',
        actionUrl: '/organization?node=node-rohan',
        entityType: 'SpendLimit',
        entityId: 'limit-rohan-aug',
        dedupeKey: 'category-limit:limit-rohan-aug:MEALS',
      })),
    ],
  });
  await prisma.agentSkill.createMany({
    data: [
      {
        id: 'skill-receipt-chaser',
        organizationId: orgId,
        createdById: 'demo-user',
        name: 'Receipt follow-up',
        description: 'Draft concise, evidence-linked receipt reminders for employees.',
        instructions:
          'Use only the supplied expense claim and receipt-request evidence. Never invent a merchant, amount, deadline or recipient.',
        allowedTools: ['getExpenseClaim', 'getReceiptRequest', 'proposeReceiptReminder'],
        status: 'ACTIVE',
      },
      {
        id: 'skill-vendor-invoice-review',
        organizationId: orgId,
        createdById: 'demo-user',
        name: 'Vendor invoice review',
        description: 'Compare an invoice with tax lines and linked cash evidence.',
        instructions:
          'Flag conflicting references or amounts for human review. Exact totals remain deterministic.',
        allowedTools: ['getInvoice', 'getTaxLines', 'findCashMovements'],
        status: 'ACTIVE',
      },
    ],
  });
  await prisma.approvalPolicy.createMany({
    data: [
      {
        id: 'policy-low-value-expense',
        organizationId: orgId,
        nodeId: 'node-operations',
        name: 'Low-value documented expenses',
        actionType: 'APPROVE_EXPENSE',
        amountLimit: '5000.00',
        currency: 'INR',
        minimumConfidence: '0.980',
        requiresReceipt: true,
        autoApprove: false,
        enabled: true,
        createdById: 'demo-admin',
      },
      {
        id: 'policy-settlement-adjustment',
        organizationId: orgId,
        name: 'Settlement fee adjustments',
        actionType: 'CREATE_SETTLEMENT_FEE_ADJUSTMENT',
        amountLimit: '25000.00',
        currency: 'INR',
        minimumConfidence: '0.950',
        requiresReceipt: false,
        autoApprove: false,
        enabled: true,
        createdById: 'demo-admin',
      },
    ],
  });
  await prisma.automationJob.createMany({
    data: [
      {
        id: 'job-receipt-reminders',
        organizationId: orgId,
        connectionId: 'integration-slack',
        type: 'RECEIPT_REMINDER',
        name: 'Missing receipt reminders',
        cronExpression: '0 10 * * 1-5',
        enabled: true,
        status: 'IDLE',
        nextRunAt: iso(27),
        payload: { maxAttempts: 3, escalationAfterDays: 5 },
      },
      {
        id: 'job-nightly-reconciliation',
        organizationId: orgId,
        type: 'RECONCILIATION',
        name: 'Nightly reconciliation',
        cronExpression: '0 2 * * *',
        enabled: true,
        status: 'IDLE',
        nextRunAt: iso(27),
      },
    ],
  });
  const transactions = Array.from({ length: 120 }, (_, index) => {
    const scenario =
      index < 100
        ? 'EXACT'
        : index < 104
          ? 'COMPOSITE'
          : index < 108
            ? 'DATE_WINDOW'
            : index < 112
              ? 'AMBIGUOUS'
              : index < 116
                ? 'MISSING'
                : 'AMOUNT_MISMATCH';
    const externalId = `pay_${String(index + 1).padStart(5, '0')}`;
    const status =
      index >= 108 && index % 4 === 0
        ? ('PENDING' as const)
        : index % 29 === 0
          ? ('REFUNDED' as const)
          : ('CAPTURED' as const);
    return {
      id: `txn-${index + 1}`,
      organizationId: orgId,
      externalId,
      amount: (8500 + ((index * 791) % 17800)).toFixed(2),
      currency: 'INR',
      status,
      occurredAt: iso((index % 12) + 1),
      settlementId: index >= 110 && index % 3 === 0 ? null : settlements[index % 12].id,
      sourceMetadata: {
        source: 'mock-razorpay',
        bankReference: `bank_ref_${index + 1}`,
        bankDescription: `payment ${externalId}`,
        reconciliationScenario: scenario,
      },
    };
  });
  await prisma.transaction.createMany({ data: transactions });
  await prisma.invoice.createMany({
    data: Array.from({ length: 18 }, (_, index) => {
      const payable = index % 3 !== 0;
      const vendor = [
        'Nimbus Cloud India',
        'Swift Logistics',
        'Orbit Properties',
        'SupportDesk Systems',
        'Paperplane Marketing',
        'Cobalt Legal',
      ][index % 6];
      const category = [
        'SOFTWARE',
        'VENDOR_PAYMENT',
        'RENT',
        'PROFESSIONAL_SERVICES',
        'MARKETING',
        'OFFICE_SUPPLIES',
      ][index % 6] as const;
      const status = payable
        ? ['OPEN', 'PARTIALLY_PAID', 'OVERDUE', 'PAID'][index % 4]
        : ['OPEN', 'PARTIALLY_COLLECTED', 'PAID'][index % 3];
      return {
        id: `invoice-${index + 1}`,
        organizationId: orgId,
        externalId: `INV_${String(index + 1).padStart(4, '0')}`,
        amount: (27000 + index * 4300).toFixed(2),
        currency: 'INR',
        vendor: payable ? vendor : ['Northstar Retail', 'Crescent Stores', 'Mango Mart'][index % 3],
        direction: payable ? ('PAYABLE' as const) : ('RECEIVABLE' as const),
        category,
        status,
        nodeId: index % 2 === 0 ? 'node-operations' : 'node-finance',
        issuedAt: iso((index % 12) + 1),
        dueAt: iso(((index + 4) % 12) + 1),
        sourceMetadata: {
          source: index % 2 ? 'mock-erp' : 'mock-razorpayx',
          deterministicSeed: true,
        },
      };
    }),
  });
  await prisma.taxLine.createMany({
    data: Array.from({ length: 18 }, (_, index) => {
      const matchStatus = ['MATCHED', 'MATCHED', 'AMBIGUOUS', 'NEEDS_REVIEW', 'UNMATCHED'][
        index % 5
      ] as const;
      return {
        organizationId: orgId,
        externalId: `GST_${String(index + 1).padStart(4, '0')}`,
        invoiceId: `invoice-${index + 1}`,
        amount: (4860 + index * 774).toFixed(2),
        taxRate: ['5.00', '12.00', '18.00'][index % 3],
        matched: matchStatus === 'MATCHED',
        matchStatus,
        taxType: ['GST', 'IGST', 'CGST + SGST'][index % 3],
        taxPeriod: index < 6 ? '2026-07' : index < 15 ? '2026-08' : '2026-09',
        counterpartyTaxId: `27${['AABCN', 'AACCS', 'AABCO'][index % 3]}${String(1200 + index).padStart(4, '0')}Z${index % 9}`,
        sourceMetadata: {
          source: 'mock-erp',
          deterministicSeed: true,
          invoiceReference: `INV_${String(index + 1).padStart(4, '0')}`,
        },
      };
    }),
  });
  const run = await prisma.reconciliationRun.create({
    data: {
      organizationId: orgId,
      status: 'COMPLETED',
      completedAt: new Date(),
      recordsProcessed: 156,
      deterministicMatches: 142,
      exceptionsGenerated: 14,
      agentResolved: 8,
      needsReview: 4,
      unresolved: 2,
    },
  });
  await prisma.reconciliationMatch.createMany({
    data: transactions.slice(0, 110).map((transaction) => ({
      reconciliationRunId: run.id,
      transactionId: transaction.id,
      settlementId: transaction.settlementId,
      status: 'MATCHED',
      confidence: '1.000',
      reason: 'Exact payment reference and amount match',
    })),
  });
  const exceptionRows = Array.from({ length: 14 }, (_, index) => {
    const settlement = settlements[index % settlements.length];
    const unresolved = index >= 12;
    const review = index >= 8 && index < 12;
    const fees = settlement.feeAmount;
    const gst = settlement.gstAmount;
    const refunds = settlement.refundAmount;
    return {
      id: `exception-${index + 1}`,
      organizationId: orgId,
      reconciliationRunId: run.id,
      externalId: `EXC_${String(index + 1).padStart(3, '0')}`,
      type: index % 5 === 0 ? ('TAX_MISMATCH' as const) : ('SETTLEMENT_MISMATCH' as const),
      status: unresolved
        ? ('UNRESOLVED' as const)
        : review
          ? ('NEEDS_REVIEW' as const)
          : index < 4
            ? ('RESOLVED' as const)
            : ('OPEN' as const),
      expectedAmount: settlement.expectedAmount,
      receivedAmount: settlement.receivedAmount,
      confidence: unresolved ? '0.300' : review ? '0.620' : '0.970',
      reason: unresolved
        ? 'Missing counterparty evidence.'
        : review
          ? 'Candidate records have conflicting references.'
          : 'Settlement difference requires investigation.',
      resolution:
        index < 4 ? { approved: true, reason: 'Fee and GST adjustment approved' } : undefined,
      settlement,
      fees,
      gst,
      refunds,
    };
  });
  for (const item of exceptionRows) {
    await prisma.exception.create({
      data: {
        id: item.id,
        organizationId: item.organizationId,
        reconciliationRunId: item.reconciliationRunId,
        externalId: item.externalId,
        type: item.type,
        status: item.status,
        expectedAmount: item.expectedAmount,
        receivedAmount: item.receivedAmount,
        confidence: item.confidence,
        reason: item.reason,
        resolution: item.resolution,
        evidence: {
          create: {
            label: 'Settlement breakdown',
            referenceId: item.settlement.externalId,
            payload: {
              settlementId: item.settlement.externalId,
              expectedAmount: item.expectedAmount,
              receivedAmount: item.receivedAmount,
              gatewayFees: item.fees,
              gstOnFees: item.gst,
              refunds: item.refunds,
            },
          },
        },
      },
    });
  }
  await prisma.auditLog.createMany({
    data: [
      {
        organizationId: orgId,
        actor: 'Reconciliation Engine',
        action: 'RECONCILIATION_COMPLETED',
        entityType: 'ReconciliationRun',
        entityId: run.id,
        details: { matched: 142, exceptions: 14 },
      },
      {
        organizationId: orgId,
        actor: 'Exception Investigator',
        action: 'RESOLUTION_PROPOSED',
        entityType: 'Exception',
        entityId: 'exception-5',
        details: { confidence: 0.97 },
      },
    ],
  });
  console.log(
    `Seeded Acme Commerce India: 4 users, 3 budgets, 4 expenses, 120 transactions, 12 settlements, ${settlementMovements.length + operatingMovements.length + scheduledMovements.length} cash movements, 14 exceptions.`,
  );
}
main().finally(() => prisma.$disconnect());
