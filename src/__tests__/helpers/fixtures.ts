/**
 * Shared test fixtures.
 *
 * Prisma returns `Decimal` values for every money column, and the server
 * actions call `.toNumber()` / `.toString()` on them and feed them straight
 * into decimal.js. Using a real `Decimal` here (same constructor the app uses)
 * keeps the mocked rows behaving like the real ones.
 */
import Decimal from 'decimal.js';

export const dec = (n: number | string): Decimal => new Decimal(n);

/** A permissioned staff session user, as returned by requirePermission(). */
export function sessionUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'staff-1',
    email: 'officer@hylink.test',
    employeeId: 'EMP001',
    firstName: 'Ada',
    lastName: 'Obi',
    role: 'Loan Officer',
    roleCode: 'LOAN_OFFICER',
    roleLevel: 40,
    approvalLimit: 0,
    department: 'Credit',
    departmentCode: 'CRD',
    branchId: 'branch-1',
    branchName: 'HQ',
    permissions: [] as string[],
    mustChangePassword: false,
    userType: 'staff',
    ...overrides,
  };
}
