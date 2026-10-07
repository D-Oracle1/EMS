/**
 * A customer's Hy-Link portfolio: what their savings, deposits and loans add
 * up to, worked out from the same records staff see.
 *
 * Pure, so the portal and the tests share it. Every figure comes from the
 * stored records; nothing here is an estimate except "at maturity", which
 * assumes no further deposits or withdrawals and is labelled so.
 */
import Decimal from 'decimal.js';
import { penaltyOwed } from '@/lib/fees';

const sum = (xs: number[]) => xs.reduce((t, x) => t.plus(x), new Decimal(0)).toNumber();
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** How far through its term something is, 0 to 1, by the calendar. */
export function termProgress(start: Date | string | null, end: Date | string | null, now = new Date()): number | null {
  if (!start || !end) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!(e > s)) return null;
  return clamp01((now.getTime() - s) / (e - s));
}

export function daysUntil(date: Date | string, now = new Date()): number {
  const d = new Date(date);
  const a = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((b - a) / 86_400_000);
}

// ─── Savings ────────────────────────────────────────────────────────────────

export interface SavingsInput {
  currentBalance: number;
  totalDeposits: number;
  interestAccrued: number;
  interestPaidToDate: number;
  interestTargetTotal: number | null;
  status: string;
}

/** Statuses whose money is still with Hy-Link. */
const HELD_SAVINGS = ['ACTIVE', 'DORMANT', 'FROZEN', 'MATURED', 'TERMINATION_REQUESTED'];

export function savingsPosition(s: SavingsInput) {
  const held = HELD_SAVINGS.includes(s.status);
  // Credited interest is already in the balance; accrued interest is owed at maturity.
  const earned = new Decimal(s.interestPaidToDate).plus(s.interestAccrued).toNumber();
  const value = held ? new Decimal(s.currentBalance).plus(s.interestAccrued).toNumber() : 0;
  const stillToEarn = s.interestTargetTotal != null ? Math.max(0, new Decimal(s.interestTargetTotal).minus(s.interestPaidToDate).toNumber()) : 0;
  const atMaturity = held && s.interestTargetTotal != null ? new Decimal(value).plus(stillToEarn).toNumber() : held ? value : 0;
  return { held, earned, value, atMaturity };
}

// ─── Fixed deposits ─────────────────────────────────────────────────────────

export interface DepositInput {
  principalAmount: number;
  accruedInterest: number;
  maturityAmount: number;
  status: string;
}

export function depositPosition(d: DepositInput) {
  const held = d.status === 'ACTIVE' || d.status === 'MATURED';
  return {
    held,
    earned: d.accruedInterest,
    value: held ? new Decimal(d.principalAmount).plus(d.accruedInterest).toNumber() : 0,
    atMaturity: held ? d.maturityAmount : 0,
  };
}

// ─── Loans ──────────────────────────────────────────────────────────────────

export interface InstalmentInput {
  installmentNumber: number;
  dueDate: Date | string;
  principalDue: number;
  interestDue: number;
  principalPaid: number;
  interestPaid: number;
  penaltyDue: number;
  penaltyPaid: number;
  penaltyWaived: number;
  status: string;
}

/** Where a loan is, in words a borrower understands. */
export const LOAN_STAGES = ['Applied', 'Being checked', 'Approved', 'Paid out', 'Repaying', 'Completed'] as const;

export function loanStage(status: string): { step: number; label: string; tone: 'progress' | 'good' | 'bad' | 'done' } {
  switch (status) {
    case 'DRAFT': return { step: 0, label: 'Application received', tone: 'progress' };
    case 'PENDING_VERIFICATION':
    case 'VERIFICATION_IN_PROGRESS':
    case 'VERIFIED':
    case 'PENDING_APPROVAL': return { step: 1, label: 'Being checked', tone: 'progress' };
    case 'APPROVED':
    case 'PENDING_DISBURSEMENT': return { step: 2, label: 'Approved, awaiting payout', tone: 'progress' };
    case 'DISBURSED': return { step: 3, label: 'Paid out', tone: 'good' };
    case 'ACTIVE': return { step: 4, label: 'Repaying', tone: 'good' };
    case 'OVERDUE': return { step: 4, label: 'Payment overdue', tone: 'bad' };
    case 'DEFAULTED': return { step: 4, label: 'In default', tone: 'bad' };
    case 'CLOSED': return { step: 5, label: 'Completed', tone: 'done' };
    case 'WRITTEN_OFF': return { step: 5, label: 'Closed', tone: 'done' };
    case 'REJECTED': return { step: 1, label: 'Not approved', tone: 'bad' };
    default: return { step: 0, label: status.replace(/_/g, ' ').toLowerCase(), tone: 'progress' };
  }
}

const REPAYING = ['DISBURSED', 'ACTIVE', 'OVERDUE', 'DEFAULTED'];

/** What a borrower owes, what is next, and how far they are. */
export function loanPosition(
  loan: { status: string; principalAmount: number; totalRepayment: number },
  schedule: InstalmentInput[],
  repaidTotal: number,
  now = new Date()
) {
  const live = schedule.filter((s) => s.status !== 'SUPERSEDED' && s.status !== 'WAIVED');
  const rows = live.map((s) => {
    const owed = Math.max(0, new Decimal(s.principalDue).plus(s.interestDue).minus(s.principalPaid).minus(s.interestPaid).toNumber());
    const charges = penaltyOwed(s);
    return { ...s, owed, charges, total: new Decimal(owed).plus(charges).toNumber() };
  });
  const repaying = REPAYING.includes(loan.status);
  const outstanding = repaying ? sum(rows.map((r) => r.total)) : 0;
  const chargesOwed = repaying ? sum(rows.map((r) => r.charges)) : 0;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const overdue = repaying ? sum(rows.filter((r) => new Date(r.dueDate).getTime() < today).map((r) => r.total)) : 0;
  const next = repaying
    ? rows.filter((r) => r.total > 0).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())[0] ?? null
    : null;
  const principalPaid = sum(live.map((s) => s.principalPaid));
  return {
    repaying,
    outstanding,
    chargesOwed,
    overdue,
    repaid: repaidTotal,
    next: next ? { dueDate: new Date(next.dueDate).toISOString(), amount: next.total, installmentNumber: next.installmentNumber } : null,
    progress: loan.principalAmount > 0 ? clamp01(principalPaid / loan.principalAmount) : 0,
    instalmentsPaid: live.filter((s) => s.status === 'PAID').length,
    instalments: live.length,
  };
}

// ─── The whole portfolio ────────────────────────────────────────────────────

export interface Holding {
  kind: 'SAVINGS' | 'PARTNERSHIP' | 'FIXED_DEPOSIT';
  value: number;
  earned: number;
  atMaturity: number;
}

export const HOLDING_LABEL: Record<Holding['kind'], string> = {
  SAVINGS: 'Savings',
  PARTNERSHIP: 'Mutual partnership',
  FIXED_DEPOSIT: 'Fixed deposits',
};

/** A savings plan named for the mutual partnership counts as one. */
export const isPartnershipPlan = (productName: string) => /partner/i.test(productName);

export function portfolioTotals(holdings: Holding[], loansOwed: number[]) {
  const invested = sum(holdings.map((h) => h.value));
  const owed = sum(loansOwed);
  const allocation = (['SAVINGS', 'PARTNERSHIP', 'FIXED_DEPOSIT'] as const)
    .map((kind) => ({ kind, label: HOLDING_LABEL[kind], value: sum(holdings.filter((h) => h.kind === kind).map((h) => h.value)) }))
    .filter((a) => a.value > 0)
    .map((a) => ({ ...a, share: invested > 0 ? a.value / invested : 0 }));
  return {
    invested,
    earned: sum(holdings.map((h) => h.earned)),
    atMaturity: sum(holdings.map((h) => h.atMaturity)),
    owed,
    net: new Decimal(invested).minus(owed).toNumber(),
    allocation,
  };
}
