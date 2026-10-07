/**
 * Personal form links and the sales they earn.
 *
 * Any staff member can share any open customer application form with their
 * own link, /f/<slug>?by=<employee id>. The customer fills the one official
 * form; the application still goes to that product's officers; it simply
 * records who referred it (FormResponse.referredById).
 *
 * When what was applied for becomes real, a sale is recorded in the
 * referrer's name in the Sales module (MarketingSale), pending confirmation
 * by an admin or the accountant like any other sale, and earning commission
 * at the configured rate once confirmed:
 *   - a savings plan or partnership: when the account is opened from the application;
 *   - a fixed deposit: when it is opened from the application;
 *   - a loan: when it is paid out, as a loan only counts as a sale then.
 * Only sellers earn commission (Marketing staff and staff on sales targets,
 * lib/marketing-access); anyone else is still shown as the referrer.
 *
 * Server-only and NOT a server action: callers have already authorised the
 * officer who opened the account or paid out the loan.
 */
import { prisma } from '@/lib/prisma';
import { auditLog } from '@/lib/audit';
import { createNotification, createNotificationForUsers } from '@/lib/notifications';
import { generateReference } from '@/lib/utils';
import {
  ACCOUNTANT_PERMISSION, MARKETING_DEPARTMENT_CODE, SALE_CONFIRM_ROLE_LEVEL, SALE_TYPE_LABELS, type SaleType,
} from '@/lib/marketing-access';

/** A staff member's referral code: their employee id, as it appears on their link. */
export function normalizeReferralCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9-]{2,30}$/.test(code) ? code : null;
}

/** Whether a staff member earns commission on what they bring in. */
export function isSeller(s: { onSalesTarget: boolean; department: { code: string } | null }): boolean {
  return s.onSalesTarget || s.department?.code === MARKETING_DEPARTMENT_CODE;
}

/** The active staff member a link's code belongs to, or null. */
export async function findReferrer(code: unknown) {
  const employeeId = normalizeReferralCode(code);
  if (!employeeId) return null;
  return prisma.staff.findFirst({
    where: { employeeId: { equals: employeeId, mode: 'insensitive' }, status: 'ACTIVE', isDeleted: false },
    select: { id: true, firstName: true, lastName: true, employeeId: true },
  });
}

async function saleConfirmerIds(): Promise<string[]> {
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

export interface ReferralSaleInput {
  responseId: string;
  type: Exclude<SaleType, 'FIELD_COLLECTION'>;
  customerId: string;
  link: { loanId?: string; savingsAccountId?: string; fixedDepositId?: string };
  amount: number;
  /** The officer who opened the account or paid out the loan. */
  recordedById: string;
}

/**
 * Records the sale an application's referrer earned, once. Returns its
 * reference, or null when there is nothing to record: no referrer, the
 * referrer does not sell, or the record is already credited to someone.
 */
export async function recordReferralSale(input: ReferralSaleInput): Promise<string | null> {
  const response = await prisma.formResponse.findUnique({
    where: { id: input.responseId },
    select: {
      reference: true,
      referredBy: {
        select: {
          id: true, firstName: true, lastName: true, branchId: true, status: true, isDeleted: true, onSalesTarget: true,
          department: { select: { code: true } },
        },
      },
    },
  });
  const referrer = response?.referredBy;
  if (!referrer || referrer.isDeleted || referrer.status !== 'ACTIVE' || !isSeller(referrer)) return null;
  if (!(input.amount > 0)) return null;

  // A record is credited once, to one seller or the company.
  const claimed = await prisma.marketingSale.findFirst({
    where: {
      type: input.type,
      status: { not: 'REJECTED' },
      ...(input.link.loanId ? { loanId: input.link.loanId } : {}),
      ...(input.link.savingsAccountId ? { savingsAccountId: input.link.savingsAccountId } : {}),
      ...(input.link.fixedDepositId ? { fixedDepositId: input.link.fixedDepositId } : {}),
    },
    select: { id: true },
  });
  if (claimed) return null;

  const reference = await generateReference('MARKETING_SALE');
  const sale = await prisma.marketingSale.create({
    data: {
      reference,
      type: input.type,
      marketerId: referrer.id,
      reportedById: input.recordedById,
      branchId: referrer.branchId,
      customerId: input.customerId,
      loanId: input.link.loanId ?? null,
      savingsAccountId: input.link.savingsAccountId ?? null,
      fixedDepositId: input.link.fixedDepositId ?? null,
      amount: input.amount,
      notes: `Referred by personal link: application ${response!.reference ?? ''}`.trim(),
    },
  });

  const label = SALE_TYPE_LABELS[input.type].toLowerCase();
  const name = `${referrer.firstName} ${referrer.lastName}`;
  await auditLog({
    userId: input.recordedById, action: 'CREATE', module: 'MARKETING', entityType: 'MARKETING_SALE', entityId: sale.id,
    description: `Recorded ${label} ${reference} for ${name}, referred by their link (application ${response!.reference})`,
  });
  await createNotificationForUsers((await saleConfirmerIds()).filter((id) => id !== referrer.id), {
    type: 'APPROVAL_REQUIRED',
    title: 'Sale awaiting confirmation',
    message: `${name} referred ${label} ${reference} for ${input.amount} through their form link.`,
    entityType: 'MARKETING_SALE',
    entityId: sale.id,
    actionUrl: '/marketing',
  });
  await createNotification({
    userId: referrer.id,
    type: 'TASK_ASSIGNED',
    title: 'Your referral became a sale',
    message: `Application ${response!.reference} became ${label} ${reference}. It is waiting for confirmation, then your commission is recorded.`,
    entityType: 'MARKETING_SALE',
    entityId: sale.id,
    actionUrl: '/marketing',
  });
  return reference;
}

/**
 * Links an approved application to the savings account or fixed deposit
 * opened from it, claiming it so it opens only one, then records its
 * referrer's sale. Returns an error message, or null.
 */
export async function linkOpenedAccount(input: {
  applicationId: string;
  customerId: string;
  kind: 'SAVINGS' | 'FIXED_DEPOSIT';
  accountId: string;
  amount: number;
  recordedById: string;
}): Promise<string | null> {
  const app = await prisma.formResponse.findUnique({
    where: { id: String(input.applicationId).slice(0, 64) },
    select: { id: true, customerId: true, onboardingStatus: true, savingsAccountId: true, fixedDepositId: true, form: { select: { purpose: true } } },
  });
  const purposes = input.kind === 'SAVINGS' ? ['SAVINGS_APPLICATION', 'PARTNERSHIP_APPLICATION'] : ['FIXED_DEPOSIT_APPLICATION'];
  if (!app || !purposes.includes(app.form.purpose) || app.onboardingStatus !== 'APPROVED' || app.customerId !== input.customerId) {
    return 'That application does not match this customer';
  }
  const field = input.kind === 'SAVINGS' ? 'savingsAccountId' : 'fixedDepositId';
  const claimed = await prisma.formResponse.updateMany({
    where: { id: app.id, [field]: null },
    data: { [field]: input.accountId },
  });
  if (claimed.count === 0) return 'An account was already opened from that application';
  // The account is open by now: a failed sale is logged, not reported as a failed opening.
  try {
    await recordReferralSale({
      responseId: app.id,
      type: input.kind,
      customerId: input.customerId,
      link: input.kind === 'SAVINGS' ? { savingsAccountId: input.accountId } : { fixedDepositId: input.accountId },
      amount: input.amount,
      recordedById: input.recordedById,
    });
  } catch (error) {
    console.error(`Referral sale for application ${app.id} not recorded:`, error);
  }
  return null;
}

/**
 * Checks, before an account is opened, that it may be opened from this
 * application: approved, the same customer, the right kind, and nothing
 * opened from it yet. Returns an error message, or null.
 */
export async function openingApplicationProblem(applicationId: string, customerId: string, kind: 'SAVINGS' | 'FIXED_DEPOSIT'): Promise<string | null> {
  const app = await prisma.formResponse.findUnique({
    where: { id: String(applicationId).slice(0, 64) },
    select: { customerId: true, onboardingStatus: true, savingsAccountId: true, fixedDepositId: true, reference: true, form: { select: { purpose: true } } },
  });
  const purposes = kind === 'SAVINGS' ? ['SAVINGS_APPLICATION', 'PARTNERSHIP_APPLICATION'] : ['FIXED_DEPOSIT_APPLICATION'];
  if (!app || !purposes.includes(app.form.purpose) || app.onboardingStatus !== 'APPROVED') return 'Application not found or not approved';
  if (app.customerId !== customerId) return 'This account is not for the applicant on that application';
  if ((kind === 'SAVINGS' ? app.savingsAccountId : app.fixedDepositId) != null) {
    return `An account was already opened from application ${app.reference}`;
  }
  return null;
}
