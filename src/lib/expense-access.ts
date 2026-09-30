/**
 * Expenses — who records them and who approves them.
 *
 *  - The accountant records expenses: anyone holding ACCOUNTS:JOURNAL_CREATE.
 *  - An admin approves them: the superuser (ADMIN:SYSTEM) or any role at
 *    level 85 and above (General Manager, Director, Super Administrator).
 *  - Nobody approves an expense they recorded.
 *
 * Pure rules, testable without a database.
 */
import type { SessionUser } from '@/types';

export const EXPENSE_RECORD_PERMISSION = 'ACCOUNTS:JOURNAL_CREATE';

/** Role level at and above which a role approves expenses. */
export const EXPENSE_APPROVE_ROLE_LEVEL = 85;

export function canRecordExpenses(user: Pick<SessionUser, 'permissions'>): boolean {
  return user.permissions.includes(EXPENSE_RECORD_PERMISSION);
}

export function canApproveExpenses(user: Pick<SessionUser, 'permissions' | 'roleLevel'>): boolean {
  return user.permissions.includes('ADMIN:SYSTEM') || (user.roleLevel ?? 0) >= EXPENSE_APPROVE_ROLE_LEVEL;
}

/**
 * Cash and bank accounts an expense can be paid from: active, non-header
 * asset accounts under 1100 Current Assets (1110 Cash in Hand, 1120 Cash at
 * Bank, 1130 Petty Cash, and any bank accounts added beneath them).
 */
export function isPaymentAccountCode(code: string): boolean {
  return /^11\d{2,}$/.test(code) && code !== '1100';
}
