import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getDashboardData } from '@/actions/dashboard.actions';
import { DashboardClient } from './dashboard-client';
import type { SessionUser } from '@/types';
import { isBusinessServicesFocused, isMarketingFocused } from '@/lib/landing';

export default async function DashboardPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  // A marketer's dashboard is their Sales page.
  if (isMarketingFocused(user)) redirect('/marketing');
  // So is a Business Service Consultant's Business Services page.
  if (isBusinessServicesFocused(user)) redirect('/business-services');
  const data = await getDashboardData();

  return <DashboardClient user={user} data={data} />;
}
