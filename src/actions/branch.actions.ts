'use server';

/**
 * Branch Oversight — Server Actions
 * Hylink Finance Limited EMS
 *
 * One window per branch onto everything that happened there: the staff posted
 * to it, the customers it registered, its loans, savings and deposits, the
 * money that moved through them, its journal entries and every audited action
 * its staff took. Read-only.
 *
 * The index of every branch is for the superuser and roles at level 85 and up
 * (General Manager, Director) — see canOpenBranchesConsole. IT holds
 * SYSTEM:CONFIG_MANAGE but touches no customer or money data. A single branch
 * can also be opened by the manager posted to it (My Branch), and only that one.
 */

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { overseesOwnBranch, canOpenBranchesConsole } from '@/lib/branch-scope';

/** Allow only those who may open the Branches console. */
async function requireBranchesConsole() {
  const { user } = await getSession();
  if (!canOpenBranchesConsole(user)) throw new Error('Permission denied');
  return user;
}

/**
 * Allow the Branches console into any branch, and a branch manager into their own.
 * Throws for anyone else, and for a manager reaching for another branch.
 */
async function authorizeBranch(branchId: string) {
  const { user } = await getSession();
  if (canOpenBranchesConsole(user)) return user;
  if (overseesOwnBranch(user)) {
    const staff = await prisma.staff.findUnique({ where: { id: user.id }, select: { branchId: true } });
    if (staff?.branchId && staff.branchId === branchId) return user;
  }
  throw new Error('Permission denied');
}

/**
 * The branch the signed-in manager runs, or null when they have none or are
 * not a branch manager. Drives the My Branch page.
 */
export async function getMyBranchId(): Promise<string | null> {
  const { user } = await getSession();
  if (!overseesOwnBranch(user)) return null;
  const staff = await prisma.staff.findUnique({ where: { id: user.id }, select: { branchId: true } });
  return staff?.branchId ?? null;
}

/** Loans that are out with the customer and still owed. */
const LIVE_LOAN_STATUSES = ['DISBURSED', 'ACTIVE', 'OVERDUE'] as const;
/** Loans somewhere between application and disbursement. */
const PIPELINE_LOAN_STATUSES = [
  'PENDING_VERIFICATION', 'VERIFICATION_IN_PROGRESS', 'VERIFIED',
  'PENDING_APPROVAL', 'APPROVED', 'PENDING_DISBURSEMENT',
] as const;

const num = (v: unknown) => (v == null ? 0 : Number(v));

async function branchFigures(branchId: string) {
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const [
    staff, activeStaff, customers, newCustomers,
    loans, liveLoans, pipelineLoans, overdueLoans,
    savings, fds, activity30,
  ] = await Promise.all([
    prisma.staff.count({ where: { branchId, isDeleted: false } }),
    prisma.staff.count({ where: { branchId, isDeleted: false, status: 'ACTIVE' } }),
    prisma.customer.count({ where: { branchId, isDeleted: false } }),
    prisma.customer.count({ where: { branchId, isDeleted: false, createdAt: { gte: since } } }),
    prisma.loan.count({ where: { branchId, isDeleted: false } }),
    prisma.loan.aggregate({
      where: { branchId, isDeleted: false, status: { in: [...LIVE_LOAN_STATUSES] } },
      _count: true,
      _sum: { principalAmount: true },
    }),
    prisma.loan.count({ where: { branchId, isDeleted: false, status: { in: [...PIPELINE_LOAN_STATUSES] } } }),
    prisma.loan.count({ where: { branchId, isDeleted: false, status: { in: ['OVERDUE', 'DEFAULTED'] } } }),
    prisma.savingsAccount.aggregate({
      where: { branchId, isDeleted: false, status: { notIn: ['CLOSED', 'TERMINATED'] } },
      _count: true,
      _sum: { currentBalance: true },
    }),
    prisma.fixedDeposit.aggregate({
      where: { branchId, status: 'ACTIVE' },
      _count: true,
      _sum: { principalAmount: true },
    }),
    prisma.auditLog.count({ where: { user: { branchId }, createdAt: { gte: since } } }),
  ]);

  return {
    staffCount: staff,
    activeStaffCount: activeStaff,
    customerCount: customers,
    newCustomers30d: newCustomers,
    loanCount: loans,
    liveLoanCount: liveLoans._count,
    loanPortfolio: num(liveLoans._sum.principalAmount),
    pipelineLoanCount: pipelineLoans,
    overdueLoanCount: overdueLoans,
    savingsCount: savings._count,
    savingsBalance: num(savings._sum.currentBalance),
    fixedDepositCount: fds._count,
    fixedDepositPrincipal: num(fds._sum.principalAmount),
    activity30d: activity30,
  };
}

/** Every branch with its headline figures — the Branches index. */
export async function getBranchOverview() {
  await requireBranchesConsole();

  const branches = await prisma.branch.findMany({ orderBy: [{ isActive: 'desc' }, { code: 'asc' }] });
  const figures = await Promise.all(branches.map((b) => branchFigures(b.id)));

  return branches.map((b, i) => ({
    id: b.id,
    code: b.code,
    name: b.name,
    address: b.address,
    phone: b.phone,
    email: b.email,
    isActive: b.isActive,
    ...figures[i],
  }));
}

/** One branch: its details and headline figures. Null when it doesn't exist. */
export async function getBranchSummary(id: string) {
  await authorizeBranch(id);

  const branch = await prisma.branch.findUnique({ where: { id } });
  if (!branch) return null;

  const figures = await branchFigures(id);
  return {
    id: branch.id,
    code: branch.code,
    name: branch.name,
    address: branch.address,
    phone: branch.phone,
    email: branch.email,
    isActive: branch.isActive,
    createdAt: branch.createdAt.toISOString(),
    ...figures,
  };
}

export type BranchRecordKind =
  | 'activity' | 'staff' | 'customers' | 'loans' | 'savings'
  | 'fixed-deposits' | 'transactions' | 'journal';

export interface BranchRecordFilters {
  page?: number;
  limit?: number;
  search?: string;
  startDate?: string;
  endDate?: string;
}

function dateRange(filters: BranchRecordFilters) {
  if (!filters.startDate && !filters.endDate) return undefined;
  const range: { gte?: Date; lte?: Date } = {};
  if (filters.startDate) range.gte = new Date(filters.startDate);
  if (filters.endDate) {
    const end = new Date(filters.endDate);
    end.setHours(23, 59, 59, 999);
    range.lte = end;
  }
  return range;
}

const staffName = (s?: { firstName: string; lastName: string } | null) =>
  s ? `${s.firstName} ${s.lastName}` : null;

/**
 * One page of a branch's records of the given kind, newest first. Each row is
 * flattened to plain values so it can cross to the client as-is.
 */
export async function getBranchRecords(
  branchId: string,
  kind: BranchRecordKind,
  filters: BranchRecordFilters = {}
) {
  await authorizeBranch(branchId);

  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, filters.limit || 25);
  const skip = (page - 1) * limit;
  const q = filters.search?.trim();
  const contains = (v: string) => ({ contains: v, mode: 'insensitive' as const });
  const when = dateRange(filters);

  let rows: Record<string, unknown>[] = [];
  let total = 0;

  switch (kind) {
    case 'activity': {
      const where = {
        user: { branchId },
        ...(when && { createdAt: when }),
        ...(q && {
          OR: [
            { description: contains(q) },
            { module: contains(q) },
            { entityType: contains(q) },
            { userEmail: contains(q) },
          ],
        }),
      };
      const [data, count] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: { user: { select: { firstName: true, lastName: true, employeeId: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.auditLog.count({ where }),
      ]);
      total = count;
      rows = data.map((l) => ({
        id: l.id,
        createdAt: l.createdAt.toISOString(),
        userName: staffName(l.user) ?? l.userEmail ?? 'System',
        employeeId: l.user?.employeeId ?? null,
        module: l.module,
        action: l.action,
        entityType: l.entityType,
        description: l.description,
      }));
      break;
    }

    case 'staff': {
      const where = {
        branchId,
        isDeleted: false,
        ...(when && { hireDate: when }),
        ...(q && {
          OR: [
            { firstName: contains(q) },
            { lastName: contains(q) },
            { employeeId: contains(q) },
            { email: contains(q) },
            { jobTitle: contains(q) },
          ],
        }),
      };
      const [data, count] = await Promise.all([
        prisma.staff.findMany({
          where,
          include: {
            role: { select: { name: true } },
            department: { select: { name: true } },
          },
          orderBy: [{ status: 'asc' }, { firstName: 'asc' }],
          skip,
          take: limit,
        }),
        prisma.staff.count({ where }),
      ]);
      total = count;
      rows = data.map((s) => ({
        id: s.id,
        name: staffName(s),
        employeeId: s.employeeId,
        email: s.email,
        jobTitle: s.jobTitle,
        role: s.role?.name ?? null,
        department: s.department?.name ?? null,
        status: s.status,
        hireDate: s.hireDate.toISOString(),
        lastLoginAt: s.lastLoginAt?.toISOString() ?? null,
      }));
      break;
    }

    case 'customers': {
      const where = {
        branchId,
        isDeleted: false,
        ...(when && { createdAt: when }),
        ...(q && {
          OR: [
            { firstName: contains(q) },
            { lastName: contains(q) },
            { customerNumber: contains(q) },
            { phone: contains(q) },
            { email: contains(q) },
            { companyName: contains(q) },
          ],
        }),
      };
      const [data, count] = await Promise.all([
        prisma.customer.findMany({
          where,
          include: { _count: { select: { loans: true, savingsAccounts: true, fixedDeposits: true } } },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.customer.count({ where }),
      ]);
      total = count;
      rows = data.map((c) => ({
        id: c.id,
        customerNumber: c.customerNumber,
        name: c.customerType === 'INDIVIDUAL' || !c.companyName ? `${c.firstName} ${c.lastName}` : c.companyName,
        phone: c.phone,
        status: c.status,
        kycVerified: c.kycVerified,
        loans: c._count.loans,
        savings: c._count.savingsAccounts,
        fixedDeposits: c._count.fixedDeposits,
        createdAt: c.createdAt.toISOString(),
      }));
      break;
    }

    case 'loans': {
      const where = {
        branchId,
        isDeleted: false,
        ...(when && { applicationDate: when }),
        ...(q && {
          OR: [
            { loanNumber: contains(q) },
            { customer: { firstName: contains(q) } },
            { customer: { lastName: contains(q) } },
            { customer: { customerNumber: contains(q) } },
          ],
        }),
      };
      const [data, count] = await Promise.all([
        prisma.loan.findMany({
          where,
          include: {
            customer: { select: { firstName: true, lastName: true, customerNumber: true } },
            product: { select: { name: true } },
            createdBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { applicationDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.loan.count({ where }),
      ]);
      total = count;
      rows = data.map((l) => ({
        id: l.id,
        loanNumber: l.loanNumber,
        customer: `${l.customer.firstName} ${l.customer.lastName}`,
        customerNumber: l.customer.customerNumber,
        product: l.product?.name ?? null,
        principalAmount: num(l.principalAmount),
        totalRepayment: num(l.totalRepayment),
        status: l.status,
        officer: staffName(l.createdBy),
        applicationDate: l.applicationDate.toISOString(),
        disbursedAt: l.disbursedAt?.toISOString() ?? null,
      }));
      break;
    }

    case 'savings': {
      const where = {
        branchId,
        isDeleted: false,
        ...(when && { openedAt: when }),
        ...(q && {
          OR: [
            { accountNumber: contains(q) },
            { customer: { firstName: contains(q) } },
            { customer: { lastName: contains(q) } },
            { customer: { customerNumber: contains(q) } },
          ],
        }),
      };
      const [data, count] = await Promise.all([
        prisma.savingsAccount.findMany({
          where,
          include: {
            customer: { select: { firstName: true, lastName: true } },
            product: { select: { name: true } },
          },
          orderBy: { openedAt: 'desc' },
          skip,
          take: limit,
        }),
        prisma.savingsAccount.count({ where }),
      ]);
      total = count;
      rows = data.map((a) => ({
        id: a.id,
        accountNumber: a.accountNumber,
        customer: `${a.customer.firstName} ${a.customer.lastName}`,
        product: a.product?.name ?? null,
        currentBalance: num(a.currentBalance),
        status: a.status,
        openedAt: a.openedAt.toISOString(),
        lastTransactionAt: a.lastTransactionAt?.toISOString() ?? null,
      }));
      break;
    }

    case 'fixed-deposits': {
      const where = {
        branchId,
        ...(when && { startDate: when }),
        ...(q && {
          OR: [
            { certificateNumber: contains(q) },
            { customer: { firstName: contains(q) } },
            { customer: { lastName: contains(q) } },
          ],
        }),
      };
      const [data, count] = await Promise.all([
        prisma.fixedDeposit.findMany({
          where,
          include: { customer: { select: { firstName: true, lastName: true } } },
          orderBy: { startDate: 'desc' },
          skip,
          take: limit,
        }),
        prisma.fixedDeposit.count({ where }),
      ]);
      total = count;
      rows = data.map((f) => ({
        id: f.id,
        certificateNumber: f.certificateNumber,
        customer: `${f.customer.firstName} ${f.customer.lastName}`,
        principalAmount: num(f.principalAmount),
        maturityAmount: num(f.maturityAmount),
        interestRate: num(f.interestRate),
        status: f.status,
        startDate: f.startDate.toISOString(),
        maturityDate: f.maturityDate.toISOString(),
      }));
      break;
    }

    case 'transactions': {
      // Savings movements and loan repayments on the branch's accounts, merged
      // into one feed. Each source is read up to the end of the requested page
      // and the merged list is sliced, so paging stays correct across both.
      const savingsWhere = {
        account: { branchId },
        ...(when && { processedAt: when }),
        ...(q && {
          OR: [
            { transactionRef: contains(q) },
            { account: { accountNumber: contains(q) } },
            { account: { customer: { firstName: contains(q) } } },
            { account: { customer: { lastName: contains(q) } } },
          ],
        }),
      };
      const repaymentWhere = {
        loan: { branchId },
        ...(when && { collectedAt: when }),
        ...(q && {
          OR: [
            { receiptNumber: contains(q) },
            { loan: { loanNumber: contains(q) } },
            { loan: { customer: { firstName: contains(q) } } },
            { loan: { customer: { lastName: contains(q) } } },
          ],
        }),
      };
      const window = skip + limit;
      const [savingsTx, repayments, savingsCount, repaymentCount] = await Promise.all([
        prisma.savingsTransaction.findMany({
          where: savingsWhere,
          include: {
            account: {
              select: { id: true, accountNumber: true, customer: { select: { firstName: true, lastName: true } } },
            },
            processedBy: { select: { firstName: true, lastName: true } },
          },
          orderBy: { processedAt: 'desc' },
          take: window,
        }),
        prisma.loanRepayment.findMany({
          where: repaymentWhere,
          include: {
            loan: {
              select: { id: true, loanNumber: true, customer: { select: { firstName: true, lastName: true } } },
            },
          },
          orderBy: { collectedAt: 'desc' },
          take: window,
        }),
        prisma.savingsTransaction.count({ where: savingsWhere }),
        prisma.loanRepayment.count({ where: repaymentWhere }),
      ]);

      // LoanRepayment carries only the collector's id; resolve names in one query.
      const collectorIds = Array.from(new Set(repayments.map((r) => r.collectedById)));
      const collectors = collectorIds.length
        ? await prisma.staff.findMany({
            where: { id: { in: collectorIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
      const collectorName = new Map(collectors.map((c) => [c.id, staffName(c)]));

      const merged = [
        ...savingsTx.map((t) => ({
          id: `s-${t.id}`,
          at: t.processedAt.toISOString(),
          source: 'SAVINGS',
          type: t.transactionType,
          reference: t.transactionRef,
          account: t.account.accountNumber,
          href: `/savings/${t.account.id}`,
          customer: `${t.account.customer.firstName} ${t.account.customer.lastName}`,
          amount: num(t.amount),
          paymentMode: t.paymentMode,
          by: staffName(t.processedBy),
          reversed: t.isReversed,
        })),
        ...repayments.map((r) => ({
          id: `r-${r.id}`,
          at: r.collectedAt.toISOString(),
          source: 'LOAN',
          type: 'REPAYMENT',
          reference: r.receiptNumber,
          account: r.loan.loanNumber,
          href: `/loans/${r.loan.id}`,
          customer: `${r.loan.customer.firstName} ${r.loan.customer.lastName}`,
          amount: num(r.amount),
          paymentMode: r.paymentMode,
          by: collectorName.get(r.collectedById) ?? null,
          reversed: false,
        })),
      ].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

      total = savingsCount + repaymentCount;
      rows = merged.slice(skip, skip + limit);
      break;
    }

    case 'journal': {
      const where = {
        branchId,
        ...(when && { entryDate: when }),
        ...(q && {
          OR: [
            { entryNumber: contains(q) },
            { description: contains(q) },
            { narration: contains(q) },
          ],
        }),
      };
      const [data, count] = await Promise.all([
        prisma.journalEntry.findMany({
          where,
          include: { createdBy: { select: { firstName: true, lastName: true } } },
          orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
          skip,
          take: limit,
        }),
        prisma.journalEntry.count({ where }),
      ]);
      total = count;
      rows = data.map((j) => ({
        id: j.id,
        entryNumber: j.entryNumber,
        entryDate: j.entryDate.toISOString(),
        entryType: j.entryType,
        description: j.description,
        sourceModule: j.sourceModule,
        totalDebit: num(j.totalDebit),
        status: j.status,
        isReversed: j.isReversed,
        createdBy: staffName(j.createdBy),
      }));
      break;
    }
  }

  return {
    data: rows,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}
