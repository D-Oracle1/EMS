/**
 * Loan origination, approval, and disbursement guards.
 *
 * These cover the money-critical rules in `loan.actions.ts`: product limits,
 * the outstanding-loan bypass, the approver's approval limit, segregation of
 * duties (a creator may neither approve nor disburse their own loan), and the
 * disbursement GL entry.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec, sessionUser } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    customer: null as any,
    product: null as any,
    loan: null as any,
    outstandingLoans: [] as any[],
    user: null as any,
    permissionError: null as string | null,
    created: { loans: [] as any[], approvals: [] as any[], schedules: [] as any[], guarantors: [] as any[], customers: [] as any[], disbursements: [] as any[] },
    loanUpdates: [] as any[],
    journalEntries: [] as any[],
    notifications: [] as any[],
    glAccounts: new Map<string, any>(),
    provisionedLogins: [] as string[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  const tx = {
    customer: {
      create: vi.fn(async (args: any) => {
        const row = { id: 'cust-new', ...args.data };
        state.created.customers.push(row);
        return row;
      }),
    },
    loan: {
      create: vi.fn(async (args: any) => {
        const row = { id: 'loan-new', ...args.data };
        state.created.loans.push(row);
        return row;
      }),
      update: vi.fn(async (args: any) => {
        state.loanUpdates.push({ id: args.where.id, ...args.data });
        return args.data;
      }),
    },
    loanApproval: {
      create: vi.fn(async (args: any) => {
        state.created.approvals.push(args.data);
        return args.data;
      }),
    },
    loanSchedule: {
      create: vi.fn(async (args: any) => {
        state.created.schedules.push(args.data);
        return args.data;
      }),
    },
    guarantor: {
      create: vi.fn(async (args: any) => {
        state.created.guarantors.push(args.data);
        return args.data;
      }),
    },
    loanDisbursement: {
      create: vi.fn(async (args: any) => {
        state.created.disbursements.push(args.data);
        return args.data;
      }),
    },
  };

  return {
    prisma: {
      customer: { findUnique: vi.fn(async () => state.customer) },
      loanProduct: { findUnique: vi.fn(async () => state.product) },
      loan: {
        findUnique: vi.fn(async () => state.loan),
        findMany: vi.fn(async () => state.outstandingLoans),
        update: vi.fn(async (args: any) => {
          state.loanUpdates.push({ id: args.where.id, ...args.data });
          return args.data;
        }),
      },
      staff: { findFirst: vi.fn(async () => ({ id: 'officer-9' })) },
      sequence: { upsert: vi.fn() },
    },
    withTransaction: vi.fn(async (fn: any) => fn(tx)),
    withRetry: vi.fn(async (fn: any) => fn()),
  };
});

vi.mock('@/lib/auth-utils', () => {
  const { state } = h;
  const resolve = async () => {
    if (state.permissionError) throw new Error(state.permissionError);
    return state.user;
  };
  return {
    requirePermission: vi.fn(resolve),
    requireAnyPermission: vi.fn(resolve),
    getSession: vi.fn(async () => ({ user: await resolve() })),
  };
});

vi.mock('@/lib/utils', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  generateReference: vi.fn(async (type: string) => (type === 'LOAN' ? 'LN000123' : `${type}-001`)),
}));

vi.mock('@/lib/audit', () => ({ auditLog: vi.fn(async () => undefined) }));
vi.mock('@/lib/approval-history', () => ({ recordApprovalHistory: vi.fn(async () => undefined) }));
vi.mock('@/lib/email', () => ({ notifyCustomerByEmail: vi.fn(async () => undefined) }));
vi.mock('@/lib/customer-auth', () => ({
  provisionCustomerLogin: vi.fn(async (id: string) => {
    h.state.provisionedLogins.push(id);
  }),
}));
vi.mock('@/lib/notifications', () => ({
  createNotification: vi.fn(async (n: any) => {
    h.state.notifications.push(n);
  }),
  createNotificationForUsers: vi.fn(async (ids: string[], n: any) => {
    h.state.notifications.push({ ...n, recipients: ids });
  }),
  getUsersWithPermission: vi.fn(async () => ['mgr-1']),
  getUsersWithAnyPermission: vi.fn(async () => ['mgr-1', 'mgr-2']),
}));
vi.mock('@/lib/accounting-engine', () => ({
  createJournalEntry: vi.fn(async (entry: any) => {
    h.state.journalEntries.push(entry);
    return { id: 'je-1', entryNumber: 'JNL000001' };
  }),
  getAccountByCode: vi.fn(async (code: string) => h.state.glAccounts.get(code) ?? null),
}));

import { createLoan, submitForApproval, processApproval, disburseLoan } from '@/actions/loan.actions';

const { state } = h;

function activeCustomer(overrides: Record<string, unknown> = {}) {
  return { id: 'cust-1', firstName: 'Chidi', lastName: 'Eze', status: 'ACTIVE', branchId: 'branch-1', ...overrides };
}

function loanProduct(overrides: Record<string, unknown> = {}) {
  return {
    id: 'prod-1',
    name: 'SME Loan',
    isActive: true,
    minAmount: dec(50000),
    maxAmount: dec(5000000),
    minTenure: 3,
    maxTenure: 24,
    interestRate: dec(24),
    interestType: 'REDUCING_BALANCE',
    processingFee: dec(1),
    insuranceFee: dec(0.5),
    ...overrides,
  };
}

function pendingLoan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'loan-1',
    loanNumber: 'LN000001',
    customerId: 'cust-1',
    branchId: 'branch-1',
    status: 'PENDING_APPROVAL',
    principalAmount: dec(500000),
    totalFees: dec(7500),
    tenure: 12,
    createdById: 'staff-1',
    customer: { firstName: 'Chidi', lastName: 'Eze' },
    product: { name: 'SME Loan' },
    approvals: [],
    ...overrides,
  };
}

const validLoanInput = {
  customerId: 'cust-1',
  productId: 'prod-1',
  principalAmount: 500000,
  tenure: 12,
  purpose: 'Working capital',
};

beforeEach(() => {
  state.customer = activeCustomer();
  state.product = loanProduct();
  state.loan = null;
  state.outstandingLoans = [];
  state.permissionError = null;
  state.user = sessionUser();
  state.created = { loans: [], approvals: [], schedules: [], guarantors: [], customers: [], disbursements: [] };
  state.loanUpdates = [];
  state.journalEntries = [];
  state.notifications = [];
  state.provisionedLogins = [];
  state.glAccounts = new Map([
    ['1310', { id: 'gl-loans' }],
    ['1120', { id: 'gl-cash' }],
    ['4210', { id: 'gl-fees' }],
    ['4110', { id: 'gl-interest' }],
  ]);
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// createLoan — borrower and product eligibility
// ---------------------------------------------------------------------------
describe('createLoan - borrower eligibility', () => {
  it('refuses a loan for a customer that is not ACTIVE', async () => {
    state.customer = activeCustomer({ status: 'INACTIVE' });

    const result = await createLoan(validLoanInput);

    expect(result).toMatchObject({ success: false, error: 'Customer not found or not active' });
    expect(state.created.loans).toHaveLength(0);
  });

  it('refuses a loan for an unknown customer', async () => {
    state.customer = null;

    const result = await createLoan(validLoanInput);

    expect(result.success).toBe(false);
  });

  it('refuses when neither an existing customer nor new customer details are given', async () => {
    const result = await createLoan({ ...validLoanInput, customerId: '' });

    expect(result).toMatchObject({ success: false });
    expect(result.error).toMatch(/select an existing customer/);
  });

  it('blocks a second loan while an ACTIVE loan is outstanding', async () => {
    state.outstandingLoans = [{ id: 'loan-old' }];

    const result = await createLoan(validLoanInput);

    expect(result.error).toMatch(/outstanding loans/);
    expect(state.created.loans).toHaveLength(0);
  });

  it('allows the loan when the owing bypass carries a justification', async () => {
    state.outstandingLoans = [{ id: 'loan-old' }];

    const result = await createLoan({
      ...validLoanInput,
      owingBypass: true,
      owingBypassReason: 'Board approved top-up facility for expansion',
    });

    expect(result.success).toBe(true);
    expect(state.created.loans[0]).toMatchObject({ owingBypass: true, owingBypassLoanIds: ['loan-old'] });
  });

  it('rejects an owing bypass whose justification is too short', async () => {
    state.outstandingLoans = [{ id: 'loan-old' }];

    const result = await createLoan({ ...validLoanInput, owingBypass: true, owingBypassReason: 'ok' });

    expect(result.error).toMatch(/at least 10 characters/);
    expect(state.created.loans).toHaveLength(0);
  });
});

describe('createLoan - product limits', () => {
  it('rejects an inactive product', async () => {
    state.product = loanProduct({ isActive: false });

    const result = await createLoan(validLoanInput);

    expect(result.error).toMatch(/product not found or inactive/i);
  });

  it('rejects an amount below the product minimum', async () => {
    const result = await createLoan({ ...validLoanInput, principalAmount: 10000 });

    expect(result.error).toMatch(/Amount must be between/);
  });

  it('rejects an amount above the product maximum', async () => {
    const result = await createLoan({ ...validLoanInput, principalAmount: 9000000 });

    expect(result.error).toMatch(/Amount must be between/);
  });

  it('accepts an amount exactly at the product boundary', async () => {
    const result = await createLoan({ ...validLoanInput, principalAmount: 50000 });

    expect(result.success).toBe(true);
  });

  it('rejects a tenure outside the product range', async () => {
    const result = await createLoan({ ...validLoanInput, tenure: 36 });

    expect(result.error).toMatch(/Tenure must be between/);
  });
});

describe('createLoan - persistence', () => {
  it('creates the loan in DRAFT with fees derived from the product percentages', async () => {
    const result = await createLoan(validLoanInput);

    expect(result.success).toBe(true);
    // 1% processing + 0.5% insurance on 500,000
    expect(state.created.loans[0]).toMatchObject({
      status: 'DRAFT',
      processingFee: 5000,
      insuranceFee: 2500,
      totalFees: 7500,
      loanNumber: 'LN000123',
    });
  });

  it('writes one schedule row per month of tenure', async () => {
    await createLoan(validLoanInput);

    expect(state.created.schedules).toHaveLength(12);
    expect(state.created.schedules[0].installmentNumber).toBe(1);
  });

  it('uses the product rate when no override is supplied', async () => {
    await createLoan(validLoanInput);

    expect(state.created.loans[0].interestRate).toBe(24);
  });

  it('honours an explicit interest-rate override', async () => {
    await createLoan({ ...validLoanInput, interestRate: 18 });

    expect(state.created.loans[0].interestRate).toBe(18);
  });

  it('skips guarantors that are missing a name or phone', async () => {
    await createLoan({
      ...validLoanInput,
      guarantors: [
        { firstName: 'Ngozi', lastName: 'Ali', phone: '08030000000' },
        { firstName: '', lastName: 'Nameless', phone: '08031111111' },
        { firstName: 'No', lastName: 'Phone', phone: '' },
      ] as any,
    });

    expect(state.created.guarantors).toHaveLength(1);
    expect(state.created.guarantors[0]).toMatchObject({ firstName: 'Ngozi' });
  });

  it('registers a new borrower inline and provisions their portal login', async () => {
    const result = await createLoan({
      productId: 'prod-1',
      principalAmount: 500000,
      tenure: 12,
      newCustomer: {
        firstName: 'Bola',
        lastName: 'Ade',
        phone: '08030000000',
        address: '12 Marina, Lagos',
      } as any,
    });

    expect(result.success).toBe(true);
    expect(state.created.customers).toHaveLength(1);
    expect(state.provisionedLogins).toEqual(['cust-new']);
  });

  it('refuses an inline registration that is missing the address', async () => {
    const result = await createLoan({
      productId: 'prod-1',
      principalAmount: 500000,
      tenure: 12,
      newCustomer: { firstName: 'Bola', lastName: 'Ade', phone: '08030000000' } as any,
    });

    expect(result.error).toMatch(/requires an address/);
    expect(state.created.customers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// submitForApproval
// ---------------------------------------------------------------------------
describe('submitForApproval', () => {
  it('only accepts a VERIFIED loan', async () => {
    state.loan = pendingLoan({ status: 'DRAFT' });

    const result = await submitForApproval('loan-1');

    expect(result.error).toMatch(/Cannot submit for approval with status DRAFT/);
    expect(state.loanUpdates).toHaveLength(0);
  });

  it('moves a VERIFIED loan to PENDING_APPROVAL and alerts approvers', async () => {
    state.loan = pendingLoan({ status: 'VERIFIED' });

    const result = await submitForApproval('loan-1');

    expect(result.success).toBe(true);
    expect(state.loanUpdates[0]).toMatchObject({ status: 'PENDING_APPROVAL' });
    expect(state.notifications[0].recipients).toContain('mgr-1');
  });

  it('does not notify the submitter about their own submission', async () => {
    state.loan = pendingLoan({ status: 'VERIFIED' });
    state.user = sessionUser({ id: 'mgr-1' });

    await submitForApproval('loan-1');

    expect(state.notifications[0].recipients).not.toContain('mgr-1');
  });
});

// ---------------------------------------------------------------------------
// processApproval — approval limits and segregation of duties
// ---------------------------------------------------------------------------
describe('processApproval', () => {
  const approver = (overrides: Record<string, unknown> = {}) =>
    sessionUser({ id: 'mgr-1', roleCode: 'BRANCH_MANAGER', roleLevel: 70, approvalLimit: 1000000, ...overrides });

  beforeEach(() => {
    state.loan = pendingLoan();
    state.user = approver();
  });

  it('surfaces a permission failure instead of approving', async () => {
    state.permissionError = 'Permission denied: requires one of LOANS:APPROVE_L1, LOANS:APPROVE_L2';

    const result = await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Permission denied/);
    expect(state.created.approvals).toHaveLength(0);
  });

  it('refuses a loan that is not PENDING_APPROVAL', async () => {
    state.loan = pendingLoan({ status: 'ACTIVE' });

    const result = await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(result.error).toMatch(/Cannot approve loan with status ACTIVE/);
  });

  it('blocks the creator from approving their own loan', async () => {
    state.loan = pendingLoan({ createdById: 'mgr-1' });

    const result = await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(result.error).toMatch(/cannot approve a loan you created/i);
    expect(state.created.approvals).toHaveLength(0);
  });

  it('blocks an approval above the approver limit', async () => {
    state.user = approver({ approvalLimit: 250000 });

    const result = await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(result.error).toMatch(/exceeds your approval limit of 250000/);
    expect(state.loanUpdates).toHaveLength(0);
  });

  it('allows an approval exactly at the approver limit', async () => {
    state.user = approver({ approvalLimit: 500000 });

    const result = await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(result.success).toBe(true);
  });

  it('treats a zero approval limit as unlimited', async () => {
    state.user = approver({ approvalLimit: 0 });

    const result = await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(result.success).toBe(true);
  });

  it('does not apply the approval limit to a rejection', async () => {
    state.user = approver({ approvalLimit: 1 });

    const result = await processApproval({ loanId: 'loan-1', decision: 'REJECTED', comments: 'Weak cashflow' });

    expect(result.success).toBe(true);
    expect(state.loanUpdates[0]).toMatchObject({ status: 'REJECTED', rejectionReason: 'Weak cashflow' });
  });

  it('moves an approved loan to PENDING_DISBURSEMENT and stamps approvedAt', async () => {
    const result = await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(result.success).toBe(true);
    expect(state.loanUpdates[0]).toMatchObject({ status: 'PENDING_DISBURSEMENT' });
    expect(state.loanUpdates[0].approvedAt).toBeInstanceOf(Date);
  });

  it('records a level-1 approval for a manager and level-2 for a director', async () => {
    await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });
    expect(state.created.approvals[0].level).toBe(1);

    state.created.approvals = [];
    state.loanUpdates = [];
    state.user = approver({ roleLevel: 95, roleCode: 'DIRECTOR' });

    await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });
    expect(state.created.approvals[0].level).toBe(2);
  });

  it('defaults the approved amount to the requested principal', async () => {
    await processApproval({ loanId: 'loan-1', decision: 'APPROVED' });

    expect(state.created.approvals[0].approvedAmount).toBe(500000);
  });

  it('records a part-approval amount when the approver reduces it', async () => {
    await processApproval({ loanId: 'loan-1', decision: 'APPROVED', approvedAmount: 400000 });

    expect(state.created.approvals[0].approvedAmount).toBe(400000);
  });

  it('notifies the originating officer of the decision', async () => {
    await processApproval({ loanId: 'loan-1', decision: 'REJECTED', comments: 'Insufficient collateral' });

    expect(state.notifications[0]).toMatchObject({ userId: 'staff-1', type: 'WARNING' });
    expect(state.notifications[0].message).toMatch(/Insufficient collateral/);
  });
});

// ---------------------------------------------------------------------------
// disburseLoan — the GL posting
// ---------------------------------------------------------------------------
describe('disburseLoan', () => {
  const disburser = sessionUser({ id: 'acct-1', roleCode: 'ACCOUNTS_OFFICER' });
  const input = { loanId: 'loan-1', disbursementMode: 'BANK_TRANSFER' };

  beforeEach(() => {
    state.user = disburser;
    state.loan = pendingLoan({ status: 'PENDING_DISBURSEMENT' });
  });

  it('refuses to disburse a loan that is not approved', async () => {
    state.loan = pendingLoan({ status: 'PENDING_APPROVAL' });

    const result = await disburseLoan(input);

    expect(result.error).toMatch(/Cannot disburse loan with status PENDING_APPROVAL/);
    expect(state.created.disbursements).toHaveLength(0);
  });

  it('blocks the creator from disbursing their own loan', async () => {
    state.loan = pendingLoan({ status: 'PENDING_DISBURSEMENT', createdById: 'acct-1' });

    const result = await disburseLoan(input);

    expect(result.error).toMatch(/segregation of duties/);
  });

  it('refuses when the GL accounts are not configured', async () => {
    state.glAccounts.delete('1310');

    const result = await disburseLoan(input);

    expect(result.error).toMatch(/GL accounts not configured/);
    expect(state.created.disbursements).toHaveLength(0);
  });

  it('disburses the approved amount rather than the requested principal', async () => {
    state.loan = pendingLoan({
      status: 'PENDING_DISBURSEMENT',
      approvals: [{ approvedAmount: dec(400000) }],
    });

    const result = await disburseLoan(input);

    expect(result.success).toBe(true);
    expect(state.created.disbursements[0].disbursedAmount).toBe(400000);
  });

  it('posts a balanced entry: Dr receivable, Cr cash net of fees, Cr fee income', async () => {
    await disburseLoan(input);

    const lines = state.journalEntries[0].lines;
    const totalDebit = lines.reduce((sum: number, l: any) => sum + (l.debitAmount || 0), 0);
    const totalCredit = lines.reduce((sum: number, l: any) => sum + (l.creditAmount || 0), 0);

    expect(totalDebit).toBe(500000);
    expect(totalCredit).toBe(500000);
    expect(lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ accountId: 'gl-cash', creditAmount: 492500 }),
      expect.objectContaining({ accountId: 'gl-fees', creditAmount: 7500 }),
    ]));
  });

  it('keeps the entry balanced by crediting cash in full when no fee account exists', async () => {
    state.glAccounts.delete('4210');

    await disburseLoan(input);

    const lines = state.journalEntries[0].lines;
    const totalCredit = lines.reduce((sum: number, l: any) => sum + (l.creditAmount || 0), 0);

    expect(lines).toHaveLength(2);
    expect(totalCredit).toBe(500000);
  });

  it('activates the loan and sets maturity from the tenure', async () => {
    await disburseLoan(input);

    expect(state.loanUpdates[0]).toMatchObject({ status: 'ACTIVE' });
    expect(state.loanUpdates[0].maturityDate).toBeInstanceOf(Date);
    expect(state.journalEntries[0].autoPost).toBe(true);
  });
});
