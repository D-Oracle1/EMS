import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Verify cron secret in production
  const authHeader = request.headers.get('authorization');
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, string> = {};

  try {
    // 1. Mark overdue loans
    const today = new Date();
    today.setHours(0, 0, 0, 0);

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
    results.overdueLoans = `${loanIds.length} loans marked overdue`;

    // 2. Accrue fixed deposit interest
    const activeFDs = await prisma.fixedDeposit.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const fd of activeFDs) {
      const daysHeld = Math.floor((new Date().getTime() - fd.startDate.getTime()) / (1000 * 60 * 60 * 24));
      const accrued = new Decimal(fd.principalAmount.toString())
        .times(fd.interestRate.toString())
        .times(daysHeld)
        .div(365)
        .div(100)
        .toDecimalPlaces(2);

      await prisma.fixedDeposit.update({
        where: { id: fd.id },
        data: { accruedInterest: accrued.toNumber() },
      });
    }
    results.fdInterest = `Interest accrued for ${activeFDs.length} FDs`;

    // 3. Mark absentees (exclude system admin roles - they don't clock in)
    const activeStaff = await prisma.staff.findMany({
      where: {
        status: 'ACTIVE',
        role: { code: { not: 'SUPER_ADMIN' } },
      },
      select: { id: true },
    });

    const attendanceToday = await prisma.attendance.findMany({
      where: { date: today },
      select: { staffId: true },
    });

    const attendedIds = new Set(attendanceToday.map((a) => a.staffId));
    const absentStaff = activeStaff.filter((s) => !attendedIds.has(s.id));

    for (const staff of absentStaff) {
      await prisma.attendance.upsert({
        where: { staffId_date: { staffId: staff.id, date: today } },
        update: {},
        create: { staffId: staff.id, date: today, status: 'ABSENT' as any },
      });
    }
    results.absentees = `${absentStaff.length} staff marked absent`;

    return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
