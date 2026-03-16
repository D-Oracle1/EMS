import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { WithdrawalQueueClient } from './withdrawal-queue-client';

export default async function WithdrawalQueuePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;

  if (!user.permissions.includes('SAVINGS:APPROVE') && !user.permissions.includes('SAVINGS:WITHDRAW')) {
    redirect('/dashboard');
  }

  return <WithdrawalQueueClient user={user} />;
}
