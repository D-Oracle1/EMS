/**
 * Fees — what application forms cost, and loan default charges.
 *
 * Each kind of application form has a fee an admin sets (ApplicationFee): a
 * flat amount (savings registration NGN 1,000, guarantor NGN 2,000) or a
 * percentage of the amount applied for (loan processing, 7%). A form takes the
 * fee in force when it is submitted, so changing a fee later touches no one
 * who already applied. Fees are non-refundable: a payment is never deleted,
 * only reversed when it was recorded in error.
 *
 * Only a manager or admin may discount a fee, and always with a reason.
 *
 * A loan's processing fee is paid upfront on its application, so a loan
 * created from a paid application does not deduct it again at disbursement.
 *
 * Default charges: once an instalment is past its due date and the product's
 * grace period, it is charged the product's penalty rate (percent per day) on
 * its unpaid principal and interest, every day until paid (lib/loan-penalties).
 * A repayment clears default charges first. A manager or admin may waive them.
 *
 * Pure: shared by the screens, the server and the tests.
 */
import Decimal from 'decimal.js';
import type { SessionUser } from '@/types';
import { formatCurrency } from '@/lib/utils';

export type FeeKind = 'FLAT' | 'PERCENT';

export interface FeeSetting {
  kind: FeeKind;
  amount: number;
  isActive: boolean;
}

/** The paper forms' fees, used until an admin sets their own. */
export const DEFAULT_FEES: Record<string, FeeSetting> = {
  SAVINGS_APPLICATION: { kind: 'FLAT', amount: 1000, isActive: true },
  PARTNERSHIP_APPLICATION: { kind: 'FLAT', amount: 0, isActive: false },
  FIXED_DEPOSIT_APPLICATION: { kind: 'FLAT', amount: 0, isActive: false },
  LOAN_APPLICATION: { kind: 'PERCENT', amount: 7, isActive: true },
  GUARANTOR: { kind: 'FLAT', amount: 2000, isActive: true },
};

/** Where fee money is booked in the chart of accounts. */
export const FEE_GL = {
  CASH_BANK: '1120',
  /** Processing & Admin Fees: every application form fee. */
  FEE_INCOME: '4210',
  /** Penalty & Late Fees: loan default charges. */
  PENALTY_INCOME: '4220',
} as const;

const money = (n: Decimal) => n.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/**
 * The fee a form owes, given the setting in force and the amount applied for.
 * Null when the kind has no fee, or a percentage fee has no amount to apply to.
 */
export function computeFee(setting: FeeSetting | null | undefined, amountApplied: number | null): { due: number; basis: string } | null {
  if (!setting || !setting.isActive || !(setting.amount > 0)) return null;
  if (setting.kind === 'FLAT') {
    return { due: money(new Decimal(setting.amount)).toNumber(), basis: 'Registration fee' };
  }
  if (!amountApplied || !(amountApplied > 0)) return null;
  const due = money(new Decimal(amountApplied).times(setting.amount).div(100)).toNumber();
  return { due, basis: `${setting.amount}% of ${formatCurrency(amountApplied)}` };
}

export type FeeState = 'NONE' | 'UNPAID' | 'PART_PAID' | 'PAID' | 'WAIVED';

export interface FeePosition {
  due: number;
  discount: number;
  paid: number;
  /** What is still owed: never below zero. */
  balance: number;
  state: FeeState;
}

/** Where a form's fee stands, from its fee, discount and the payments not reversed. */
export function feePosition(due: number | null, discount: number, paid: number): FeePosition {
  if (due == null || due <= 0) return { due: 0, discount: 0, paid, balance: 0, state: 'NONE' };
  const owed = Decimal.max(0, new Decimal(due).minus(discount));
  const balance = Decimal.max(0, owed.minus(paid)).toNumber();
  const state: FeeState =
    owed.lte(0) ? 'WAIVED' :
    balance <= 0 ? 'PAID' :
    paid > 0 ? 'PART_PAID' : 'UNPAID';
  return { due, discount, paid, balance, state };
}

export const FEE_STATE_LABEL: Record<FeeState, string> = {
  NONE: 'No fee',
  UNPAID: 'Fee unpaid',
  PART_PAID: 'Part paid',
  PAID: 'Fee paid',
  WAIVED: 'Fee waived',
};

/** Role level from which staff may discount fees and waive default charges: Manager. */
export const DISCOUNT_ROLE_LEVEL = 70;

/** Managers and admins discount fees and waive default charges. Officers never do. */
export function canDiscount(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return user.permissions.includes('ADMIN:SYSTEM') || (user.roleLevel ?? 0) >= DISCOUNT_ROLE_LEVEL;
}

/** Who sets the fees: the superuser and level 85+, the same as forms. IT's config rights do not reach money. */
export function canManageFees(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return user.permissions.includes('ADMIN:SYSTEM') || (user.roleLevel ?? 0) >= 85;
}

/** Who reads the fee and charges report: accounts, managers and admins. */
export function canViewFeeReport(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return (
    user.permissions.includes('ACCOUNTS:REPORTS_VIEW') ||
    user.permissions.includes('ADMIN:SYSTEM') ||
    (user.roleLevel ?? 0) >= DISCOUNT_ROLE_LEVEL
  );
}

/** Checks a fee an admin is saving. Returns a message, or null when it is fine. */
export function feeSettingProblem(s: { kind: string; amount: number }): string | null {
  if (s.kind !== 'FLAT' && s.kind !== 'PERCENT') return 'Choose a fixed amount or a percentage';
  if (!Number.isFinite(s.amount) || s.amount < 0) return 'Enter a fee of zero or more';
  if (s.kind === 'PERCENT' && s.amount > 100) return 'A percentage fee cannot be more than 100%';
  if (s.kind === 'FLAT' && s.amount > 100_000_000) return 'That fee is too large';
  return null;
}

// ─── Default charges ────────────────────────────────────────────────────────

/** One day's default charge: rate percent of the unpaid principal and interest. */
export function dailyPenalty(overdueAmount: number, ratePerDay: number): number {
  if (!(overdueAmount > 0) || !(ratePerDay > 0)) return 0;
  return money(new Decimal(overdueAmount).times(ratePerDay).div(100)).toNumber();
}

/** The first day an instalment is charged: the day after its due date plus the grace period. */
export function firstChargeDay(dueDate: Date, graceDays: number): Date {
  const d = startOfDayUtc(dueDate);
  d.setUTCDate(d.getUTCDate() + Math.max(0, graceDays) + 1);
  return d;
}

export function startOfDayUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Days to charge an instalment on a run: back to the last one charged, at most this many, never before it became chargeable. */
export const MAX_CATCH_UP_DAYS = 31;

/**
 * The days a run should charge one instalment for. A run that was missed is
 * caught up from the last day charged. An instalment never charged before is
 * charged from today only: the charges began when this feature did, never
 * back-dated onto loans already overdue.
 */
export function daysToCharge(today: Date, firstDay: Date, lastCharged: Date | null): Date[] {
  const end = startOfDayUtc(today);
  if (end < firstDay) return [];
  let start: Date;
  if (!lastCharged) start = end;
  else {
    start = startOfDayUtc(lastCharged);
    start.setUTCDate(start.getUTCDate() + 1);
    if (start < firstDay) start = new Date(firstDay);
    const earliest = new Date(end);
    earliest.setUTCDate(earliest.getUTCDate() - (MAX_CATCH_UP_DAYS - 1));
    if (start < earliest) start = earliest;
  }
  const days: Date[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) days.push(new Date(d));
  return days;
}

/** What one instalment still owes in default charges. */
export function penaltyOwed(s: { penaltyDue: number; penaltyPaid: number; penaltyWaived: number }): number {
  return Decimal.max(0, new Decimal(s.penaltyDue).minus(s.penaltyPaid).minus(s.penaltyWaived)).toNumber();
}

/**
 * How a repayment is split across one instalment: default charges first,
 * then interest, then principal. Returns the parts and what is left over.
 */
export function allocateToInstalment(
  amount: number,
  owed: { penalty: number; interest: number; principal: number }
): { penalty: number; interest: number; principal: number; remaining: number } {
  let left = new Decimal(amount);
  const take = (n: number) => {
    const part = Decimal.min(Decimal.max(0, new Decimal(n)), left);
    left = left.minus(part);
    return part.toNumber();
  };
  const penalty = take(owed.penalty);
  const interest = take(owed.interest);
  const principal = take(owed.principal);
  return { penalty, interest, principal, remaining: left.toNumber() };
}
