/**
 * Marketing — who reports sales, who confirms them, and what commission a
 * confirmed sale earns.
 *
 *  - Sellers are the staff in the MARKETING department and anyone switched on
 *    to the sales target engine (Staff.onSalesTarget). Admins and the
 *    accountant can also record a company (direct) sale, credited to no one.
 *  - Sales are confirmed by an admin or the accountant, whichever gets there
 *    first: the superuser (ADMIN:SYSTEM), any role at level 85 and above
 *    (General Manager 85, Director 90, Super Administrator 100), or the
 *    head-office accountant (ACCOUNTS:JOURNAL_POST). All of them are notified
 *    of every reported sale.
 *  - Nobody confirms their own sale.
 *
 * Pure rules live here so they can be tested without a database.
 */
import type { SessionUser } from '@/types';

export const MARKETING_DEPARTMENT_CODE = 'MARKETING';

/** Role level at and above which a role confirms marketing sales. */
export const SALE_CONFIRM_ROLE_LEVEL = 85;

/** The accountant's permission; its holders confirm sales alongside admins. */
export const ACCOUNTANT_PERMISSION = 'ACCOUNTS:JOURNAL_POST';

export type SaleType = 'SAVINGS' | 'LOAN' | 'FIXED_DEPOSIT' | 'FIELD_COLLECTION';

/** How a company (direct) sale, credited to no staff member, is labelled. */
export const COMPANY_SALE_LABEL = 'Company (direct)';

export const SALE_TYPE_LABELS: Record<SaleType, string> = {
  SAVINGS: 'New savings',
  LOAN: 'New loan',
  FIXED_DEPOSIT: 'New fixed deposit',
  FIELD_COLLECTION: 'Field collection',
};

/** The Configuration key holding each sale type's commission percentage. */
export const COMMISSION_CONFIG_KEY: Record<SaleType, string> = {
  SAVINGS: 'marketing.commission.savings',
  LOAN: 'marketing.commission.loan',
  FIXED_DEPOSIT: 'marketing.commission.fixedDeposit',
  FIELD_COLLECTION: 'marketing.commission.collection',
};

export function isMarketer(user: Pick<SessionUser, 'departmentCode'>): boolean {
  return user.departmentCode === MARKETING_DEPARTMENT_CODE;
}

export function canConfirmSales(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return (
    user.permissions.includes('ADMIN:SYSTEM') ||
    user.permissions.includes(ACCOUNTANT_PERMISSION) ||
    (user.roleLevel ?? 0) >= SALE_CONFIRM_ROLE_LEVEL
  );
}

/** Commission on `base` at `ratePercent`, rounded to kobo. Never negative. */
export function commissionFor(base: number, ratePercent: number): number {
  if (!Number.isFinite(base) || !Number.isFinite(ratePercent) || base <= 0 || ratePercent <= 0) return 0;
  return Math.round(base * ratePercent) / 100;
}

export interface SaleLinks {
  savingsAccountId?: string | null;
  loanId?: string | null;
  fixedDepositId?: string | null;
}

/**
 * Whether a sale's linked record matches its type: exactly one link, of the
 * kind the type needs. A field collection goes to a savings account (as a
 * deposit) or a loan (as a repayment). Returns an error message, or null.
 */
export function validateSaleLinks(type: SaleType, links: SaleLinks): string | null {
  const set = [links.savingsAccountId, links.loanId, links.fixedDepositId].filter(Boolean).length;
  if (set !== 1) return 'Choose exactly one account, loan or fixed deposit for this sale';
  switch (type) {
    case 'SAVINGS':
      return links.savingsAccountId ? null : 'A savings sale must be for a savings account';
    case 'LOAN':
      return links.loanId ? null : 'A loan sale must be for a loan';
    case 'FIXED_DEPOSIT':
      return links.fixedDepositId ? null : 'A fixed deposit sale must be for a fixed deposit';
    case 'FIELD_COLLECTION':
      return links.savingsAccountId || links.loanId
        ? null
        : 'Money collected in the field goes to a savings account or a loan';
  }
}

/** "2026-09" for a date, in local time. */
export function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** The first instant of a YYYY-MM month and of the month after it. */
export function monthRange(month: string): { from: Date; to: Date } {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new Error('Month must be given as YYYY-MM');
  const year = Number(match[1]);
  const index = Number(match[2]) - 1;
  if (index < 0 || index > 11) throw new Error('Month must be between 01 and 12');
  return { from: new Date(year, index, 1), to: new Date(year, index + 1, 1) };
}
