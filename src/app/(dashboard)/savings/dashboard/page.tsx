import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { SavingsDashboardClient } from './savings-dashboard-client';

export default async function SavingsDashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;

  return <SavingsDashboardClient user={user} />;
}
