'use server';

import Decimal from 'decimal.js';
import { prisma, withTransaction } from '@/lib/prisma';
import { requirePermission } from '@/lib/auth-utils';
import { auditLog } from '@/lib/audit';
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

    // Find active staff without attendance record today
    const activeStaff = await prisma.staff.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });

    const attendanceToday = await prisma.attendance.findMany({
      where: { date: today },
      select: { staffId: true },
    });

    const attendedIds = new Set(attendanceToday.map((a) => a.staffId));
    const absentStaff = activeStaff.filter((s) => !attendedIds.has(s.id));

    await withTransaction(async (tx) => {
      for (const staff of absentStaff) {
        await tx.attendance.create({
          data: {
            staffId: staff.id,
            date: today,
            status: 'ABSENT' as any,
          },
        });
      }
    });

    await auditLog({
      userId: user.id, action: 'UPDATE', module: 'HR', entityType: 'ATTENDANCE',
      description: `Marked ${absentStaff.length} staff as absent`,
    });

    return { success: true, message: `${absentStaff.length} staff marked as absent` };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function getBatchJobStatus() {
  await requirePermission('ADMIN:SYSTEM');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [overdueLoans, activeFDs, activeLoans, pendingVerifications] = await Promise.all([
    prisma.loan.count({ where: { status: 'OVERDUE' } }),
    prisma.fixedDeposit.count({ where: { status: 'ACTIVE' } }),
    prisma.loan.count({ where: { status: 'ACTIVE' } }),
    prisma.verificationTask.count({ where: { status: 'PENDING' } }),
  ]);

  return {
    overdueLoans,
    activeFDs,
    activeLoans,
    pendingVerifications,
    lastRun: today.toISOString(),
  };
}
