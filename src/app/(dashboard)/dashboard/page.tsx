import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/actions/dashboard.actions';
import { DashboardClient } from './dashboard-client';
import type { SessionUser } from '@/types';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  const data = await getDashboardData();

  return <DashboardClient user={user} data={data} />;
}
