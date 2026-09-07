/**
 * Payroll Engine
 * Hylink Finance Limited EMS
 *
 * Computes payslips from each staff member's compensation package, statutory
 * rates held in system configuration, and the attendance record for the period.
 *
 * Design notes:
 *  - All money maths goes through decimal.js. No floating-point arithmetic.
 *  - PAYE follows the Nigerian graduated scale applied to annualised taxable
 *    income after consolidated relief, then divided back to a monthly figure.
 *  - The engine is pure: it reads data and returns computed payslips. Persisting
 *    and posting to the general ledger is the caller's job.
 */

import Decimal from 'decimal.js';
import { prisma } from './prisma';
import { getConfigMany } from './system-config';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// ============================================================================
// TYPES
// ============================================================================

export interface PayrollLine {
  componentCode: string;
  componentName: string;
  type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
  amount: number;
  glAccountCode: string | null;
  sortOrder: number;
}

export interface ComputedPayslip {
  staffId: string;
  employeeId: string;
  staffName: string;
  jobTitle: string | null;
  gradeName: string | null;
  bankName: string | null;
  bankAccountNumber: string | null;

  basicSalary: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  employerCost: number;

  workingDays: number;
  daysPresent: number;
  daysAbsent: number;
  lopDays: number;
  lopAmount: number;

  lines: PayrollLine[];
}

export interface PayrollRunSummary {
  payslips: ComputedPayslip[];
  staffCount: number;
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  skipped: Array<{ staffId: string; staffName: string; reason: string }>;
}

// ============================================================================
// PAYE — Nigerian graduated personal income tax bands (annual, NGN)
// ============================================================================

const PAYE_BANDS: Array<{ upTo: number | null; rate: number }> = [
  { upTo: 300_000, rate: 0.07 },
  { upTo: 300_000, rate: 0.11 },
  { upTo: 500_000, rate: 0.15 },
  { upTo: 500_000, rate: 0.19 },
  { upTo: 1_600_000, rate: 0.21 },
  { upTo: null, rate: 0.24 }, // remainder
];

/**
 * Annual PAYE on a taxable income, applying the graduated band rates.
 * `annualTaxableIncome` is income *after* consolidated relief.
 */
export function calculateAnnualPAYE(annualTaxableIncome: number): Decimal {
  let remaining = new Decimal(Math.max(annualTaxableIncome, 0));
  let tax = new Decimal(0);

  for (const band of PAYE_BANDS) {
    if (remaining.lte(0)) break;
    const slice = band.upTo === null ? remaining : Decimal.min(remaining, band.upTo);
    tax = tax.plus(slice.times(band.rate));
    remaining = remaining.minus(slice);
  }

  return tax.toDecimalPlaces(2);
}

/**
 * Monthly PAYE for a given monthly gross, using the consolidated relief
 * allowance rates held in system configuration.
 */
export function calculateMonthlyPAYE(
  monthlyGross: Decimal,
  monthlyPensionRelief: Decimal,
  reliefFixed: number,
  reliefPercent: number
): Decimal {
  const annualGross = monthlyGross.times(12);
  if (annualGross.lte(0)) return new Decimal(0);

  // Consolidated relief = higher of (fixed, 1% of gross) + percent of gross
  const onePercent = annualGross.times(0.01);
  const base = Decimal.max(new Decimal(reliefFixed), onePercent);
  const consolidatedRelief = base.plus(annualGross.times(reliefPercent).div(100));

  // Pension contributions are tax-deductible
  const annualPension = monthlyPensionRelief.times(12);

  const taxable = annualGross.minus(consolidatedRelief).minus(annualPension);
  if (taxable.lte(0)) return new Decimal(0);

  return calculateAnnualPAYE(taxable.toNumber()).div(12).toDecimalPlaces(2);
}

// ============================================================================
// WORKING DAYS
// ============================================================================

/** Count the working days in a date range, excluding non-working weekdays and holidays. */
export function countWorkingDays(
  startDate: Date,
  endDate: Date,
  workDays: number[],
  holidayDates: Set<string>
): number {
  let count = 0;
  const cursor = new Date(startDate);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(0, 0, 0, 0);

  while (cursor <= end) {
    const isWorkDay = workDays.includes(cursor.getDay());
    const key = cursor.toISOString().slice(0, 10);
    if (isWorkDay && !holidayDates.has(key)) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// ============================================================================
// ENGINE
// ============================================================================

interface CompensationItemLike {
  amount: Decimal | null;
  percentage: Decimal | null;
  component: {
    code: string;
    name: string;
    type: 'EARNING' | 'DEDUCTION' | 'EMPLOYER_CONTRIBUTION';
    calculationType: 'FIXED' | 'PERCENT_OF_BASIC' | 'PERCENT_OF_GROSS';
    isPensionable: boolean;
    glAccountCode: string | null;
    sortOrder: number;
  };
}

/**
 * Resolve the money value of one compensation item.
 * PERCENT_OF_GROSS items are resolved in a second pass, once gross is known.
 */
function resolveItemAmount(
  item: CompensationItemLike,
  basic: Decimal,
  gross: Decimal
): Decimal {
  const { calculationType } = item.component;

  if (calculationType === 'FIXED') {
    return new Decimal(item.amount?.toString() ?? 0);
  }

  const pct = new Decimal(item.percentage?.toString() ?? 0).div(100);
  if (calculationType === 'PERCENT_OF_BASIC') return basic.times(pct);
  return gross.times(pct);
}

/**
 * Compute payslips for every eligible staff member in a payroll period.
 *
 * Staff are skipped (not failed) when they have no current compensation record,
 * so a partially-configured payroll still produces a usable run with a clear
 * list of who was left out.
 */
export async function computePayrollRun(params: {
  year: number;
  month: number;
  startDate: Date;
  endDate: Date;
  staffIds?: string[];
}): Promise<PayrollRunSummary> {
  const { startDate, endDate, staffIds } = params;

  const config = await getConfigMany([
    'hr.workDays',
    'payroll.pensionEmployeeRate',
    'payroll.pensionEmployerRate',
    'payroll.nhfRate',
    'payroll.consolidatedReliefFixed',
    'payroll.consolidatedReliefPercent',
    'payroll.lopEnabled',
  ]);

  let workDays: number[];
  try {
    workDays = JSON.parse(config['hr.workDays']);
    if (!Array.isArray(workDays)) workDays = [1, 2, 3, 4, 5];
  } catch {
    workDays = [1, 2, 3, 4, 5];
  }

  const pensionEmployeeRate = Number(config['payroll.pensionEmployeeRate']) || 0;
  const pensionEmployerRate = Number(config['payroll.pensionEmployerRate']) || 0;
  const nhfRate = Number(config['payroll.nhfRate']) || 0;
  const reliefFixed = Number(config['payroll.consolidatedReliefFixed']) || 0;
  const reliefPercent = Number(config['payroll.consolidatedReliefPercent']) || 0;
  const lopEnabled = config['payroll.lopEnabled'] === 'true';

  // Holidays inside the period
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: startDate, lte: endDate }, isWorkingDay: false },
    select: { date: true },
  });
  const holidayDates = new Set(holidays.map((h) => h.date.toISOString().slice(0, 10)));

  const totalWorkingDays = countWorkingDays(startDate, endDate, workDays, holidayDates);

  // Eligible staff — active, not deleted, with a current compensation package
  const staff = await prisma.staff.findMany({
    where: {
      status: { in: ['ACTIVE', 'ON_LEAVE'] },
      isDeleted: false,
      ...(staffIds?.length ? { id: { in: staffIds } } : {}),
    },
    include: {
      grade: { select: { name: true } },
      compensations: {
        where: { isCurrent: true },
        include: {
          items: { include: { component: true } },
          grade: { select: { name: true } },
        },
        take: 1,
      },
    },
    orderBy: { employeeId: 'asc' },
  });

  // Unpaid absence days per staff for the period
  const absences = await prisma.attendance.groupBy({
    by: ['staffId'],
    where: { date: { gte: startDate, lte: endDate }, status: 'ABSENT' },
    _count: { _all: true },
  });
  const absenceByStaff = new Map(absences.map((a) => [a.staffId, a._count._all]));

  const presences = await prisma.attendance.groupBy({
    by: ['staffId'],
    where: {
      date: { gte: startDate, lte: endDate },
      status: { in: ['PRESENT', 'LATE', 'HALF_DAY'] },
    },
    _count: { _all: true },
  });
  const presenceByStaff = new Map(presences.map((p) => [p.staffId, p._count._all]));

  const payslips: ComputedPayslip[] = [];
  const skipped: Array<{ staffId: string; staffName: string; reason: string }> = [];

  for (const member of staff) {
    const staffName = `${member.firstName} ${member.lastName}`;
    const comp = member.compensations[0];

    if (!comp) {
      skipped.push({ staffId: member.id, staffName, reason: 'No active compensation package' });
      continue;
    }

    const basic = new Decimal(comp.basicSalary.toString());
    if (basic.lte(0)) {
      skipped.push({ staffId: member.id, staffName, reason: 'Basic salary is zero' });
      continue;
    }

    const items = comp.items as unknown as CompensationItemLike[];

    // Pass 1 — basic plus every earning that does not depend on gross.
    // This figure is the *base gross*: it is frozen here and every
    // PERCENT_OF_GROSS component resolves against it. Resolving against a
    // running total instead would make the result depend on component order
    // and let the line amounts drift from the gross they were derived from.
    const fixedEarnings = items.filter(
      (i) => i.component.type === 'EARNING' && i.component.calculationType !== 'PERCENT_OF_GROSS'
    );

    let baseGross = basic;
    for (const item of fixedEarnings) {
      baseGross = baseGross.plus(resolveItemAmount(item, basic, new Decimal(0)));
    }

    // Pass 2 — earnings expressed as a percentage of the frozen base gross.
    const grossPercentEarnings = items.filter(
      (i) => i.component.type === 'EARNING' && i.component.calculationType === 'PERCENT_OF_GROSS'
    );

    let gross = baseGross;
    for (const item of grossPercentEarnings) {
      gross = gross.plus(resolveItemAmount(item, basic, baseGross));
    }

    // ── Loss of pay ──
    const daysAbsent = absenceByStaff.get(member.id) ?? 0;
    const daysPresent = presenceByStaff.get(member.id) ?? 0;
    let lopDays = new Decimal(0);
    let lopAmount = new Decimal(0);

    if (lopEnabled && daysAbsent > 0 && totalWorkingDays > 0) {
      lopDays = new Decimal(daysAbsent);
      lopAmount = gross.div(totalWorkingDays).times(lopDays).toDecimalPlaces(2);
    }

    const grossAfterLop = gross.minus(lopAmount);

    // ── Build the payslip lines ──
    const lines: PayrollLine[] = [
      {
        componentCode: 'BASIC',
        componentName: 'Basic Salary',
        type: 'EARNING',
        amount: basic.toDecimalPlaces(2).toNumber(),
        glAccountCode: null,
        sortOrder: 0,
      },
    ];

    for (const item of [...fixedEarnings, ...grossPercentEarnings]) {
      const amount = resolveItemAmount(item, basic, baseGross).toDecimalPlaces(2);
      if (amount.lte(0)) continue;
      lines.push({
        componentCode: item.component.code,
        componentName: item.component.name,
        type: 'EARNING',
        amount: amount.toNumber(),
        glAccountCode: item.component.glAccountCode,
        sortOrder: item.component.sortOrder,
      });
    }

    if (lopAmount.gt(0)) {
      lines.push({
        componentCode: 'LOP',
        componentName: `Loss of Pay (${daysAbsent} day${daysAbsent === 1 ? '' : 's'})`,
        type: 'DEDUCTION',
        amount: lopAmount.toNumber(),
        glAccountCode: null,
        sortOrder: 900,
      });
    }

    // ── Statutory deductions ──
    // Pensionable pay = basic + any component flagged pensionable
    let pensionableBase = basic;
    for (const item of items) {
      if (item.component.type === 'EARNING' && item.component.isPensionable) {
        pensionableBase = pensionableBase.plus(resolveItemAmount(item, basic, baseGross));
      }
    }

    const employeePension = pensionableBase
      .times(pensionEmployeeRate)
      .div(100)
      .toDecimalPlaces(2);
    const employerPension = pensionableBase
      .times(pensionEmployerRate)
      .div(100)
      .toDecimalPlaces(2);
    const nhf = basic.times(nhfRate).div(100).toDecimalPlaces(2);

    if (employeePension.gt(0)) {
      lines.push({
        componentCode: 'PENSION_EE',
        componentName: 'Pension (Employee)',
        type: 'DEDUCTION',
        amount: employeePension.toNumber(),
        glAccountCode: null,
        sortOrder: 910,
      });
    }
    if (nhf.gt(0)) {
      lines.push({
        componentCode: 'NHF',
        componentName: 'National Housing Fund',
        type: 'DEDUCTION',
        amount: nhf.toNumber(),
        glAccountCode: null,
        sortOrder: 920,
      });
    }

    const paye = calculateMonthlyPAYE(
      grossAfterLop,
      employeePension.plus(nhf),
      reliefFixed,
      reliefPercent
    );
    if (paye.gt(0)) {
      lines.push({
        componentCode: 'PAYE',
        componentName: 'PAYE Tax',
        type: 'DEDUCTION',
        amount: paye.toNumber(),
        glAccountCode: null,
        sortOrder: 930,
      });
    }

    // ── Non-statutory deductions from the package ──
    for (const item of items) {
      if (item.component.type !== 'DEDUCTION') continue;
      const amount = resolveItemAmount(item, basic, baseGross).toDecimalPlaces(2);
      if (amount.lte(0)) continue;
      lines.push({
        componentCode: item.component.code,
        componentName: item.component.name,
        type: 'DEDUCTION',
        amount: amount.toNumber(),
        glAccountCode: item.component.glAccountCode,
        sortOrder: item.component.sortOrder + 940,
      });
    }

    // ── Employer contributions (cost to company, not deducted from pay) ──
    if (employerPension.gt(0)) {
      lines.push({
        componentCode: 'PENSION_ER',
        componentName: 'Pension (Employer)',
        type: 'EMPLOYER_CONTRIBUTION',
        amount: employerPension.toNumber(),
        glAccountCode: null,
        sortOrder: 950,
      });
    }
    for (const item of items) {
      if (item.component.type !== 'EMPLOYER_CONTRIBUTION') continue;
      const amount = resolveItemAmount(item, basic, baseGross).toDecimalPlaces(2);
      if (amount.lte(0)) continue;
      lines.push({
        componentCode: item.component.code,
        componentName: item.component.name,
        type: 'EMPLOYER_CONTRIBUTION',
        amount: amount.toNumber(),
        glAccountCode: item.component.glAccountCode,
        sortOrder: item.component.sortOrder + 960,
      });
    }

    // ── Totals ──
    const totalEarnings = lines
      .filter((l) => l.type === 'EARNING')
      .reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
    const totalDeductions = lines
      .filter((l) => l.type === 'DEDUCTION')
      .reduce((sum, l) => sum.plus(l.amount), new Decimal(0));
    const employerContributions = lines
      .filter((l) => l.type === 'EMPLOYER_CONTRIBUTION')
      .reduce((sum, l) => sum.plus(l.amount), new Decimal(0));

    const netPay = totalEarnings.minus(totalDeductions).toDecimalPlaces(2);

    payslips.push({
      staffId: member.id,
      employeeId: member.employeeId,
      staffName,
      jobTitle: member.jobTitle,
      gradeName: comp.grade?.name ?? member.grade?.name ?? null,
      bankName: member.bankName,
      bankAccountNumber: member.bankAccountNumber,

      basicSalary: basic.toDecimalPlaces(2).toNumber(),
      grossEarnings: totalEarnings.toDecimalPlaces(2).toNumber(),
      totalDeductions: totalDeductions.toDecimalPlaces(2).toNumber(),
      netPay: netPay.toNumber(),
      employerCost: employerContributions.toDecimalPlaces(2).toNumber(),

      workingDays: totalWorkingDays,
      daysPresent,
      daysAbsent,
      lopDays: lopDays.toNumber(),
      lopAmount: lopAmount.toNumber(),

      lines: lines.sort((a, b) => a.sortOrder - b.sortOrder),
    });
  }

  const totals = payslips.reduce(
    (acc, p) => ({
      gross: acc.gross.plus(p.grossEarnings),
      deductions: acc.deductions.plus(p.totalDeductions),
      net: acc.net.plus(p.netPay),
      employer: acc.employer.plus(p.employerCost),
    }),
    { gross: new Decimal(0), deductions: new Decimal(0), net: new Decimal(0), employer: new Decimal(0) }
  );

  return {
    payslips,
    staffCount: payslips.length,
    totalGross: totals.gross.toDecimalPlaces(2).toNumber(),
    totalDeductions: totals.deductions.toDecimalPlaces(2).toNumber(),
    totalNet: totals.net.toDecimalPlaces(2).toNumber(),
    totalEmployerCost: totals.employer.toDecimalPlaces(2).toNumber(),
    skipped,
  };
}
