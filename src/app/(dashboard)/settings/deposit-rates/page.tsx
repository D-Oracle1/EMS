import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { DepositRatesClient } from './deposit-rates-client';

export default async function DepositRatesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <DepositRatesClient user={session.user as SessionUser} />;
}
