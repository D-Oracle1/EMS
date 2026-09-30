'use server';

/**
 * Sales — Server Actions
 * Hylink Finance Limited EMS
 *
 * Two kinds of sale:
 *  - A staff sale, reported by the seller: anyone in Marketing or anyone on
 *    the sales target engine (Staff.onSalesTarget). It earns commission.
 *  - A company (direct) sale, recorded by an admin and credited to no one: a
 *    walk-in customer the company served itself. It earns no commission.
 *
 * A sale is either a record the seller brought in (a savings account, loan or
 * fixed deposit that already exists) or money collected in the field. Nothing
 * touches a balance until a sale is confirmed, by an admin or the accountant.
 * On confirmation a field collection is posted through the shared posting
 * core (lib/money-posting), and a staff sale records its commission at the
 * rate set in Configuration.
 *
 * Who may do what is in lib/marketing-access.ts.
 */

import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification, createNotificationForUsers } from '@/lib/notifications';
import { generateReference } from '@/lib/utils';
import { getConfigNumber } from '@/lib/system-config';
import {
  MARKETING_DEPARTMENT_CODE, SALE_CONFIRM_ROLE_LEVEL, ACCOUNTANT_PERMISSION, COMMISSION_CONFIG_KEY, SALE_TYPE_LABELS,
  COMPANY_SALE_LABEL, canConfirmSales, commissionFor, validateSaleLinks, monthKey, monthRange,
  type SaleType,
} from '@/lib/marketing-access';
import { postSavingsDeposit, postLoanRepayment } from '@/lib/money-posting';
import type { ActionResult, SessionUser } from '@/types';

const PAYMENT_MODES = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'POS', 'DIRECT_DEBIT'] as const;
type PaymentMode = (typeof PAYMENT_MODES)[number];

/** Loans that have gone out to the customer, and so count as a sale. */
const DISBURSED_LOAN_STATUSES = ['DISBURSED', 'ACTIVE', 'OVERDUE', 'CLOSED'];
/** Loans that can still take a repayment (as postLoanRepayment requires). */
const REPAYABLE_LOAN_STATUSES = ['ACTIVE', 'OVERDUE'];

const num = (v: unknown) => (v == null ? 0 : Number(v));
const fullName = (s?: { firstName: string; lastName: string } | null) => (s ? `${s.firstName} ${s.lastName}` : null);

// ── Access ──────────────────────────────────────────────────────────────────

/**
 * The viewer, read fresh from the database (so a transfer into Marketing or
 * a target switch applies at once): whether they sell, and whether they
 * confirm sales.
 */
async function viewer(): Promise<{ user: SessionUser; seller: boolean; confirmer: boolean; branchId: string | null }> {
  const { user } = await getSession();
  const staff = await prisma.staff.findUnique({
    where: { id: user.id },
    select: { branchId: true, onSalesTarget: true, department: { select: { code: true } } },
  });
  return {
    user,
    seller: staff?.department?.code === MARKETING_DEPARTMENT_CODE || !!staff?.onSalesTarget,
    confirmer: canConfirmSales(user),
    branchId: staff?.branchId ?? null,
  };
}

async function requireConfirmer() {
  const v = await viewer();
  if (!v.confirmer) throw new Error('Only an admin or the accountant can do this');
  return v;
}

async function requireSalesAccess() {
  const v = await viewer();
  if (!v.seller && !v.confirmer) throw new Error('Permission denied');
  return v;
}

/** Everyone who confirms sales (admins and the accountant), for notifications. */
async function confirmerIds(): Promise<string[]> {
  const rows = await prisma.staff.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      OR: [
        { role: { level: { gte: SALE_CONFIRM_ROLE_LEVEL } } },
        { role: { permissions: { some: { permission: { code: { in: ['ADMIN:SYSTEM', ACCOUNTANT_PERMISSION] } } } } } },
      ],
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function getMarketingAccess() {
  const v = await viewer();
  return { canReport: v.seller, canConfirm: v.confirmer, userId: v.user.id };
}

// ── Finding what a sale is for ──────────────────────────────────────────────

/**
 * Customers matching `query` with the accounts a sale can be reported
 * against. A seller posted to a branch searches that branch; a seller with no
 * branch, and anyone who confirms sales, searches every branch. Only what is
 * needed to pick the right record is returned.
 */
export async function findSaleTargets(query: string) {
  const v = await requireSalesAccess();
  const q = (query ?? '').trim();
  if (q.length < 2) return [];
  const like = { contains: q, mode: 'insensitive' as const };

  const customers = await prisma.customer.findMany({
    where: {
      isDeleted: false,
      ...(!v.confirmer && v.branchId && { branchId: v.branchId }),
      OR: [
        { firstName: like }, { lastName: like }, { customerNumber: like }, { phone: { contains: q } },
        { savingsAccounts: { some: { accountNumber: like } } },
        { loans: { some: { loanNumber: like } } },
      ],
    },
    select: {
      id: true, customerNumber: true, firstName: true, lastName: true, phone: true,
      savingsAccounts: {
        where: { isDeleted: false, status: 'ACTIVE' },
        select: { id: true, accountNumber: true, currentBalance: true, product: { select: { name: true } } },
      },
      loans: {
        where: { isDeleted: false, status: { in: DISBURSED_LOAN_STATUSES as any } },
        select: { id: true, loanNumber: true, principalAmount: true, status: true },
      },
      fixedDeposits: {
        select: { id: true, certificateNumber: true, principalAmount: true, status: true },
      },
    },
    take: 10,
    orderBy: { firstName: 'asc' },
  });

  return customers.map((c) => ({
    id: c.id,
    customerNumber: c.customerNumber,
    name: `${c.firstName} ${c.lastName}`,
    phone: c.phone,
    savingsAccounts: c.savingsAccounts.map((a) => ({
      id: a.id, accountNumber: a.accountNumber, product: a.product?.name ?? null, balance: num(a.currentBalance),
    })),
    loans: c.loans.map((l) => ({
      id: l.id, loanNumber: l.loanNumber, principal: num(l.principalAmount), status: l.status,
      repayable: REPAYABLE_LOAN_STATUSES.includes(l.status),
    })),
    fixedDeposits: c.fixedDeposits.map((f) => ({
      id: f.id, certificateNumber: f.certificateNumber, principal: num(f.principalAmount), status: f.status,
    })),
  }));
}

// ── Reporting a sale ────────────────────────────────────────────────────────

export interface ReportSaleInput {
  type: SaleType;
  customerId: string;
  savingsAccountId?: string;
  loanId?: string;
  fixedDepositId?: string;
  amount: number;
  paymentMode?: string;
  paymentReference?: string;
  collectedAt?: string;
  notes?: string;
  /** Record a company (direct) sale, credited to no one. Admins and the accountant only. */
  company?: boolean;
}

export async function reportSale(data: ReportSaleInput): Promise<ActionResult<{ id: string; reference: string }>> {
  try {
    const v = await viewer();
    const { user } = v;
    const company = !!data.company;
    if (company && !v.confirmer) return { success: false, error: 'Only an admin or the accountant can record a company sale' };
    if (!company && !v.seller) return { success: false, error: 'Only Marketing staff and staff on sales targets can report sales' };

    if (!(data.type in SALE_TYPE_LABELS)) return { success: false, error: 'Unknown sale type' };
    const linkError = validateSaleLinks(data.type, data);
    if (linkError) return { success: false, error: linkError };
    if (!Number.isFinite(data.amount) || data.amount <= 0) return { success: false, error: 'Enter an amount greater than zero' };
    const paymentMode = (data.paymentMode ?? 'CASH') as PaymentMode;
    if (!PAYMENT_MODES.includes(paymentMode)) return { success: false, error: 'Unknown payment method' };
    const collectedAt = data.collectedAt ? new Date(data.collectedAt) : new Date();
    if (Number.isNaN(collectedAt.getTime()) || collectedAt.getTime() > Date.now() + 60_000) {
      return { success: false, error: 'The sale date cannot be in the future' };
    }

    const customer = await prisma.customer.findUnique({ where: { id: data.customerId }, select: { branchId: true } });
    if (!customer) return { success: false, error: 'Customer not found' };

    // The linked record must exist and belong to the customer named.
    if (data.savingsAccountId) {
      const a = await prisma.savingsAccount.findUnique({ where: { id: data.savingsAccountId }, select: { customerId: true, status: true } });
      if (!a || a.customerId !== data.customerId) return { success: false, error: 'That savings account does not belong to this customer' };
      if (a.status !== 'ACTIVE') return { success: false, error: 'That savings account is not active' };
    }
    if (data.loanId) {
      const l = await prisma.loan.findUnique({ where: { id: data.loanId }, select: { customerId: true, status: true } });
      if (!l || l.customerId !== data.customerId) return { success: false, error: 'That loan does not belong to this customer' };
      const allowed = data.type === 'FIELD_COLLECTION' ? REPAYABLE_LOAN_STATUSES : DISBURSED_LOAN_STATUSES;
      if (!allowed.includes(l.status)) {
        return { success: false, error: data.type === 'FIELD_COLLECTION' ? 'That loan cannot take a repayment' : 'That loan has not been disbursed yet' };
      }
    }
    if (data.fixedDepositId) {
      const f = await prisma.fixedDeposit.findUnique({ where: { id: data.fixedDepositId }, select: { customerId: true } });
      if (!f || f.customerId !== data.customerId) return { success: false, error: 'That fixed deposit does not belong to this customer' };
    }

    // A record is credited once: to one seller, or to the company. Collections repeat.
    if (data.type !== 'FIELD_COLLECTION') {
      const claimed = await prisma.marketingSale.findFirst({
        where: {
          type: data.type,
          status: { not: 'REJECTED' },
          savingsAccountId: data.savingsAccountId ?? undefined,
          loanId: data.loanId ?? undefined,
          fixedDepositId: data.fixedDepositId ?? undefined,
        },
        select: { reference: true },
      });
      if (claimed) return { success: false, error: `This has already been reported (${claimed.reference})` };
    }

    const reference = await generateReference('MARKETING_SALE');
    const sale = await prisma.marketingSale.create({
      data: {
        reference,
        type: data.type,
        marketerId: company ? null : user.id,
        reportedById: user.id,
        // A staff sale belongs to the seller's branch; a company sale to the customer's.
        branchId: company ? customer.branchId : v.branchId,
        customerId: data.customerId,
        savingsAccountId: data.savingsAccountId || null,
        loanId: data.loanId || null,
        fixedDepositId: data.fixedDepositId || null,
        amount: data.amount,
        paymentMode,
        paymentReference: data.paymentReference?.trim() || null,
        collectedAt,
        notes: data.notes?.trim() || null,
      },
    });

    const label = SALE_TYPE_LABELS[data.type].toLowerCase();
    await auditLog({
      userId: user.id, action: 'CREATE', module: 'MARKETING', entityType: 'MARKETING_SALE', entityId: sale.id,
      description: `${company ? 'Recorded company sale' : 'Reported'} ${label} ${reference}: ${data.amount}`,
      newValues: { type: data.type, amount: data.amount, customerId: data.customerId, company },
    });

    const recipients = (await confirmerIds()).filter((id) => id !== user.id);
    await createNotificationForUsers(recipients, {
      type: 'APPROVAL_REQUIRED',
      title: company ? 'Company sale awaiting confirmation' : 'Sale awaiting confirmation',
      message: company
        ? `${user.firstName} ${user.lastName} recorded a company (direct) ${label} ${reference} for ${data.amount}.`
        : `${user.firstName} ${user.lastName} reported ${label} ${reference} for ${data.amount}.`,
      entityType: 'MARKETING_SALE',
      entityId: sale.id,
      actionUrl: '/marketing',
    });

    return { success: true, message: `Sale ${reference} sent for confirmation`, data: { id: sale.id, reference } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ── Listing ─────────────────────────────────────────────────────────────────

const saleInclude = {
  marketer: { select: { firstName: true, lastName: true, employeeId: true } },
  reportedBy: { select: { firstName: true, lastName: true } },
  reviewedBy: { select: { firstName: true, lastName: true } },
  branch: { select: { name: true } },
  customer: { select: { firstName: true, lastName: true, customerNumber: true } },
  savingsAccount: { select: { id: true, accountNumber: true } },
  loan: { select: { id: true, loanNumber: true, principalAmount: true } },
  fixedDeposit: { select: { id: true, certificateNumber: true, principalAmount: true } },
} as const;

function shapeSale(s: any) {
  const target = s.savingsAccount
    ? { kind: 'SAVINGS', label: s.savingsAccount.accountNumber, href: `/savings/${s.savingsAccount.id}` }
    : s.loan
      ? { kind: 'LOAN', label: s.loan.loanNumber, href: `/loans/${s.loan.id}` }
      : s.fixedDeposit
        ? { kind: 'FIXED_DEPOSIT', label: s.fixedDeposit.certificateNumber, href: `/fixed-deposits/${s.fixedDeposit.id}` }
        : null;
  const isCompany = !s.marketerId;
  return {
    id: s.id as string,
    reference: s.reference as string,
    type: s.type as SaleType,
    status: s.status as string,
    isCompany,
    marketerId: (s.marketerId as string | null) ?? null,
    marketer: isCompany ? COMPANY_SALE_LABEL : fullName(s.marketer),
    marketerEmployeeId: s.marketer?.employeeId ?? null,
    reportedById: s.reportedById as string,
    reportedBy: fullName(s.reportedBy),
    branch: s.branch?.name ?? null,
    customer: fullName(s.customer),
    customerNumber: s.customer?.customerNumber ?? null,
    target,
    amount: num(s.amount),
    paymentMode: s.paymentMode as string,
    paymentReference: s.paymentReference as string | null,
    collectedAt: (s.collectedAt as Date).toISOString(),
    notes: s.notes as string | null,
    reviewedBy: fullName(s.reviewedBy),
    reviewedAt: s.reviewedAt ? (s.reviewedAt as Date).toISOString() : null,
    reviewNote: s.reviewNote as string | null,
    postedReference: s.postedReference as string | null,
    commissionRate: s.commissionRate == null ? null : num(s.commissionRate),
    commissionAmount: s.commissionAmount == null ? null : num(s.commissionAmount),
    commissionPaidAt: s.commissionPaidAt ? (s.commissionPaidAt as Date).toISOString() : null,
    createdAt: (s.createdAt as Date).toISOString(),
  };
}

export type MarketingSaleRow = ReturnType<typeof shapeSale>;

export interface SaleFilters {
  status?: string;
  type?: string;
  marketerId?: string;
  /** Company (direct) sales only, or staff sales only. */
  channel?: 'COMPANY' | 'STAFF';
  month?: string;
  search?: string;
  /** Confirmed staff sales whose commission is still owed, or already paid. */
  commission?: 'UNPAID' | 'PAID';
  page?: number;
  limit?: number;
}

/**
 * Sales, newest first. A seller sees only their own; a confirmer sees every
 * sale, company sales included, and can filter by seller or channel.
 */
export async function getSales(filters: SaleFilters = {}) {
  const v = await requireSalesAccess();
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, filters.limit || 25);

  const where: Record<string, unknown> = {};
  if (!v.confirmer) where.marketerId = v.user.id;
  else if (filters.marketerId) where.marketerId = filters.marketerId;
  else if (filters.channel === 'COMPANY') where.marketerId = null;
  else if (filters.channel === 'STAFF') where.marketerId = { not: null };
  if (filters.status) where.status = filters.status;
  if (filters.type) where.type = filters.type;
  if (filters.commission) {
    where.status = 'CONFIRMED';
    where.commissionAmount = { gt: 0 };
    where.commissionPaidAt = filters.commission === 'UNPAID' ? null : { not: null };
  }
  if (filters.month) {
    const { from, to } = monthRange(filters.month);
    where.collectedAt = { gte: from, lt: to };
  }
  if (filters.search?.trim()) {
    const like = { contains: filters.search.trim(), mode: 'insensitive' };
    where.OR = [
      { reference: like },
      { customer: { firstName: like } },
      { customer: { lastName: like } },
      { marketer: { firstName: like } },
      { marketer: { lastName: like } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.marketingSale.findMany({
      where: where as any,
      include: saleInclude,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.marketingSale.count({ where: where as any }),
  ]);

  return {
    data: rows.map(shapeSale),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// ── Confirming ──────────────────────────────────────────────────────────────

/** Nobody reviews a sale they reported or are credited with. */
const isOwnSale = (sale: { marketerId: string | null; reportedById: string }, userId: string) =>
  sale.marketerId === userId || sale.reportedById === userId;

export async function confirmSale(id: string, note?: string): Promise<ActionResult> {
  try {
    const { user } = await requireConfirmer();

    const sale = await prisma.marketingSale.findUnique({
      where: { id },
      include: {
        loan: { select: { principalAmount: true, status: true } },
        fixedDeposit: { select: { principalAmount: true } },
        savingsAccount: { select: { status: true } },
      },
    });
    if (!sale) return { success: false, error: 'Sale not found' };
    if (isOwnSale(sale, user.id)) return { success: false, error: 'You cannot confirm a sale you reported or are credited with' };
    if (sale.status !== 'PENDING') return { success: false, error: `This sale is already ${sale.status.toLowerCase()}` };

    // Claim the sale before any money moves, so two confirmers acting at once
    // cannot post it twice.
    const claimed = await prisma.marketingSale.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'CONFIRMING', reviewedById: user.id },
    });
    if (claimed.count !== 1) return { success: false, error: 'Someone else is already reviewing this sale' };

    const release = () =>
      prisma.marketingSale.update({ where: { id }, data: { status: 'PENDING', reviewedById: null } });

    const amount = num(sale.amount);
    let postedReference: string | null = null;

    if (sale.type === 'FIELD_COLLECTION') {
      // Posted in the confirmer's name through the same core the teller
      // screens use. The confirmer is authorised by canConfirmSales, not by
      // teller permissions: an accountant confirms without holding a till.
      const narration = `Field collection ${sale.reference}`;
      const posted = sale.savingsAccountId
        ? await postSavingsDeposit(user, {
            accountId: sale.savingsAccountId,
            amount,
            paymentMode: sale.paymentMode,
            paymentReference: sale.paymentReference ?? sale.reference,
            narration,
          })
        : await postLoanRepayment(user, {
            loanId: sale.loanId!,
            amount,
            paymentMode: sale.paymentMode,
            paymentReference: sale.paymentReference ?? sale.reference,
            notes: narration,
          });
      if (!posted.success) {
        await release();
        return { success: false, error: `Could not post the payment: ${posted.error}` };
      }
      const d = posted.data as { transactionRef?: string; receiptNumber?: string } | undefined;
      postedReference = d?.transactionRef ?? d?.receiptNumber ?? null;
    } else if (sale.type === 'LOAN' && !DISBURSED_LOAN_STATUSES.includes(sale.loan?.status ?? '')) {
      await release();
      return { success: false, error: 'That loan has not been disbursed; confirm the sale once it has' };
    }

    // Commission: staff sales only. On the amount reported, except loans and
    // fixed deposits, where it is on the principal actually booked.
    let rate: number | null = null;
    let commission: number | null = null;
    if (sale.marketerId) {
      const base =
        sale.type === 'LOAN' ? num(sale.loan?.principalAmount)
          : sale.type === 'FIXED_DEPOSIT' ? num(sale.fixedDeposit?.principalAmount)
            : amount;
      rate = await getConfigNumber(COMMISSION_CONFIG_KEY[sale.type as SaleType]);
      commission = commissionFor(base, rate);
    }

    await prisma.marketingSale.update({
      where: { id },
      data: {
        status: 'CONFIRMED',
        reviewedById: user.id,
        reviewedAt: new Date(),
        reviewNote: note?.trim() || null,
        postedReference,
        commissionRate: rate,
        commissionAmount: commission,
      },
    });

    await auditLog({
      userId: user.id, action: 'APPROVE', module: 'MARKETING', entityType: 'MARKETING_SALE', entityId: id,
      description: `Confirmed ${sale.marketerId ? '' : 'company sale '}${sale.reference}${postedReference ? `, posted ${postedReference}` : ''}${commission != null ? `; commission ${commission} at ${rate}%` : ''}`,
    });
    const notify = sale.marketerId ?? sale.reportedById;
    if (notify !== user.id) {
      await createNotification({
        userId: notify,
        type: 'INFO',
        title: 'Sale confirmed',
        message: `${sale.reference} was confirmed.${commission != null ? ` Commission earned: ${commission}.` : ''}`,
        entityType: 'MARKETING_SALE',
        entityId: id,
        actionUrl: '/marketing',
      });
    }

    return {
      success: true,
      message: `${sale.reference} confirmed${postedReference ? ` and posted (${postedReference})` : ''}`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function rejectSale(id: string, reason: string): Promise<ActionResult> {
  try {
    const { user } = await requireConfirmer();
    if (!reason?.trim()) return { success: false, error: 'Give a reason for rejecting the sale' };

    const sale = await prisma.marketingSale.findUnique({
      where: { id },
      select: { reference: true, marketerId: true, reportedById: true },
    });
    if (!sale) return { success: false, error: 'Sale not found' };
    if (isOwnSale(sale, user.id)) return { success: false, error: 'You cannot review a sale you reported or are credited with' };

    const updated = await prisma.marketingSale.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'REJECTED', reviewedById: user.id, reviewedAt: new Date(), reviewNote: reason.trim() },
    });
    if (updated.count !== 1) return { success: false, error: 'This sale is no longer pending' };

    await auditLog({
      userId: user.id, action: 'REJECT', module: 'MARKETING', entityType: 'MARKETING_SALE', entityId: id,
      description: `Rejected ${sale.reference}: ${reason.trim()}`,
    });
    await createNotification({
      userId: sale.marketerId ?? sale.reportedById,
      type: 'WARNING',
      title: 'Sale rejected',
      message: `${sale.reference} was rejected: ${reason.trim()}`,
      entityType: 'MARKETING_SALE',
      entityId: id,
      actionUrl: '/marketing',
    });

    return { success: true, message: `${sale.reference} rejected` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ── Commission ──────────────────────────────────────────────────────────────

/** Record that commission on these confirmed staff sales has been paid. */
export async function markCommissionPaid(saleIds: string[]): Promise<ActionResult<{ count: number }>> {
  try {
    const { user } = await requireConfirmer();
    const ids = Array.from(new Set(saleIds));
    if (ids.length === 0) return { success: false, error: 'Select at least one sale' };

    const result = await prisma.marketingSale.updateMany({
      where: {
        id: { in: ids }, status: 'CONFIRMED', commissionPaidAt: null,
        AND: [{ marketerId: { not: null } }, { marketerId: { not: user.id } }],
      },
      data: { commissionPaidAt: new Date(), commissionPaidById: user.id },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'MARKETING', entityType: 'MARKETING_SALE',
      description: `Marked commission paid on ${result.count} sale(s)`,
    });
    return { success: true, message: `Commission marked paid on ${result.count} sale(s)`, data: { count: result.count } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ── Target engine ───────────────────────────────────────────────────────────

/** Everyone currently on the sales target engine. */
async function onTargetStaff() {
  return prisma.staff.findMany({
    where: { isDeleted: false, status: { not: 'TERMINATED' }, onSalesTarget: true },
    select: {
      id: true, firstName: true, lastName: true, employeeId: true,
      branch: { select: { name: true } }, department: { select: { name: true } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

/**
 * Every active staff member with their target switch, for the Targets tab.
 * Admins and the accountant only.
 */
export async function getTargetRoster(search?: string) {
  await requireConfirmer();
  const q = search?.trim();
  const like = q ? { contains: q, mode: 'insensitive' as const } : undefined;
  const staff = await prisma.staff.findMany({
    where: {
      isDeleted: false,
      status: { not: 'TERMINATED' },
      ...(like && { OR: [{ firstName: like }, { lastName: like }, { employeeId: like }] }),
    },
    select: {
      id: true, firstName: true, lastName: true, employeeId: true, onSalesTarget: true,
      branch: { select: { name: true } }, department: { select: { name: true, code: true } },
      role: { select: { name: true } },
    },
    orderBy: [{ onSalesTarget: 'desc' }, { firstName: 'asc' }, { lastName: 'asc' }],
  });
  return staff.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    employeeId: s.employeeId,
    branch: s.branch?.name ?? null,
    department: s.department?.name ?? null,
    isMarketing: s.department?.code === MARKETING_DEPARTMENT_CODE,
    role: s.role?.name ?? null,
    onSalesTarget: s.onSalesTarget,
  }));
}

/** Switch a staff member onto or off the sales target engine. */
export async function setSalesTargetEnabled(staffId: string, enabled: boolean): Promise<ActionResult> {
  try {
    const { user } = await requireConfirmer();
    const staff = await prisma.staff.findFirst({
      where: { id: staffId, isDeleted: false },
      select: { firstName: true, lastName: true, onSalesTarget: true },
    });
    if (!staff) return { success: false, error: 'Staff member not found' };
    if (staff.onSalesTarget === enabled) return { success: true, message: 'No change' };

    await prisma.staff.update({ where: { id: staffId }, data: { onSalesTarget: enabled } });
    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'MARKETING', entityType: 'STAFF', entityId: staffId,
      description: `${enabled ? 'Put' : 'Took'} ${staff.firstName} ${staff.lastName} ${enabled ? 'on' : 'off'} sales targets`,
      oldValues: { onSalesTarget: staff.onSalesTarget },
      newValues: { onSalesTarget: enabled },
    });
    if (enabled && staffId !== user.id) {
      await createNotification({
        userId: staffId,
        type: 'INFO',
        title: 'You are on sales targets',
        message: 'You can now report the sales you bring in from the Sales page. Sign out and back in if you do not see it yet.',
        actionUrl: '/marketing',
      });
    }
    return { success: true, message: `${staff.firstName} ${staff.lastName} is ${enabled ? 'now on' : 'no longer on'} sales targets` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function setTarget(data: {
  marketerId: string;
  month: string;
  targetAmount: number;
  targetCount?: number | null;
}): Promise<ActionResult> {
  try {
    const { user } = await requireConfirmer();
    monthRange(data.month); // validates YYYY-MM
    if (!Number.isFinite(data.targetAmount) || data.targetAmount < 0) return { success: false, error: 'Enter a target amount of zero or more' };
    if (data.targetCount != null && (!Number.isInteger(data.targetCount) || data.targetCount < 0)) {
      return { success: false, error: 'The target number of sales must be a whole number' };
    }

    const staff = await prisma.staff.findFirst({
      where: { id: data.marketerId, isDeleted: false, onSalesTarget: true },
      select: { firstName: true, lastName: true },
    });
    if (!staff) return { success: false, error: 'Switch this person on to sales targets first' };

    await prisma.marketingTarget.upsert({
      where: { marketerId_month: { marketerId: data.marketerId, month: data.month } },
      create: {
        marketerId: data.marketerId, month: data.month, targetAmount: data.targetAmount,
        targetCount: data.targetCount ?? null, setById: user.id,
      },
      update: { targetAmount: data.targetAmount, targetCount: data.targetCount ?? null, setById: user.id },
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'MARKETING', entityType: 'MARKETING_TARGET', entityId: data.marketerId,
      description: `Set ${data.month} target for ${staff.firstName} ${staff.lastName}: ${data.targetAmount}${data.targetCount != null ? ` / ${data.targetCount} sales` : ''}`,
    });
    return { success: true, message: 'Target saved' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Everyone on sales targets, ranked by confirmed sales in `month` (default:
 * this month), with their target, progress, pending sales and commission.
 * Company (direct) sales are credited to no one, so they are not ranked.
 */
export async function getLeaderboard(month?: string) {
  const v = await requireSalesAccess();
  const key = month || monthKey(new Date());
  const { from, to } = monthRange(key);

  const [people, confirmed, pending, targets] = await Promise.all([
    onTargetStaff(),
    prisma.marketingSale.groupBy({
      by: ['marketerId'],
      where: { status: 'CONFIRMED', marketerId: { not: null }, collectedAt: { gte: from, lt: to } },
      _sum: { amount: true, commissionAmount: true },
      _count: true,
    }),
    prisma.marketingSale.groupBy({
      by: ['marketerId'],
      where: { status: { in: ['PENDING', 'CONFIRMING'] }, marketerId: { not: null }, collectedAt: { gte: from, lt: to } },
      _count: true,
    }),
    prisma.marketingTarget.findMany({ where: { month: key } }),
  ]);

  const byConfirmed = new Map(confirmed.map((c) => [c.marketerId, c]));
  const byPending = new Map(pending.map((p) => [p.marketerId, p._count]));
  const byTarget = new Map(targets.map((t) => [t.marketerId, t]));

  const rows = people
    .map((m) => {
      const c = byConfirmed.get(m.id);
      const t = byTarget.get(m.id);
      const amount = num(c?._sum.amount);
      const targetAmount = t ? num(t.targetAmount) : null;
      return {
        marketerId: m.id,
        name: `${m.firstName} ${m.lastName}`,
        employeeId: m.employeeId,
        branch: m.branch?.name ?? null,
        department: m.department?.name ?? null,
        confirmedAmount: amount,
        confirmedCount: c?._count ?? 0,
        pendingCount: byPending.get(m.id) ?? 0,
        // Commission is personal: a seller sees only their own.
        commission: v.confirmer || m.id === v.user.id ? num(c?._sum.commissionAmount) : null,
        targetAmount,
        targetCount: t?.targetCount ?? null,
        progress: targetAmount && targetAmount > 0 ? Math.min(100, Math.round((amount / targetAmount) * 100)) : null,
      };
    })
    .sort((a, b) => b.confirmedAmount - a.confirmedAmount || b.confirmedCount - a.confirmedCount || a.name.localeCompare(b.name))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return { month: key, rows };
}

/**
 * Totals for the summary strip: for a seller, their own month; for a
 * confirmer, the queue and the company's month (company sales included).
 */
export async function getMarketingSummary(month?: string) {
  const v = await requireSalesAccess();
  const key = month || monthKey(new Date());
  const { from, to } = monthRange(key);
  const mine = v.confirmer ? {} : { marketerId: v.user.id };

  const [pending, confirmed, unpaid, target] = await Promise.all([
    prisma.marketingSale.aggregate({ where: { ...mine, status: 'PENDING' }, _count: true, _sum: { amount: true } }),
    prisma.marketingSale.aggregate({
      where: { ...mine, status: 'CONFIRMED', collectedAt: { gte: from, lt: to } },
      _count: true,
      _sum: { amount: true, commissionAmount: true },
    }),
    prisma.marketingSale.aggregate({ where: { ...mine, status: 'CONFIRMED', commissionPaidAt: null }, _sum: { commissionAmount: true } }),
    v.confirmer ? null : prisma.marketingTarget.findUnique({ where: { marketerId_month: { marketerId: v.user.id, month: key } } }),
  ]);

  return {
    month: key,
    pendingCount: pending._count,
    pendingAmount: num(pending._sum.amount),
    confirmedCount: confirmed._count,
    confirmedAmount: num(confirmed._sum.amount),
    commissionThisMonth: num(confirmed._sum.commissionAmount),
    commissionUnpaid: num(unpaid._sum.commissionAmount),
    targetAmount: target ? num(target.targetAmount) : null,
    targetCount: target?.targetCount ?? null,
  };
}

// ── Reporting ───────────────────────────────────────────────────────────────

/** Every YYYY-MM from `from` to `to` inclusive (at most three years). */
function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let { from: cursor } = monthRange(from);
  const { from: last } = monthRange(to);
  while (cursor <= last && out.length < 36) {
    out.push(monthKey(cursor));
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return out;
}

/**
 * Confirmed sales between two months (inclusive), by month, channel (staff or
 * company), type, branch and seller. A confirmer sees the whole company; a
 * seller sees their own. Rows carry every confirmed sale, for export.
 */
export async function getSalesReport(fromMonth: string, toMonth: string) {
  const v = await requireSalesAccess();
  if (fromMonth > toMonth) [fromMonth, toMonth] = [toMonth, fromMonth];
  const months = monthsBetween(fromMonth, toMonth);
  const { from } = monthRange(months[0]);
  const { to } = monthRange(months[months.length - 1]);
  const mine = v.confirmer ? {} : { marketerId: v.user.id };

  const [sales, pending, rejected] = await Promise.all([
    prisma.marketingSale.findMany({
      where: { ...mine, status: 'CONFIRMED', collectedAt: { gte: from, lt: to } },
      include: saleInclude,
      orderBy: { collectedAt: 'asc' },
      take: 5000,
    }),
    prisma.marketingSale.count({ where: { ...mine, status: { in: ['PENDING', 'CONFIRMING'] }, collectedAt: { gte: from, lt: to } } }),
    prisma.marketingSale.count({ where: { ...mine, status: 'REJECTED', collectedAt: { gte: from, lt: to } } }),
  ]);
  const rows = sales.map(shapeSale);

  type Bucket = { amount: number; count: number; commission: number };
  const empty = (): Bucket => ({ amount: 0, count: 0, commission: 0 });
  const add = (map: Map<string, Bucket>, key: string, r: MarketingSaleRow) => {
    const b = map.get(key) ?? empty();
    b.amount += r.amount;
    b.count += 1;
    b.commission += r.commissionAmount ?? 0;
    map.set(key, b);
  };

  const byMonth = new Map<string, Bucket>(months.map((m) => [m, empty()]));
  const byChannel = new Map<string, Bucket>();
  const byType = new Map<string, Bucket>();
  const byBranch = new Map<string, Bucket>();
  const bySeller = new Map<string, Bucket & { name: string }>();
  for (const r of rows) {
    add(byMonth, monthKey(new Date(r.collectedAt)), r);
    add(byChannel, r.isCompany ? COMPANY_SALE_LABEL : 'Staff sales', r);
    add(byType, r.type, r);
    add(byBranch, r.branch ?? 'Head office', r);
    const key = r.marketerId ?? 'company';
    const s = bySeller.get(key) ?? { name: r.marketer ?? '', ...empty() };
    s.amount += r.amount;
    s.count += 1;
    s.commission += r.commissionAmount ?? 0;
    bySeller.set(key, s);
  }

  const sorted = <T extends { amount: number }>(xs: T[]) => xs.sort((a, b) => b.amount - a.amount);
  const round = (n: number) => Math.round(n * 100) / 100;
  const totals = rows.reduce(
    (t, r) => ({
      amount: t.amount + r.amount,
      count: t.count + 1,
      commission: t.commission + (r.commissionAmount ?? 0),
      companyAmount: t.companyAmount + (r.isCompany ? r.amount : 0),
    }),
    { amount: 0, count: 0, commission: 0, companyAmount: 0 }
  );

  return {
    scope: v.confirmer ? ('company' as const) : ('mine' as const),
    fromMonth: months[0],
    toMonth: months[months.length - 1],
    totals: {
      amount: round(totals.amount), count: totals.count, commission: round(totals.commission),
      companyAmount: round(totals.companyAmount), pending, rejected,
    },
    byMonth: months.map((m) => {
      const b = byMonth.get(m)!;
      const d = monthRange(m).from;
      return { month: m, label: d.toLocaleDateString('en-NG', { month: 'short', year: '2-digit' }), amount: round(b.amount), count: b.count, commission: round(b.commission) };
    }),
    byChannel: sorted(Array.from(byChannel, ([channel, b]) => ({ channel, ...b }))),
    byType: sorted(Array.from(byType, ([type, b]) => ({ type: type as SaleType, label: SALE_TYPE_LABELS[type as SaleType], ...b }))),
    byBranch: sorted(Array.from(byBranch, ([branch, b]) => ({ branch, ...b }))),
    byMarketer: sorted(Array.from(bySeller.values())),
    rows,
    truncated: sales.length === 5000,
  };
}
