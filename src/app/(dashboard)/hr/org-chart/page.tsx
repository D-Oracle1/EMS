import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { OrgChartClient } from './org-chart-client';

export default async function HrOrgChartPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <OrgChartClient user={session.user as SessionUser} />;
}
