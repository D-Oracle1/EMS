import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { prisma } from '@/lib/prisma';
import { canManageFees } from '@/lib/fees';
import { getFeeSettings } from '@/actions/fee.actions';
import { FeeSettingsClient } from './fee-settings-client';

/** What each application form costs, and where loan default charges are set. Admins only (lib/fees canManageFees). */
export default async function FeeSettingsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  if (!canManageFees(user)) redirect('/dashboard');

  const [fees, products] = await Promise.all([
    getFeeSettings(),
    prisma.loanProduct.findMany({
      where: { isActive: true },
      select: { id: true, name: true, processingFee: true, penaltyRate: true, gracePeriodDays: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return (
    <FeeSettingsClient
      initial={fees}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        processingFee: p.processingFee.toNumber(),
        penaltyRate: p.penaltyRate?.toNumber() ?? null,
        gracePeriodDays: p.gracePeriodDays,
      }))}
    />
  );
}
