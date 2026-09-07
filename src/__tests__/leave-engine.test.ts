/**
 * Leave engine: day counting, eligibility rules and the balance hold.
 *
 * The balance arithmetic is what stops two overlapping requests being approved
 * out of the same entitlement, so `available = entitled + carried - used -
 * pending` is the invariant these tests defend. The eligibility rules
 * (gender restriction, minimum service, notice period, overlap) are the other
 * half — each one is a distinct reason a request must be refused.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { dec } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    leaveTypes: [] as any[],
    balances: [] as any[],
    staff: null as any,
    holidays: [] as any[],
    overlap: null as any,
    config: {} as Record<string, unknown>,
    createdBalances: [] as any[],
    updatedBalances: [] as any[],
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;

  const findBalance = (where: any) => {
    const key = where.staffId_leaveTypeId_year;
    if (!key) return null;
    return (
      state.balances.find(
        (b) =>
          b.staffId === key.staffId &&
          b.leaveTypeId === key.leaveTypeId &&
          b.year === key.year
      ) ?? null
    );
  };

  return {
    prisma: {
      leaveType: {
        findUnique: vi.fn(async (args: any) =>
          state.leaveTypes.find((t) => t.id === args.where.id) ?? null
        ),
        findMany: vi.fn(async () => state.leaveTypes),
      },
      leaveBalance: {
        findUnique: vi.fn(async (args: any) => findBalance(args.where)),
        // Return a snapshot and honour the year filter, the way Prisma does —
        // rows created during a loop must not appear in a list fetched before it.
        findMany: vi.fn(async (args: any) => {
          const year = args?.where?.year;
          return state.balances
            .filter((b) => (year === undefined ? true : b.year === year))
            .map((b) => ({ ...b }));
        }),
        create: vi.fn(async (args: any) => {
          const row = {
            id: `bal-${state.createdBalances.length + 1}`,
            // Columns the database defaults to zero when not supplied.
            carriedForwardDays: dec(0),
            accruedDays: dec(0),
            usedDays: dec(0),
            pendingDays: dec(0),
            ...args.data,
          };
          state.createdBalances.push(row);
          state.balances.push(row);
          return row;
        }),
        update: vi.fn(async (args: any) => {
          state.updatedBalances.push({ where: args.where, data: args.data });
          return args.data;
        }),
      },
      staff: { findUnique: vi.fn(async () => state.staff) },
      holiday: { findMany: vi.fn(async () => state.holidays) },
      leaveRequest: { findFirst: vi.fn(async () => state.overlap) },
    },
    withTransaction: vi.fn(async (fn: any) => fn({})),
  };
});

vi.mock('@/lib/system-config', () => {
  const { state } = h;
  return {
    getConfigJson: vi.fn(async (key: string, fallback: unknown) =>
      key in state.config ? state.config[key] : fallback
    ),
  };
});

const {
  countLeaveDays,
  validateLeaveRequest,
  ensureLeaveBalance,
  getStaffLeaveBalances,
  carryForwardLeaveBalances,
  getLeaveYear,
} = await import('@/lib/leave-engine');

/** A leave type shaped the way Prisma returns it. */
function leaveType(overrides: Record<string, any> = {}) {
  return {
    id: 'lt-annual',
    code: 'ANNUAL',
    name: 'Annual Leave',
    defaultDays: dec(20),
    isPaid: true,
    requiresApproval: true,
    requiresDocument: false,
    allowHalfDay: false,
    carryForward: false,
    maxCarryForwardDays: dec(0),
    maxConsecutiveDays: null,
    minServiceMonths: 0,
    genderRestriction: null,
    countsWeekends: false,
    colorHex: '#0ea5e9',
    sortOrder: 1,
    isActive: true,
    ...overrides,
  };
}

function balance(overrides: Record<string, any> = {}) {
  return {
    id: 'bal-1',
    staffId: 'staff-1',
    leaveTypeId: 'lt-annual',
    year: 2026,
    entitledDays: dec(20),
    carriedForwardDays: dec(0),
    accruedDays: dec(0),
    usedDays: dec(0),
    pendingDays: dec(0),
    ...overrides,
  };
}

/** A date far enough ahead to clear any notice-period rule. */
function future(daysAhead: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(0, 0, 0, 0);
  return d;
}

beforeEach(() => {
  h.state.leaveTypes = [leaveType()];
  h.state.balances = [balance()];
  h.state.staff = {
    hireDate: new Date(2020, 0, 15),
    gender: 'FEMALE',
    grade: null,
  };
  h.state.holidays = [];
  h.state.overlap = null;
  h.state.config = {};
  h.state.createdBalances = [];
  h.state.updatedBalances = [];
});

// ============================================================================
// DAY COUNTING
// ============================================================================

describe('countLeaveDays', () => {
  it('counts calendar days when the type counts weekends', async () => {
    // Mon 7 Sept 2026 to Sun 13 Sept = 7 calendar days
    const days = await countLeaveDays(new Date(2026, 8, 7), new Date(2026, 8, 13), true);
    expect(days).toBe(7);
  });

  it('excludes weekends when the type does not count them', async () => {
    const days = await countLeaveDays(new Date(2026, 8, 7), new Date(2026, 8, 13), false);
    expect(days).toBe(5);
  });

  it('excludes holidays that fall on a working day', async () => {
    h.state.holidays = [{ date: new Date(Date.UTC(2026, 8, 9)) }];
    const days = await countLeaveDays(new Date(2026, 8, 7), new Date(2026, 8, 13), false);
    expect(days).toBe(4);
  });

  it('counts a single-day request as one day', async () => {
    const days = await countLeaveDays(new Date(2026, 8, 7), new Date(2026, 8, 7), false);
    expect(days).toBe(1);
  });

  it('returns zero when the end date is before the start', async () => {
    const days = await countLeaveDays(new Date(2026, 8, 13), new Date(2026, 8, 7), false);
    expect(days).toBe(0);
  });

  it('returns zero when the whole range falls on a weekend', async () => {
    // Sat 12 and Sun 13 September 2026
    const days = await countLeaveDays(new Date(2026, 8, 12), new Date(2026, 8, 13), false);
    expect(days).toBe(0);
  });
});

// ============================================================================
// LEAVE YEAR
// ============================================================================

describe('getLeaveYear', () => {
  it('uses the calendar year by default', async () => {
    expect(await getLeaveYear(new Date(2026, 2, 15))).toBe(2026);
  });

  it('rolls a date before the year start back into the previous leave year', async () => {
    h.state.config['hr.leaveYearStartMonth'] = '4'; // April start
    // February 2026 belongs to the leave year that began April 2025
    expect(await getLeaveYear(new Date(2026, 1, 15))).toBe(2025);
  });

  it('keeps a date on or after the year start in the current year', async () => {
    h.state.config['hr.leaveYearStartMonth'] = '4';
    expect(await getLeaveYear(new Date(2026, 5, 15))).toBe(2026);
  });
});

// ============================================================================
// BALANCES
// ============================================================================

describe('ensureLeaveBalance', () => {
  it('returns the existing balance rather than creating a duplicate', async () => {
    const result = await ensureLeaveBalance('staff-1', 'lt-annual', 2026);
    expect(result.id).toBe('bal-1');
    expect(h.state.createdBalances).toHaveLength(0);
  });

  it('seeds a new balance from the leave type default', async () => {
    h.state.balances = [];
    await ensureLeaveBalance('staff-1', 'lt-annual', 2026);

    expect(h.state.createdBalances).toHaveLength(1);
    expect(h.state.createdBalances[0].entitledDays).toBe(20);
  });

  it('prorates the entitlement in the hire year', async () => {
    h.state.balances = [];
    // Hired in July (month index 6) — 6 months remaining of 12
    h.state.staff = { hireDate: new Date(2026, 6, 1), gender: 'FEMALE', grade: null };

    await ensureLeaveBalance('staff-1', 'lt-annual', 2026);

    expect(h.state.createdBalances[0].entitledDays).toBeCloseTo(10, 2);
  });

  it('lets a grade entitlement override the annual leave type default', async () => {
    h.state.balances = [];
    h.state.staff = {
      hireDate: new Date(2020, 0, 15),
      gender: 'FEMALE',
      grade: { annualLeaveDays: dec(30) },
    };

    await ensureLeaveBalance('staff-1', 'lt-annual', 2026);

    expect(h.state.createdBalances[0].entitledDays).toBe(30);
  });

  it('ignores the grade entitlement for non-annual leave types', async () => {
    h.state.balances = [];
    h.state.leaveTypes = [leaveType({ id: 'lt-sick', code: 'SICK', defaultDays: dec(12) })];
    h.state.staff = {
      hireDate: new Date(2020, 0, 15),
      gender: 'FEMALE',
      grade: { annualLeaveDays: dec(30) },
    };

    await ensureLeaveBalance('staff-1', 'lt-sick', 2026);

    expect(h.state.createdBalances[0].entitledDays).toBe(12);
  });
});

describe('getStaffLeaveBalances', () => {
  it('computes available as entitled plus carried, minus used and pending', async () => {
    h.state.balances = [
      balance({
        entitledDays: dec(20),
        carriedForwardDays: dec(5),
        usedDays: dec(8),
        pendingDays: dec(3),
      }),
    ];

    const [view] = await getStaffLeaveBalances('staff-1', 2026);

    expect(view.availableDays).toBe(14); // 20 + 5 - 8 - 3
  });

  it('falls back to the type default when no balance row exists yet', async () => {
    h.state.balances = [];

    const [view] = await getStaffLeaveBalances('staff-1', 2026);

    expect(view.entitledDays).toBe(20);
    expect(view.availableDays).toBe(20);
  });

  it('reports a row for every active leave type', async () => {
    h.state.leaveTypes = [
      leaveType(),
      leaveType({ id: 'lt-sick', code: 'SICK', name: 'Sick Leave', defaultDays: dec(12) }),
    ];

    const views = await getStaffLeaveBalances('staff-1', 2026);

    expect(views).toHaveLength(2);
    expect(views.map((v) => v.leaveTypeCode)).toEqual(['ANNUAL', 'SICK']);
  });
});

// ============================================================================
// VALIDATION
// ============================================================================

const baseRequest = {
  staffId: 'staff-1',
  leaveTypeId: 'lt-annual',
  allowNegativeBalance: false,
  minNoticeDays: 3,
};

describe('validateLeaveRequest', () => {
  it('accepts a well-formed request inside the balance', async () => {
    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(16),
    });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.days).toBeGreaterThan(0);
  });

  it('refuses an inverted date range', async () => {
    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(16),
      endDate: future(14),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/before the start/i);
  });

  it('refuses an inactive leave type', async () => {
    h.state.leaveTypes = [leaveType({ isActive: false })];

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(16),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not currently available/i);
  });

  it('enforces the gender restriction', async () => {
    h.state.leaveTypes = [leaveType({ genderRestriction: 'MALE', name: 'Paternity Leave' })];
    h.state.staff = { hireDate: new Date(2020, 0, 1), gender: 'FEMALE', grade: null };

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(16),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/not applicable/i);
  });

  it('enforces the minimum service requirement', async () => {
    h.state.leaveTypes = [leaveType({ minServiceMonths: 12 })];
    // Hired last month
    const recentHire = new Date();
    recentHire.setMonth(recentHire.getMonth() - 1);
    h.state.staff = { hireDate: recentHire, gender: 'FEMALE', grade: null };

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(16),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/12 months of service/i);
  });

  it('enforces the notice period', async () => {
    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(1),
      endDate: future(2),
      minNoticeDays: 7,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/notice/i);
  });

  it('waives the notice period for sick leave', async () => {
    h.state.leaveTypes = [leaveType({ code: 'SICK', name: 'Sick Leave' })];

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(1),
      endDate: future(2),
      minNoticeDays: 7,
    });

    expect(result.ok).toBe(true);
  });

  it('enforces the maximum consecutive days', async () => {
    h.state.leaveTypes = [leaveType({ maxConsecutiveDays: 3 })];

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(35),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/consecutive days/i);
  });

  it('refuses a request that overlaps an existing one', async () => {
    h.state.overlap = { id: 'lr-existing' };

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(16),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/overlaps/i);
  });

  it('refuses a request that exceeds the available balance', async () => {
    h.state.balances = [
      balance({ entitledDays: dec(20), usedDays: dec(18), pendingDays: dec(0) }),
    ];

    // Ask for far more than the two remaining days
    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(45),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/insufficient balance/i);
  });

  it('counts pending days against the balance so two requests cannot double-spend', async () => {
    h.state.balances = [
      balance({ entitledDays: dec(20), usedDays: dec(0), pendingDays: dec(19) }),
    ];

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(25),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/insufficient balance/i);
  });

  it('allows an over-drawn balance when the policy permits it', async () => {
    h.state.balances = [balance({ entitledDays: dec(1), usedDays: dec(1) })];

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(20),
      allowNegativeBalance: true,
    });

    expect(result.ok).toBe(true);
  });

  it('does not balance-check unpaid leave', async () => {
    h.state.leaveTypes = [leaveType({ code: 'UNPAID', isPaid: false, defaultDays: dec(0) })];
    h.state.balances = [balance({ entitledDays: dec(0) })];

    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: future(14),
      endDate: future(20),
    });

    expect(result.ok).toBe(true);
  });

  it('refuses a range that contains no working days', async () => {
    // Sat 12 and Sun 13 September 2026, far enough out to clear notice
    const result = await validateLeaveRequest({
      ...baseRequest,
      startDate: new Date(2099, 0, 3), // a Saturday
      endDate: new Date(2099, 0, 4), // a Sunday
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/no working days/i);
  });
});

// ============================================================================
// CARRY FORWARD
// ============================================================================

describe('carryForwardLeaveBalances', () => {
  it('does nothing when no type allows carry forward', async () => {
    h.state.leaveTypes = [leaveType({ carryForward: false })];

    const result = await carryForwardLeaveBalances(2025, 2026);

    expect(result.processed).toBe(0);
  });

  it('carries unused days up to the type cap', async () => {
    h.state.leaveTypes = [
      leaveType({ carryForward: true, maxCarryForwardDays: dec(5) }),
    ];
    h.state.balances = [
      balance({ year: 2025, entitledDays: dec(20), usedDays: dec(12) }), // 8 unused
    ];

    const result = await carryForwardLeaveBalances(2025, 2026);

    expect(result.processed).toBe(1);
    const update = h.state.updatedBalances.at(-1);
    expect(update.data.carriedForwardDays).toBe(5); // capped from 8
  });

  it('carries the full unused amount when it is under the cap', async () => {
    h.state.leaveTypes = [
      leaveType({ carryForward: true, maxCarryForwardDays: dec(10) }),
    ];
    h.state.balances = [
      balance({ year: 2025, entitledDays: dec(20), usedDays: dec(17) }), // 3 unused
    ];

    await carryForwardLeaveBalances(2025, 2026);

    const update = h.state.updatedBalances.at(-1);
    expect(update.data.carriedForwardDays).toBe(3);
  });

  it('skips a balance with nothing left to carry', async () => {
    h.state.leaveTypes = [
      leaveType({ carryForward: true, maxCarryForwardDays: dec(5) }),
    ];
    h.state.balances = [
      balance({ year: 2025, entitledDays: dec(20), usedDays: dec(20) }),
    ];

    const result = await carryForwardLeaveBalances(2025, 2026);

    expect(result.processed).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
