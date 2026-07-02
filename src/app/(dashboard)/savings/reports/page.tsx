import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { SavingsReportsClient } from './savings-reports-client';

export default async function SavingsReportsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;

  return <SavingsReportsClient user={user} />;
}
