'use server';

/**
 * Payroll — Server Actions
 * Hylink Finance Limited EMS
 *
 * Salary packages, payroll runs, payslips and the general-ledger posting that
 * ties payroll into the same double-entry books as every other module.
 *
 * A payroll period moves DRAFT → PENDING_APPROVAL → APPROVED → PAID.
 * Payslips are recomputed on every processing pass while the period is still
 * open, and frozen once it is approved.
 */

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission, requireAnyPermission, getSession } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';
import { computePayrollRun } from '@/lib/payroll-engine';
import { createJournalEntry, getAccountByCode } from '@/lib/accounting-engine';
import { getConfigNumber } from '@/lib/system-config';
import type { ActionResult, JournalLineInput } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

// GL account codes used by the payroll accrual entry.
// 5110 is the existing Salaries & Wages expense account; the 22xx payables are
// seeded under the Other Liabilities header for payroll settlement.
const GL = {
  SALARY_EXPENSE: '5110',
  SALARY_PAYABLE: '2210',
  PAYE_PAYABLE: '2220',
  PENSION_PAYABLE: '2230',
};

// ============================================================================
// COMPENSATION PACKAGES
// ============================================================================

export async function getStaffCompensation(staffId: string) {
  const { user } = await getSession();

  // Staff may always read their own package; otherwise payroll rights are needed.
  if (staffId !== user.id) {
    await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:PAYROLL_READ']);
  }

  const compensations = await prisma.staffCompensation.findMany({
    where: { staffId },
    orderBy: { effectiveFrom: 'desc' },
    include: {
      grade: { select: { id: true, code: true, name: true } },
      createdBy: { select: { firstName: true, lastName: true } },
      items: {
        include: {
          component: {
            select: {
              id: true,
              code: true,
              name: true,
              type: true,
              calculationType: true,
              isPensionable: true,
            },
          },
        },
      },
    },
  });

  return compensations.map((c) => ({
    id: c.id,
    basicSalary: Number(c.basicSalary),
    currency: c.currency,
    payFrequency: c.payFrequency,
    effectiveFrom: c.effectiveFrom,
    effectiveTo: c.effectiveTo,
    isCurrent: c.isCurrent,
    reason: c.reason,
    grade: c.grade,
    createdBy: `${c.createdBy.firstName} ${c.createdBy.lastName}`,
    createdAt: c.createdAt,
    items: c.items.map((i) => ({
      id: i.id,
      componentId: i.componentId,
      code: i.component.code,
      name: i.component.name,
      type: i.component.type,
      calculationType: i.component.calculationType,
      isPensionable: i.component.isPensionable,
      amount: i.amount ? Number(i.amount) : null,
      percentage: i.percentage ? Number(i.percentage) : null,
    })),
  }));
}

/**
 * Set a staff member's salary package. The previous current package is closed
 * off the day before the new one takes effect, preserving a full history.
 */
export async function setStaffCompensation(data: {
  staffId: string;
  gradeId?: string;
  basicSalary: number;
  effectiveFrom: string;
  reason?: string;
  items: Array<{ componentId: string; amount?: number; percentage?: number }>;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:PAYROLL_MANAGE');

    if (data.basicSalary <= 0) return { success: false, error: 'Basic salary must be greater than zero' };

    const effectiveFrom = new Date(data.effectiveFrom);
    if (Number.isNaN(effectiveFrom.getTime())) {
      return { success: false, error: 'Enter a valid effective date' };
    }
    effectiveFrom.setHours(0, 0, 0, 0);

    const staff = await prisma.staff.findUnique({
      where: { id: data.staffId },
      select: { id: true, firstName: true, lastName: true, isDeleted: true },
    });
    if (!staff || staff.isDeleted) return { success: false, error: 'Staff not found' };

    // Validate the grade band, if one is set.
    if (data.gradeId) {
      const grade = await prisma.salaryGrade.findUnique({ where: { id: data.gradeId } });
      if (!grade) return { success: false, error: 'Salary grade not found' };
      if (!grade.isActive) return { success: false, error: `Grade ${grade.name} is inactive` };
    }

    // Validate every component reference and its value shape.
    const componentIds = data.items.map((i) => i.componentId);
    if (new Set(componentIds).size !== componentIds.length) {
      return { success: false, error: 'The same component appears more than once' };
    }

    const components = await prisma.payrollComponent.findMany({
      where: { id: { in: componentIds } },
    });
    if (components.length !== componentIds.length) {
      return { success: false, error: 'One or more components could not be found' };
    }
    const componentById = new Map(components.map((c) => [c.id, c]));

    for (const item of data.items) {
      const component = componentById.get(item.componentId)!;
      if (!component.isActive) {
        return { success: false, error: `Component ${component.name} is inactive` };
      }
      if (component.calculationType === 'FIXED') {
        if (item.amount === undefined || item.amount < 0) {
          return { success: false, error: `${component.name} needs a non-negative amount` };
        }
      } else {
        if (item.percentage === undefined || item.percentage < 0 || item.percentage > 100) {
          return { success: false, error: `${component.name} needs a percentage between 0 and 100` };
        }
      }
    }

    const existingCurrent = await prisma.staffCompensation.findFirst({
      where: { staffId: data.staffId, isCurrent: true },
    });

    if (existingCurrent && effectiveFrom <= existingCurrent.effectiveFrom) {
      return {
        success: false,
        error: `The new package must start after the current one (${existingCurrent.effectiveFrom.toISOString().slice(0, 10)})`,
      };
    }

    const compensation = await withTransaction(async (tx) => {
      if (existingCurrent) {
        const closeOn = new Date(effectiveFrom);
        closeOn.setDate(closeOn.getDate() - 1);
        await tx.staffCompensation.update({
          where: { id: existingCurrent.id },
          data: { isCurrent: false, effectiveTo: closeOn },
        });
      }

      return tx.staffCompensation.create({
        data: {
          staffId: data.staffId,
          gradeId: data.gradeId || null,
          basicSalary: data.basicSalary,
          effectiveFrom,
          isCurrent: true,
          reason: data.reason?.trim() || null,
          createdById: user.id,
          items: {
            create: data.items.map((item) => ({
              componentId: item.componentId,
              amount: item.amount ?? null,
              percentage: item.percentage ?? null,
            })),
          },
        },
      });
    });

    // Keep the staff record's grade in step with the package.
    if (data.gradeId) {
      await prisma.staff.update({ where: { id: data.staffId }, data: { gradeId: data.gradeId } });
    }

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'STAFF_COMPENSATION',
      entityId: compensation.id,
      description: `Set salary package for ${staff.firstName} ${staff.lastName}: basic ${data.basicSalary} effective ${effectiveFrom.toISOString().slice(0, 10)}`,
      oldValues: existingCurrent ? { basicSalary: Number(existingCurrent.basicSalary) } : undefined,
      newValues: { basicSalary: data.basicSalary, itemCount: data.items.length },
    });

    return {
      success: true,
      message: `Salary package set for ${staff.firstName} ${staff.lastName}`,
      data: { id: compensation.id },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Staff with and without a current package — the payroll readiness view. */
export async function getCompensationCoverage() {
  await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:PAYROLL_READ']);

  const staff = await prisma.staff.findMany({
    where: { status: { in: ['ACTIVE', 'ON_LEAVE'] }, isDeleted: false },
    orderBy: { employeeId: 'asc' },
    select: {
      id: true,
      employeeId: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      bankName: true,
      bankAccountNumber: true,
      department: { select: { name: true } },
      grade: { select: { name: true } },
      compensations: {
        where: { isCurrent: true },
        select: { id: true, basicSalary: true, effectiveFrom: true },
        take: 1,
      },
    },
  });

  return staff.map((s) => ({
    id: s.id,
    employeeId: s.employeeId,
    name: `${s.firstName} ${s.lastName}`,
    jobTitle: s.jobTitle,
    department: s.department.name,
    grade: s.grade?.name ?? null,
    hasBankDetails: Boolean(s.bankName && s.bankAccountNumber),
    hasCompensation: s.compensations.length > 0,
    basicSalary: s.compensations[0] ? Number(s.compensations[0].basicSalary) : null,
    effectiveFrom: s.compensations[0]?.effectiveFrom ?? null,
  }));
}

// ============================================================================
// PAYROLL PERIODS
// ============================================================================

export async function getPayrollPeriods(limit = 24) {
  await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:PAYROLL_READ']);

  const periods = await prisma.payrollPeriod.findMany({
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
    take: limit,
    include: {
      processedBy: { select: { firstName: true, lastName: true } },
      approvedBy: { select: { firstName: true, lastName: true } },
      _count: { select: { payslips: true } },
    },
  });

  return periods.map((p) => ({
    id: p.id,
    code: p.code,
    year: p.year,
    month: p.month,
    startDate: p.startDate,
    endDate: p.endDate,
    payDate: p.payDate,
    status: p.status,
    staffCount: p.staffCount,
    totalGross: Number(p.totalGross),
    totalDeductions: Number(p.totalDeductions),
    totalNet: Number(p.totalNet),
    totalEmployerCost: Number(p.totalEmployerCost),
    payslipCount: p._count.payslips,
    processedBy: p.processedBy ? `${p.processedBy.firstName} ${p.processedBy.lastName}` : null,
    processedAt: p.processedAt,
    approvedBy: p.approvedBy ? `${p.approvedBy.firstName} ${p.approvedBy.lastName}` : null,
    approvedAt: p.approvedAt,
    paidAt: p.paidAt,
    journalEntryId: p.journalEntryId,
    notes: p.notes,
  }));
}

export async function createPayrollPeriod(data: {
  year: number;
  month: number;
  payDate?: string;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requirePermission('HR:PAYROLL_MANAGE');

    if (data.month < 1 || data.month > 12) return { success: false, error: 'Month must be between 1 and 12' };
    if (data.year < 2000 || data.year > 2100) return { success: false, error: 'Enter a valid year' };

    const existing = await prisma.payrollPeriod.findUnique({
      where: { year_month: { year: data.year, month: data.month } },
    });
    if (existing) {
      return { success: false, error: `A payroll period already exists for ${data.year}-${String(data.month).padStart(2, '0')}` };
    }

    const startDate = new Date(data.year, data.month - 1, 1);
    const endDate = new Date(data.year, data.month, 0);

    let payDate: Date;
    if (data.payDate) {
      payDate = new Date(data.payDate);
      if (Number.isNaN(payDate.getTime())) return { success: false, error: 'Enter a valid pay date' };
    } else {
      const payDay = await getConfigNumber('payroll.payDayOfMonth');
      payDate = new Date(data.year, data.month - 1, Math.min(payDay || 25, endDate.getDate()));
    }
    payDate.setHours(0, 0, 0, 0);

    const period = await prisma.payrollPeriod.create({
      data: {
        code: `${data.year}-${String(data.month).padStart(2, '0')}`,
        year: data.year,
        month: data.month,
        startDate,
        endDate,
        payDate,
        status: 'DRAFT',
        notes: data.notes?.trim() || null,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'PAYROLL_PERIOD',
      entityId: period.id,
      description: `Opened payroll period ${period.code}`,
    });

    return { success: true, message: `Payroll period ${period.code} opened`, data: { id: period.id } };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Compute (or recompute) every payslip in a period. Safe to run repeatedly
 * while the period is open — existing payslips are replaced.
 */
export async function processPayrollPeriod(
  periodId: string
): Promise<ActionResult<{ staffCount: number; totalNet: number; skipped: number }>> {
  try {
    const user = await requirePermission('HR:PAYROLL_MANAGE');

    const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) return { success: false, error: 'Payroll period not found' };
    if (!['DRAFT', 'PROCESSING', 'PENDING_APPROVAL'].includes(period.status)) {
      return {
        success: false,
        error: `Cannot process a period that is ${period.status}. Only open periods can be recalculated.`,
      };
    }

    const run = await computePayrollRun({
      year: period.year,
      month: period.month,
      startDate: period.startDate,
      endDate: period.endDate,
    });

    if (run.payslips.length === 0) {
      return {
        success: false,
        error:
          run.skipped.length > 0
            ? `No payslips could be generated. ${run.skipped.length} staff member(s) have no salary package configured.`
            : 'No eligible staff found for this period',
      };
    }

    // Numbering is sequential within the period so payslip numbers stay readable.
    await withTransaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { payrollPeriodId: periodId } });

      let sequence = 1;
      for (const slip of run.payslips) {
        const payslipNumber = `PS${period.code.replace('-', '')}${String(sequence).padStart(4, '0')}`;
        sequence++;

        await tx.payslip.create({
          data: {
            payslipNumber,
            payrollPeriodId: periodId,
            staffId: slip.staffId,
            basicSalary: slip.basicSalary,
            grossEarnings: slip.grossEarnings,
            totalDeductions: slip.totalDeductions,
            netPay: slip.netPay,
            employerCost: slip.employerCost,
            workingDays: slip.workingDays,
            daysPresent: slip.daysPresent,
            daysAbsent: slip.daysAbsent,
            lopDays: slip.lopDays,
            lopAmount: slip.lopAmount,
            bankName: slip.bankName,
            bankAccountNumber: slip.bankAccountNumber,
            gradeName: slip.gradeName,
            jobTitle: slip.jobTitle,
            lines: {
              create: slip.lines.map((line) => ({
                componentCode: line.componentCode,
                componentName: line.componentName,
                type: line.type,
                amount: line.amount,
                glAccountCode: line.glAccountCode,
                sortOrder: line.sortOrder,
              })),
            },
          },
        });
      }

      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: 'PENDING_APPROVAL',
          staffCount: run.staffCount,
          totalGross: run.totalGross,
          totalDeductions: run.totalDeductions,
          totalNet: run.totalNet,
          totalEmployerCost: run.totalEmployerCost,
          processedById: user.id,
          processedAt: new Date(),
        },
      });
    });

    await auditLog({
      userId: user.id,
      action: 'CREATE',
      module: 'HR',
      entityType: 'PAYROLL_PERIOD',
      entityId: periodId,
      description: `Processed payroll ${period.code}: ${run.staffCount} payslips, net ${run.totalNet}`,
      metadata: {
        staffCount: run.staffCount,
        totalGross: run.totalGross,
        totalNet: run.totalNet,
        skipped: run.skipped.length,
      },
    });

    // Notify approvers that a run is waiting.
    const approvers = await prisma.staff.findMany({
      where: {
        status: 'ACTIVE',
        role: { permissions: { some: { permission: { code: 'HR:PAYROLL_APPROVE' } } } },
      },
      select: { id: true },
    });
    for (const approver of approvers) {
      await createNotification({
        userId: approver.id,
        type: 'APPROVAL_REQUIRED',
        title: `Payroll ${period.code} awaiting approval`,
        message: `${run.staffCount} payslips totalling a net ${run.totalNet.toLocaleString()} are ready for review.`,
        entityType: 'PAYROLL_PERIOD',
        entityId: periodId,
        actionUrl: `/hr/payroll/${periodId}`,
      });
    }

    return {
      success: true,
      message:
        run.skipped.length > 0
          ? `${run.staffCount} payslip(s) generated. ${run.skipped.length} staff skipped — no salary package.`
          : `${run.staffCount} payslip(s) generated`,
      data: { staffCount: run.staffCount, totalNet: run.totalNet, skipped: run.skipped.length },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/** Preview a run without persisting anything. */
export async function previewPayrollPeriod(periodId: string) {
  await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:PAYROLL_READ']);

  const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
  if (!period) throw new Error('Payroll period not found');

  const run = await computePayrollRun({
    year: period.year,
    month: period.month,
    startDate: period.startDate,
    endDate: period.endDate,
  });

  return {
    periodCode: period.code,
    staffCount: run.staffCount,
    totalGross: run.totalGross,
    totalDeductions: run.totalDeductions,
    totalNet: run.totalNet,
    totalEmployerCost: run.totalEmployerCost,
    skipped: run.skipped,
    payslips: run.payslips.map((p) => ({
      staffId: p.staffId,
      employeeId: p.employeeId,
      staffName: p.staffName,
      basicSalary: p.basicSalary,
      grossEarnings: p.grossEarnings,
      totalDeductions: p.totalDeductions,
      netPay: p.netPay,
      daysAbsent: p.daysAbsent,
      lopAmount: p.lopAmount,
    })),
  };
}

/**
 * Approve a processed run and post the payroll accrual to the general ledger.
 *
 *   Dr Salary Expense        gross + employer contributions
 *     Cr PAYE Payable        tax withheld
 *     Cr Pension Payable     employee + employer pension
 *     Cr Salary Payable      net pay owed to staff
 */
export async function approvePayrollPeriod(
  periodId: string,
  postToLedger = true
): Promise<ActionResult<{ journalEntryId: string | null }>> {
  try {
    const user = await requirePermission('HR:PAYROLL_APPROVE');

    const period = await prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: { payslips: { include: { lines: true } } },
    });
    if (!period) return { success: false, error: 'Payroll period not found' };
    if (period.status !== 'PENDING_APPROVAL') {
      return { success: false, error: `Only a period pending approval can be approved (currently ${period.status})` };
    }
    if (period.payslips.length === 0) {
      return { success: false, error: 'This period has no payslips. Process it first.' };
    }
    if (period.processedById === user.id) {
      return { success: false, error: 'Payroll must be approved by someone other than the person who processed it' };
    }

    // Aggregate the statutory buckets across every payslip.
    let paye = new Decimal(0);
    let pension = new Decimal(0);
    for (const slip of period.payslips) {
      for (const line of slip.lines) {
        if (line.componentCode === 'PAYE') paye = paye.plus(line.amount.toString());
        if (line.componentCode === 'PENSION_EE' || line.componentCode === 'PENSION_ER') {
          pension = pension.plus(line.amount.toString());
        }
      }
    }

    const netPay = new Decimal(period.totalNet.toString());
    const employerCost = new Decimal(period.totalEmployerCost.toString());
    const grossExpense = new Decimal(period.totalGross.toString()).plus(employerCost);

    // Other deductions (loans, unions, LOP …) net back against the expense so
    // the entry balances without inventing an account per deduction type.
    const otherDeductions = grossExpense.minus(paye).minus(pension).minus(netPay);

    let journalEntryId: string | null = null;

    if (postToLedger) {
      const [expenseAccount, salaryPayable, payePayable, pensionPayable] = await Promise.all([
        getAccountByCode(GL.SALARY_EXPENSE),
        getAccountByCode(GL.SALARY_PAYABLE),
        getAccountByCode(GL.PAYE_PAYABLE),
        getAccountByCode(GL.PENSION_PAYABLE),
      ]);

      const missing = [
        !expenseAccount && GL.SALARY_EXPENSE,
        !salaryPayable && GL.SALARY_PAYABLE,
        !payePayable && GL.PAYE_PAYABLE,
        !pensionPayable && GL.PENSION_PAYABLE,
      ].filter(Boolean);

      if (missing.length > 0) {
        return {
          success: false,
          error: `Payroll cannot be posted — missing GL account(s): ${missing.join(', ')}. Create them in the Chart of Accounts, or approve without posting.`,
        };
      }

      const lines: JournalLineInput[] = [
        {
          accountId: expenseAccount!.id,
          debitAmount: grossExpense.toDecimalPlaces(2).toNumber(),
          description: `Payroll expense ${period.code}`,
        },
      ];

      if (paye.gt(0)) {
        lines.push({
          accountId: payePayable!.id,
          creditAmount: paye.toDecimalPlaces(2).toNumber(),
          description: `PAYE withheld ${period.code}`,
        });
      }
      if (pension.gt(0)) {
        lines.push({
          accountId: pensionPayable!.id,
          creditAmount: pension.toDecimalPlaces(2).toNumber(),
          description: `Pension contributions ${period.code}`,
        });
      }
      // Non-statutory deductions are held against salary payable until settled.
      if (otherDeductions.gt(0)) {
        lines.push({
          accountId: salaryPayable!.id,
          creditAmount: otherDeductions.toDecimalPlaces(2).toNumber(),
          description: `Other payroll deductions ${period.code}`,
        });
      }
      lines.push({
        accountId: salaryPayable!.id,
        creditAmount: netPay.toDecimalPlaces(2).toNumber(),
        description: `Net salaries payable ${period.code}`,
      });

      const entry = await createJournalEntry({
        entryDate: period.payDate,
        entryType: 'ACCRUAL',
        description: `Payroll accrual for ${period.code} — ${period.staffCount} staff`,
        narration: `Monthly payroll: gross ${Number(period.totalGross)}, deductions ${Number(period.totalDeductions)}, net ${netPay.toNumber()}`,
        sourceModule: 'HR',
        sourceType: 'PAYROLL_PERIOD',
        sourceId: periodId,
        lines,
        createdById: user.id,
      });

      journalEntryId = entry.id;
    }

    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: 'APPROVED',
        approvedById: user.id,
        approvedAt: new Date(),
        journalEntryId,
      },
    });

    await auditLog({
      userId: user.id,
      action: 'APPROVE',
      module: 'HR',
      entityType: 'PAYROLL_PERIOD',
      entityId: periodId,
      description: `Approved payroll ${period.code}: ${period.staffCount} staff, net ${Number(period.totalNet)}${journalEntryId ? ` (journal ${journalEntryId})` : ' (not posted)'}`,
      metadata: {
        paye: paye.toNumber(),
        pension: pension.toNumber(),
        netPay: netPay.toNumber(),
        journalEntryId,
      },
    });

    // Tell staff their payslip is ready.
    for (const slip of period.payslips) {
      await createNotification({
        userId: slip.staffId,
        type: 'INFO',
        title: `Payslip available for ${period.code}`,
        message: `Your payslip for ${period.code} has been approved. Net pay: ${Number(slip.netPay).toLocaleString()}.`,
        entityType: 'PAYSLIP',
        entityId: slip.id,
        actionUrl: '/hr/my-payslips',
        email: false,
      });
    }

    return {
      success: true,
      message: journalEntryId
        ? `Payroll ${period.code} approved and posted to the ledger`
        : `Payroll ${period.code} approved (not posted to the ledger)`,
      data: { journalEntryId },
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function markPayrollPaid(periodId: string): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:PAYROLL_APPROVE');

    const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) return { success: false, error: 'Payroll period not found' };
    if (period.status !== 'APPROVED') {
      return { success: false, error: `Only an approved period can be marked paid (currently ${period.status})` };
    }

    await prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: 'PAID', paidAt: new Date() },
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'PAYROLL_PERIOD',
      entityId: periodId,
      description: `Marked payroll ${period.code} as paid (net ${Number(period.totalNet)})`,
    });

    return { success: true, message: `Payroll ${period.code} marked as paid` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function cancelPayrollPeriod(
  periodId: string,
  reason: string
): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:PAYROLL_APPROVE');

    if (!reason.trim()) return { success: false, error: 'A reason is required to cancel a payroll run' };

    const period = await prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) return { success: false, error: 'Payroll period not found' };
    if (period.status === 'PAID') {
      return { success: false, error: 'A paid payroll cannot be cancelled. Reverse the journal entry instead.' };
    }
    if (period.status === 'CANCELLED') return { success: false, error: 'This period is already cancelled' };

    await withTransaction(async (tx) => {
      await tx.payslip.deleteMany({ where: { payrollPeriodId: periodId } });
      await tx.payrollPeriod.update({
        where: { id: periodId },
        data: {
          status: 'CANCELLED',
          notes: `${period.notes ? `${period.notes}\n` : ''}Cancelled: ${reason.trim()}`,
          staffCount: 0,
          totalGross: 0,
          totalDeductions: 0,
          totalNet: 0,
          totalEmployerCost: 0,
        },
      });
    });

    await auditLog({
      userId: user.id,
      action: 'UPDATE',
      module: 'HR',
      entityType: 'PAYROLL_PERIOD',
      entityId: periodId,
      description: `Cancelled payroll ${period.code}: ${reason.trim()}`,
    });

    return { success: true, message: `Payroll ${period.code} cancelled` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// ============================================================================
// PAYSLIPS
// ============================================================================

export async function getPayslips(periodId: string) {
  await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:PAYROLL_READ']);

  const payslips = await prisma.payslip.findMany({
    where: { payrollPeriodId: periodId },
    orderBy: { payslipNumber: 'asc' },
    include: {
      staff: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          department: { select: { name: true } },
        },
      },
    },
  });

  return payslips.map((p) => ({
    id: p.id,
    payslipNumber: p.payslipNumber,
    staffId: p.staffId,
    employeeId: p.staff.employeeId,
    staffName: `${p.staff.firstName} ${p.staff.lastName}`,
    department: p.staff.department.name,
    jobTitle: p.jobTitle,
    gradeName: p.gradeName,
    basicSalary: Number(p.basicSalary),
    grossEarnings: Number(p.grossEarnings),
    totalDeductions: Number(p.totalDeductions),
    netPay: Number(p.netPay),
    employerCost: Number(p.employerCost),
    daysAbsent: p.daysAbsent,
    lopAmount: Number(p.lopAmount),
    bankName: p.bankName,
    bankAccountNumber: p.bankAccountNumber,
  }));
}

export async function getPayslipDetail(payslipId: string) {
  const { user } = await getSession();

  const payslip = await prisma.payslip.findUnique({
    where: { id: payslipId },
    include: {
      lines: { orderBy: { sortOrder: 'asc' } },
      period: { select: { code: true, startDate: true, endDate: true, payDate: true, status: true } },
      staff: {
        select: {
          employeeId: true,
          firstName: true,
          lastName: true,
          email: true,
          jobTitle: true,
          pensionPin: true,
          taxId: true,
          department: { select: { name: true } },
          branch: { select: { name: true } },
        },
      },
    },
  });

  if (!payslip) throw new Error('Payslip not found');

  // A staff member may always read their own payslip.
  if (payslip.staffId !== user.id) {
    await requireAnyPermission(['HR:PAYROLL_MANAGE', 'HR:PAYROLL_READ']);
  }

  return {
    id: payslip.id,
    payslipNumber: payslip.payslipNumber,
    period: payslip.period,
    staff: {
      employeeId: payslip.staff.employeeId,
      name: `${payslip.staff.firstName} ${payslip.staff.lastName}`,
      email: payslip.staff.email,
      jobTitle: payslip.jobTitle ?? payslip.staff.jobTitle,
      department: payslip.staff.department.name,
      branch: payslip.staff.branch?.name ?? null,
      pensionPin: payslip.staff.pensionPin,
      taxId: payslip.staff.taxId,
    },
    gradeName: payslip.gradeName,
    bankName: payslip.bankName,
    bankAccountNumber: payslip.bankAccountNumber,
    basicSalary: Number(payslip.basicSalary),
    grossEarnings: Number(payslip.grossEarnings),
    totalDeductions: Number(payslip.totalDeductions),
    netPay: Number(payslip.netPay),
    employerCost: Number(payslip.employerCost),
    workingDays: payslip.workingDays,
    daysPresent: payslip.daysPresent,
    daysAbsent: payslip.daysAbsent,
    lopDays: Number(payslip.lopDays),
    lopAmount: Number(payslip.lopAmount),
    earnings: payslip.lines
      .filter((l) => l.type === 'EARNING')
      .map((l) => ({ code: l.componentCode, name: l.componentName, amount: Number(l.amount) })),
    deductions: payslip.lines
      .filter((l) => l.type === 'DEDUCTION')
      .map((l) => ({ code: l.componentCode, name: l.componentName, amount: Number(l.amount) })),
    employerContributions: payslip.lines
      .filter((l) => l.type === 'EMPLOYER_CONTRIBUTION')
      .map((l) => ({ code: l.componentCode, name: l.componentName, amount: Number(l.amount) })),
  };
}

/** The signed-in staff member's own payslip history. */
export async function getMyPayslips() {
  const { user } = await getSession();

  const payslips = await prisma.payslip.findMany({
    where: {
      staffId: user.id,
      period: { status: { in: ['APPROVED', 'PAID'] } },
    },
    orderBy: { createdAt: 'desc' },
    include: { period: { select: { code: true, payDate: true, status: true } } },
  });

  return payslips.map((p) => ({
    id: p.id,
    payslipNumber: p.payslipNumber,
    periodCode: p.period.code,
    payDate: p.period.payDate,
    status: p.period.status,
    grossEarnings: Number(p.grossEarnings),
    totalDeductions: Number(p.totalDeductions),
    netPay: Number(p.netPay),
  }));
}

/** Bank transfer schedule for an approved run. */
export async function getPayrollBankSchedule(periodId: string) {
  await requirePermission('HR:PAYROLL_MANAGE');

  const period = await prisma.payrollPeriod.findUnique({
    where: { id: periodId },
    select: { code: true, status: true, payDate: true },
  });
  if (!period) throw new Error('Payroll period not found');

  const payslips = await prisma.payslip.findMany({
    where: { payrollPeriodId: periodId },
    orderBy: { payslipNumber: 'asc' },
    include: { staff: { select: { employeeId: true, firstName: true, lastName: true } } },
  });

  const rows = payslips.map((p) => ({
    employeeId: p.staff.employeeId,
    name: `${p.staff.firstName} ${p.staff.lastName}`,
    bankName: p.bankName,
    accountNumber: p.bankAccountNumber,
    amount: Number(p.netPay),
    hasBankDetails: Boolean(p.bankName && p.bankAccountNumber),
  }));

  return {
    periodCode: period.code,
    status: period.status,
    payDate: period.payDate,
    rows,
    totalAmount: rows.reduce((sum, r) => sum + r.amount, 0),
    missingBankDetails: rows.filter((r) => !r.hasBankDetails).length,
  };
}
