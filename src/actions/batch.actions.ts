'use server';

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
import { isWorkingDay } from '@/lib/attendance-engine';
import type { ActionResult } from '@/types';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export async function markOverdueLoans(): Promise<ActionResult> {
  try {
    const user = await requirePermission('LOANS:MANAGE_ALL');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Find active loans with overdue schedules
    const overdueSchedules = await prisma.loanSchedule.findMany({
      where: {
        status: { in: ['PENDING', 'PARTIAL'] },
        dueDate: { lt: today },
        loan: { status: 'ACTIVE' },
      },
      select: { loanId: true },
      distinct: ['loanId'],
    });

    const loanIds = overdueSchedules.map((s) => s.loanId);

    if (loanIds.length > 0) {
      await prisma.loan.updateMany({
        where: { id: { in: loanIds } },
        data: { status: 'OVERDUE' },
      });
    }

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'LOANS', entityType: 'LOAN',
      description: `Marked ${loanIds.length} loans as overdue`,
    });

    return { success: true, message: `${loanIds.length} loans marked as overdue` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function accrueFixedDepositInterest(): Promise<ActionResult> {
  try {
    const user = await requirePermission('FIXED_DEPOSITS:READ');

    const activeFDs = await prisma.fixedDeposit.findMany({
      where: { status: 'ACTIVE' },
    });

    let updated = 0;

    await withTransaction(async (tx) => {
      for (const fd of activeFDs) {
        const daysHeld = Math.floor((new Date().getTime() - fd.startDate.getTime()) / (1000 * 60 * 60 * 24));
        const accrued = new Decimal(fd.principalAmount.toString())
          .times(fd.interestRate.toString())
          .times(daysHeld)
          .div(365)
          .div(100)
          .toDecimalPlaces(2);

        await tx.fixedDeposit.update({
          where: { id: fd.id },
          data: { accruedInterest: accrued.toNumber(), lastAccrualDate: new Date() },
        });
        updated++;
      }
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'FIXED_DEPOSITS', entityType: 'FIXED_DEPOSIT',
      description: `Accrued interest for ${updated} fixed deposits`,
    });

    return { success: true, message: `Interest accrued for ${updated} fixed deposits` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function markAbsentees(): Promise<ActionResult> {
  try {
    const user = await requirePermission('HR:STAFF_UPDATE');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Never mark absence on a company holiday — payroll prices ABSENT days as
    // loss of pay, so a holiday run would dock everyone a day.
    const holiday = await prisma.holiday.findFirst({
      where: { date: today, isWorkingDay: false },
    });
    if (holiday) {
      return {
        success: true,
        message: `No absentees marked — ${holiday.name} is a company holiday`,
      };
    }

    const activeStaff = await prisma.staff.findMany({
      where: { status: 'ACTIVE', isDeleted: false },
      select: { id: true },
    });

    // Staff already on approved leave today are on leave, not absent.
    const onLeave = await prisma.leaveRequest.findMany({
      where: { status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } },
      select: { staffId: true },
    });
    const onLeaveIds = new Set(onLeave.map((l) => l.staffId));

    const attendanceToday = await prisma.attendance.findMany({
      where: { date: today },
      select: { staffId: true },
    });
    const attendedIds = new Set(attendanceToday.map((a) => a.staffId));

    // Absence is only meaningful on a day the staff member was rostered to work,
    // so each remaining candidate is checked against their own shift calendar.
    const candidates = activeStaff.filter(
      (s) => !attendedIds.has(s.id) && !onLeaveIds.has(s.id)
    );

    const absentStaff: Array<{ id: string }> = [];
    for (const staff of candidates) {
      if (await isWorkingDay(staff.id, today)) absentStaff.push(staff);
    }

    // Record the leave-takers as ON_LEAVE so the day is accounted for either way.
    const leaveToRecord = activeStaff.filter(
      (s) => onLeaveIds.has(s.id) && !attendedIds.has(s.id)
    );

    await withTransaction(async (tx) => {
      for (const staff of absentStaff) {
        await tx.attendance.create({
          data: { staffId: staff.id, date: today, status: 'ABSENT' },
        });
      }
      for (const staff of leaveToRecord) {
        await tx.attendance.create({
          data: { staffId: staff.id, date: today, status: 'ON_LEAVE' },
        });
      }
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR', entityType: 'ATTENDANCE',
      description: `Marked ${absentStaff.length} staff absent and ${leaveToRecord.length} on leave`,
      metadata: { absent: absentStaff.length, onLeave: leaveToRecord.length },
    });

    return {
      success: true,
      message: `${absentStaff.length} staff marked absent, ${leaveToRecord.length} recorded as on leave`,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function runMonthlySavingsInterestBatch(): Promise<ActionResult> {
  try {
    const user = await requirePermission('SETTINGS:MANAGE');

    // Delegate to the fixed savings actions module
    const { runMonthlySavingsInterest } = await import('./fixed-savings.actions');
    const result = await runMonthlySavingsInterest();

    if (result.success) {
      await auditLog({
        userId: user.id, action: 'UPDATE', module: 'SAVINGS', entityType: 'SAVINGS_ACCOUNT',
        description: `Manual monthly savings interest run: ${result.message}`,
      });
    }

    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function runMaturityProcessingBatch(): Promise<ActionResult> {
  try {
    const user = await requirePermission('SETTINGS:MANAGE');

    const { processMaturedAccounts } = await import('./fixed-savings.actions');
    const result = await processMaturedAccounts();

    if (result.success) {
      await auditLog({
        userId: user.id, action: 'UPDATE', module: 'SAVINGS', entityType: 'SAVINGS_ACCOUNT',
        description: `Manual maturity processing run: ${result.message}`,
      });
    }

    return result;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getBatchJobStatus() {
  await requirePermission('ADMIN:SYSTEM');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [overdueLoans, activeFDs, activeLoans, pendingVerifications, activeFixedSavings, pendingTerminations] = await Promise.all([
    prisma.loan.count({ where: { status: 'OVERDUE' } }),
    prisma.fixedDeposit.count({ where: { status: 'ACTIVE' } }),
    prisma.loan.count({ where: { status: 'ACTIVE' } }),
    prisma.verificationTask.count({ where: { status: 'PENDING' } }),
    prisma.savingsAccount.count({ where: { maturityDate: { not: null }, status: 'ACTIVE' } }),
    prisma.savingsTermination.count({ where: { status: 'PENDING' } }),
  ]);

  return {
    overdueLoans,
    activeFDs,
    activeLoans,
    pendingVerifications,
    activeFixedSavings,
    pendingTerminations,
    lastRun: today.toISOString(),
  };
}
