import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  processMaturedAccounts,
  getSystemUserId,
} from '@/lib/savings-interest-engine';
import { notifyUpcomingMaturities } from '@/lib/savings-maintenance';

/**
 * Monthly Cron Job — Savings Interest Engine & Maturity Processing
 * Scheduled: 1st of each month at 02:00 UTC (vercel.json: "0 2 1 * *")
 *
 * All interest/maturity logic lives in `@/lib/savings-interest-engine` so the
 * cron and the manual server actions share one idempotent implementation.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // Reachable without a session so the scheduler can call it, so the secret is
  // the only thing standing in front of a job that moves money. Fail closed.
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured; refusing to run.' },
      { status: 503 }
    );
  }
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const results: Record<string, unknown> = {};

  try {
    const systemUserId = await getSystemUserId();
    const today = new Date();

    // 1. Ensure current financial period is open
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    await prisma.financialPeriod.upsert({
      where: { year_month: { year, month } },
      update: {},
      create: {
        year,
        month,
        startDate: new Date(year, month - 1, 1),
        endDate: new Date(year, month, 0),
        status: 'OPEN',
      },
    });
    results.period = `${year}-${month.toString().padStart(2, '0')} ensured OPEN`;

    // 2. Monthly savings interest (idempotent — safe on retry/redeploy)
    // Savings interest is credited daily now (see /api/cron/daily). Running
    // the monthly accrual as well would pay every saver twice, so it is gone
    // from here deliberately rather than by omission.
    results.savingsInterest = 'credited daily — see /api/cron/daily';

    // 3. Maturity processing
    results.maturityProcessing = await processMaturedAccounts({ asOf: today, systemUserId });

    // 4. Notify managers of accounts maturing within 30 days
    results.maturityNotifications = await notifyUpcomingMaturities({ asOf: today, withinDays: 30 });

    return NextResponse.json({ success: true, results, timestamp: new Date().toISOString() });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
