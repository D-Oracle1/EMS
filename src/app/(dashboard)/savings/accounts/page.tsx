import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { FixedSavingsAccountsClient } from './fixed-savings-accounts-client';

export default async function FixedSavingsAccountsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  return <FixedSavingsAccountsClient user={user} />;
}
