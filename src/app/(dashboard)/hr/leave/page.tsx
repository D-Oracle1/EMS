import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { LeaveClient } from './leave-client';

export default async function LeavePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;

  return <LeaveClient user={user} />;
}
