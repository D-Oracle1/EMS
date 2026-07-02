/**
 * Savings maintenance routines — dormancy flagging, maturity-progress refresh,
 * and upcoming-maturity notifications. Called from the daily/monthly crons.
 */

import { prisma } from '@/lib/prisma';
import { createNotificationForUsers, getUsersWithAnyPermission } from '@/lib/notifications';

const DEFAULT_DORMANCY_DAYS = 90;

/**
 * Flag non-fixed-term ACTIVE savings accounts with no activity for
 * `dormancyDays` as DORMANT. Fixed-term accounts (maturityDate set) are excluded
 * — they are expected to have no interim activity.
 */
export async function flagDormantAccounts(opts?: {
  asOf?: Date;
  dormancyDays?: number;
}): Promise<{ flagged: number }> {
  const asOf = opts?.asOf ?? new Date();
  const dormancyDays = opts?.dormancyDays ?? DEFAULT_DORMANCY_DAYS;
  const cutoff = new Date(asOf);
  cutoff.setDate(cutoff.getDate() - dormancyDays);

  const result = await prisma.savingsAccount.updateMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      maturityDate: null, // non-fixed accounts only
      OR: [
        { lastTransactionAt: { lt: cutoff } },
        { lastTransactionAt: null, openedAt: { lt: cutoff } },
      ],
    },
    data: { status: 'DORMANT' },
  });

  return { flagged: result.count };
}

/**
 * Notify savings managers of fixed-term accounts maturing within `withinDays`.
 * Intended to run monthly to avoid notification spam.
 */
export async function notifyUpcomingMaturities(opts?: {
  asOf?: Date;
  withinDays?: number;
}): Promise<{ notified: number; recipients: number }> {
  const asOf = opts?.asOf ?? new Date();
  const withinDays = opts?.withinDays ?? 30;
  const horizon = new Date(asOf);
  horizon.setDate(horizon.getDate() + withinDays);

  const maturing = await prisma.savingsAccount.findMany({
    where: {
      status: 'ACTIVE',
      isDeleted: false,
      maturityDate: { not: null, gte: asOf, lte: horizon },
    },
    include: { customer: { select: { firstName: true, lastName: true } } },
    orderBy: { maturityDate: 'asc' },
  });

  if (maturing.length === 0) return { notified: 0, recipients: 0 };

  const managers = await getUsersWithAnyPermission(['SAVINGS:MANAGE', 'SAVINGS:APPROVE']);
  if (managers.length === 0) return { notified: 0, recipients: 0 };

  await createNotificationForUsers(managers, {
    type: 'MATURITY_REMINDER',
    title: `${maturing.length} savings account(s) maturing soon`,
    message: `${maturing.length} fixed-term savings account(s) mature within ${withinDays} days. Earliest: ${maturing[0].customer.firstName} ${maturing[0].customer.lastName} on ${maturing[0].maturityDate?.toLocaleDateString('en-NG')}.`,
    entityType: 'SAVINGS',
    actionUrl: '/savings/dashboard',
  });

  return { notified: maturing.length, recipients: managers.length };
}
