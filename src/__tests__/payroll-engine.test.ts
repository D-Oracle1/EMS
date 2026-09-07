/**
 * Payroll engine: PAYE bands, component resolution, loss of pay and totals.
 *
 * The parts most worth pinning down are the ones a payslip is wrong-in-money if
 * they drift: the graduated PAYE scale, the two-pass earnings resolution
 * (percent-of-gross components must see the gross the fixed ones produced),
 * the pensionable base, and the invariant that gross minus deductions is
 * exactly net.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Decimal from 'decimal.js';
import { dec } from './helpers/fixtures';

const h = vi.hoisted(() => {
  const state = {
    staff: [] as any[],
    holidays: [] as any[],
    absences: [] as any[],
    presences: [] as any[],
    config: {} as Record<string, string>,
  };
  return { state };
});

vi.mock('@/lib/prisma', () => {
  const { state } = h;
  return {
    prisma: {
      staff: { findMany: vi.fn(async () => state.staff) },
      holiday: { findMany: vi.fn(async () => state.holidays) },
      attendance: {
        groupBy: vi.fn(async (args: any) => {
          const status = args.where?.status;
          // ABSENT is queried as a scalar; the present-ish statuses as an `in`.
          if (status === 'ABSENT') return state.absences;
          return state.presences;
        }),
      },
    },
    withTransaction: vi.fn(async (fn: any) => fn({})),
    withRetry: vi.fn(async (fn: any) => fn()),
  };
});

vi.mock('@/lib/system-config', () => {
  const { state } = h;
  return {
    getConfigMany: vi.fn(async (keys: string[]) => {
      const out: Record<string, string> = {};
      for (const key of keys) out[key] = state.config[key] ?? '';
      return out;
    }),
  };
});

const {
  computePayrollRun,
  calculateAnnualPAYE,
  calculateMonthlyPAYE,
  countWorkingDays,
} = await import('@/lib/payroll-engine');

const DEFAULT_CONFIG = {
  'hr.workDays': '[1,2,3,4,5]',
  'payroll.pensionEmployeeRate': '8',
  'payroll.pensionEmployerRate': '10',
  'payroll.nhfRate': '2.5',
  'payroll.consolidatedReliefFixed': '200000',
  'payroll.consolidatedReliefPercent': '20',
  'payroll.lopEnabled': 'true',
};

/** Build a staff row shaped the way the engine's Prisma query returns it. */
function staffRow(overrides: Record<string, any> = {}) {
  return {
    id: 'staff-1',
    employeeId: 'EMP001',
    firstName: 'Ada',
    lastName: 'Obi',
    jobTitle: 'Credit Analyst',
    bankName: 'Zenith',
    bankAccountNumber: '1234567890',
    grade: { name: 'Officer' },
    compensations: [
      {
        basicSalary: dec(200000),
        grade: { name: 'Officer' },
        items: [],
      },
    ],
    ...overrides,
  };
}

/** Build a compensation item shaped like the engine expects. */
function item(
  code: string,
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION',
  calculationType: 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS',
  value: number,
  opts: { isPensionable?: boolean } = {}
) {
  return {
    amount: calculationType === 'FIXED' ? dec(value) : null,
    percentage: calculationType === 'FIXED' ? null : dec(value),
    component: {
      code,
      name: code,
      type,
      calculationType,
      isPensionable: opts.isPensionable ?? false,
      glAccountCode: null,
      sortOrder: 10,
    },
  };
}

const PERIOD = {
  year: 2026,
  month: 9,
  startDate: new Date(2026, 8, 1),
  endDate: new Date(2026, 8, 30),
};

beforeEach(() => {
  h.state.staff = [];
  h.state.holidays = [];
  h.state.absences = [];
  h.state.presences = [];
  h.state.config = { ...DEFAULT_CONFIG };
});

// ============================================================================
// PAYE
// ============================================================================

describe('calculateAnnualPAYE', () => {
  it('returns zero for zero or negative taxable income', () => {
    expect(calculateAnnualPAYE(0).toNumber()).toBe(0);
    expect(calculateAnnualPAYE(-50000).toNumber()).toBe(0);
  });

  it('taxes the first band at 7%', () => {
    // 300,000 sits entirely in the first band
    expect(calculateAnnualPAYE(300_000).toNumber()).toBeCloseTo(21_000, 2);
  });

  it('applies each band to its own slice, not the whole income', () => {
    // 600,000 = 300,000 @ 7% + 300,000 @ 11% = 21,000 + 33,000
    expect(calculateAnnualPAYE(600_000).toNumber()).toBeCloseTo(54_000, 2);
  });

  it('walks the full band ladder for a high income', () => {
    // 300k@7 + 300k@11 + 500k@15 + 500k@19 + 1.6m@21 + remainder@24
    // = 21,000 + 33,000 + 75,000 + 95,000 + 336,000 = 560,000 at 3.2m
    expect(calculateAnnualPAYE(3_200_000).toNumber()).toBeCloseTo(560_000, 2);
  });

  it('taxes income above the top band at 24%', () => {
    const atTop = calculateAnnualPAYE(3_200_000);
    const above = calculateAnnualPAYE(4_200_000);
    // The extra million is entirely in the 24% band
    expect(above.minus(atTop).toNumber()).toBeCloseTo(240_000, 2);
  });

  it('is monotonic — more income never means less tax', () => {
    let previous = new Decimal(0);
    for (const income of [0, 100_000, 500_000, 1_000_000, 2_000_000, 5_000_000]) {
      const tax = calculateAnnualPAYE(income);
      expect(tax.gte(previous)).toBe(true);
      previous = tax;
    }
  });
});

describe('calculateMonthlyPAYE', () => {
  it('returns zero when gross is zero', () => {
    expect(calculateMonthlyPAYE(new Decimal(0), new Decimal(0), 200_000, 20).toNumber()).toBe(0);
  });

  it('returns zero when relief exceeds gross', () => {
    // 50,000/month = 600,000/year; relief = max(200k, 6k) + 20% = 320,000,
    // and pension relief of 60,000/yr leaves 220,000 taxable — still positive,
    // so use a much lower salary to push taxable below zero.
    const tax = calculateMonthlyPAYE(new Decimal(15_000), new Decimal(5_000), 200_000, 20);
    expect(tax.toNumber()).toBe(0);
  });

  it('deducts pension contributions from taxable income', () => {
    const withoutPension = calculateMonthlyPAYE(new Decimal(500_000), new Decimal(0), 200_000, 20);
    const withPension = calculateMonthlyPAYE(
      new Decimal(500_000),
      new Decimal(40_000),
      200_000,
      20
    );
    expect(withPension.lt(withoutPension)).toBe(true);
  });

  it('uses 1% of gross as relief when it exceeds the fixed amount', () => {
    // At a very high salary, 1% of annual gross beats the 200,000 fixed floor.
    const highEarner = calculateMonthlyPAYE(new Decimal(5_000_000), new Decimal(0), 200_000, 20);
    expect(highEarner.gt(0)).toBe(true);
  });
});

// ============================================================================
// WORKING DAYS
// ============================================================================

describe('countWorkingDays', () => {
  it('counts only the configured working days', () => {
    // 1–7 Sept 2026: Tue 1 … Mon 7. Mon–Fri gives 1,2,3,4 and 7 = 5 days.
    const count = countWorkingDays(
      new Date(2026, 8, 1),
      new Date(2026, 8, 7),
      [1, 2, 3, 4, 5],
      new Set()
    );
    expect(count).toBe(5);
  });

  it('excludes holidays that fall on a working day', () => {
    const holidays = new Set([new Date(Date.UTC(2026, 8, 2)).toISOString().slice(0, 10)]);
    const withHoliday = countWorkingDays(
      new Date(2026, 8, 1),
      new Date(2026, 8, 7),
      [1, 2, 3, 4, 5],
      holidays
    );
    expect(withHoliday).toBe(4);
  });

  it('counts every day when all seven are working days', () => {
    const count = countWorkingDays(
      new Date(2026, 8, 1),
      new Date(2026, 8, 7),
      [0, 1, 2, 3, 4, 5, 6],
      new Set()
    );
    expect(count).toBe(7);
  });

  it('returns zero when the range is inverted', () => {
    const count = countWorkingDays(
      new Date(2026, 8, 7),
      new Date(2026, 8, 1),
      [1, 2, 3, 4, 5],
      new Set()
    );
    expect(count).toBe(0);
  });
});

// ============================================================================
// PAYSLIP COMPUTATION
// ============================================================================

describe('computePayrollRun', () => {
  it('skips staff with no compensation package rather than failing the run', async () => {
    h.state.staff = [
      staffRow(),
      staffRow({ id: 'staff-2', employeeId: 'EMP002', firstName: 'Bola', compensations: [] }),
    ];

    const run = await computePayrollRun(PERIOD);

    expect(run.payslips).toHaveLength(1);
    expect(run.skipped).toHaveLength(1);
    expect(run.skipped[0].reason).toMatch(/no active compensation/i);
  });

  it('skips staff whose basic salary is zero', async () => {
    h.state.staff = [
      staffRow({
        compensations: [{ basicSalary: dec(0), grade: null, items: [] }],
      }),
    ];

    const run = await computePayrollRun(PERIOD);

    expect(run.payslips).toHaveLength(0);
    expect(run.skipped[0].reason).toMatch(/zero/i);
  });

  it('always emits a BASIC earning line', async () => {
    h.state.staff = [staffRow()];

    const run = await computePayrollRun(PERIOD);
    const basic = run.payslips[0].lines.find((l) => l.componentCode === 'BASIC');

    expect(basic).toBeDefined();
    expect(basic!.amount).toBe(200_000);
    expect(basic!.type).toBe('EARNING');
  });

  it('resolves percent-of-basic allowances against basic salary', async () => {
    h.state.staff = [
      staffRow({
        compensations: [
          {
            basicSalary: dec(200_000),
            grade: null,
            items: [item('HOUSING', 'EARNING', 'PERCENT_OF_BASIC', 30)],
          },
        ],
      }),
    ];

    const run = await computePayrollRun(PERIOD);
    const housing = run.payslips[0].lines.find((l) => l.componentCode === 'HOUSING');

    expect(housing!.amount).toBe(60_000); // 30% of 200,000
  });

  it('resolves fixed allowances at their stated amount', async () => {
    h.state.staff = [
      staffRow({
        compensations: [
          {
            basicSalary: dec(200_000),
            grade: null,
            items: [item('MEAL', 'EARNING', 'FIXED', 15_000)],
          },
        ],
      }),
    ];

    const run = await computePayrollRun(PERIOD);
    const meal = run.payslips[0].lines.find((l) => l.componentCode === 'MEAL');

    expect(meal!.amount).toBe(15_000);
    expect(run.payslips[0].grossEarnings).toBe(215_000);
  });

  it('resolves percent-of-gross allowances against the gross the fixed ones produced', async () => {
    // basic 200,000 + housing 30% (60,000) = 260,000 gross before the
    // percent-of-gross line, so a 10% line must be 26,000 — not 20,000.
    h.state.staff = [
      staffRow({
        compensations: [
          {
            basicSalary: dec(200_000),
            grade: null,
            items: [
              item('HOUSING', 'EARNING', 'PERCENT_OF_BASIC', 30),
              item('BONUS', 'EARNING', 'PERCENT_OF_GROSS', 10),
            ],
          },
        ],
      }),
    ];

    const run = await computePayrollRun(PERIOD);
    const bonus = run.payslips[0].lines.find((l) => l.componentCode === 'BONUS');

    expect(bonus!.amount).toBe(26_000);
  });

  it('computes employee pension on basic plus pensionable allowances only', async () => {
    h.state.staff = [
      staffRow({
        compensations: [
          {
            basicSalary: dec(200_000),
            grade: null,
            items: [
              item('HOUSING', 'EARNING', 'PERCENT_OF_BASIC', 30, { isPensionable: true }),
              item('MEAL', 'EARNING', 'FIXED', 50_000, { isPensionable: false }),
            ],
          },
        ],
      }),
    ];

    const run = await computePayrollRun(PERIOD);
    const pension = run.payslips[0].lines.find((l) => l.componentCode === 'PENSION_EE');

    // Pensionable base = 200,000 + 60,000 = 260,000; 8% = 20,800.
    // The 50,000 meal allowance is excluded.
    expect(pension!.amount).toBeCloseTo(20_800, 2);
  });

  it('records the employer pension as a contribution, not a deduction', async () => {
    h.state.staff = [staffRow()];

    const run = await computePayrollRun(PERIOD);
    const employerPension = run.payslips[0].lines.find((l) => l.componentCode === 'PENSION_ER');

    expect(employerPension!.type).toBe('EMPLOYER_CONTRIBUTION');
    expect(employerPension!.amount).toBeCloseTo(20_000, 2); // 10% of 200,000
    // It must not reduce take-home pay
    expect(run.payslips[0].employerCost).toBeCloseTo(20_000, 2);
  });

  it('computes NHF on basic salary', async () => {
    h.state.staff = [staffRow()];

    const run = await computePayrollRun(PERIOD);
    const nhf = run.payslips[0].lines.find((l) => l.componentCode === 'NHF');

    expect(nhf!.amount).toBeCloseTo(5_000, 2); // 2.5% of 200,000
  });

  it('keeps net pay equal to gross earnings minus total deductions', async () => {
    h.state.staff = [
      staffRow({
        compensations: [
          {
            basicSalary: dec(400_000),
            grade: null,
            items: [
              item('HOUSING', 'EARNING', 'PERCENT_OF_BASIC', 30, { isPensionable: true }),
              item('TRANSPORT', 'EARNING', 'PERCENT_OF_BASIC', 20),
              item('COOP', 'DEDUCTION', 'FIXED', 10_000),
            ],
          },
        ],
      }),
    ];

    const run = await computePayrollRun(PERIOD);
    const slip = run.payslips[0];

    expect(slip.netPay).toBeCloseTo(slip.grossEarnings - slip.totalDeductions, 2);
  });

  it('deducts loss of pay for unpaid absences and prorates by working days', async () => {
    h.state.staff = [staffRow()];
    h.state.absences = [{ staffId: 'staff-1', _count: { _all: 2 } }];

    const run = await computePayrollRun(PERIOD);
    const slip = run.payslips[0];
    const lop = slip.lines.find((l) => l.componentCode === 'LOP');

    expect(lop).toBeDefined();
    expect(slip.daysAbsent).toBe(2);
    expect(slip.lopDays).toBe(2);
    // September 2026 has 22 Mon–Fri days; 200,000 / 22 × 2 ≈ 18,181.82
    expect(lop!.amount).toBeCloseTo((200_000 / 22) * 2, 0);
    expect(lop!.type).toBe('DEDUCTION');
  });

  it('does not deduct loss of pay when the feature is switched off', async () => {
    h.state.config['payroll.lopEnabled'] = 'false';
    h.state.staff = [staffRow()];
    h.state.absences = [{ staffId: 'staff-1', _count: { _all: 3 } }];

    const run = await computePayrollRun(PERIOD);
    const lop = run.payslips[0].lines.find((l) => l.componentCode === 'LOP');

    expect(lop).toBeUndefined();
    expect(run.payslips[0].lopAmount).toBe(0);
    // The absence is still reported, it just is not priced
    expect(run.payslips[0].daysAbsent).toBe(3);
  });

  it('carries attendance counts onto the payslip', async () => {
    h.state.staff = [staffRow()];
    h.state.presences = [{ staffId: 'staff-1', _count: { _all: 20 } }];
    h.state.absences = [{ staffId: 'staff-1', _count: { _all: 2 } }];

    const run = await computePayrollRun(PERIOD);

    expect(run.payslips[0].daysPresent).toBe(20);
    expect(run.payslips[0].daysAbsent).toBe(2);
    expect(run.payslips[0].workingDays).toBe(22);
  });

  it('excludes holidays from the working-day divisor', async () => {
    h.state.staff = [staffRow()];
    // Two mid-week holidays in September 2026
    h.state.holidays = [
      { date: new Date(Date.UTC(2026, 8, 2)) },
      { date: new Date(Date.UTC(2026, 8, 3)) },
    ];

    const run = await computePayrollRun(PERIOD);

    expect(run.payslips[0].workingDays).toBe(20);
  });

  it('totals the run across every payslip', async () => {
    h.state.staff = [
      staffRow(),
      staffRow({ id: 'staff-2', employeeId: 'EMP002', firstName: 'Bola' }),
    ];

    const run = await computePayrollRun(PERIOD);

    expect(run.staffCount).toBe(2);
    expect(run.totalGross).toBeCloseTo(
      run.payslips.reduce((sum, p) => sum + p.grossEarnings, 0),
      2
    );
    expect(run.totalNet).toBeCloseTo(
      run.payslips.reduce((sum, p) => sum + p.netPay, 0),
      2
    );
    expect(run.totalEmployerCost).toBeCloseTo(
      run.payslips.reduce((sum, p) => sum + p.employerCost, 0),
      2
    );
  });

  it('returns lines ordered so BASIC leads and statutory deductions trail', async () => {
    h.state.staff = [
      staffRow({
        compensations: [
          {
            basicSalary: dec(200_000),
            grade: null,
            items: [item('HOUSING', 'EARNING', 'PERCENT_OF_BASIC', 30)],
          },
        ],
      }),
    ];

    const run = await computePayrollRun(PERIOD);
    const codes = run.payslips[0].lines.map((l) => l.componentCode);

    expect(codes[0]).toBe('BASIC');
    expect(codes.indexOf('PENSION_EE')).toBeGreaterThan(codes.indexOf('HOUSING'));
    expect(codes.indexOf('PAYE')).toBeGreaterThan(codes.indexOf('PENSION_EE'));
  });

  it('falls back to Mon–Fri when the working-days config is malformed', async () => {
    h.state.config['hr.workDays'] = 'not json';
    h.state.staff = [staffRow()];

    const run = await computePayrollRun(PERIOD);

    expect(run.payslips[0].workingDays).toBe(22);
  });

  it('snapshots bank and grade details onto the payslip', async () => {
    h.state.staff = [staffRow()];

    const run = await computePayrollRun(PERIOD);
    const slip = run.payslips[0];

    expect(slip.bankName).toBe('Zenith');
    expect(slip.bankAccountNumber).toBe('1234567890');
    expect(slip.gradeName).toBe('Officer');
    expect(slip.jobTitle).toBe('Credit Analyst');
  });

  it('omits zero-valued components from the payslip', async () => {
    h.state.staff = [
      staffRow({
        compensations: [
          {
            basicSalary: dec(200_000),
            grade: null,
            items: [item('MEAL', 'EARNING', 'FIXED', 0)],
          },
        ],
      }),
    ];

    const run = await computePayrollRun(PERIOD);
    const meal = run.payslips[0].lines.find((l) => l.componentCode === 'MEAL');

    expect(meal).toBeUndefined();
  });
});
