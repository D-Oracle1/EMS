import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { StaffTasksClient } from './tasks-client';

export default async function HrTasksPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <StaffTasksClient user={session.user as SessionUser} />;
}
