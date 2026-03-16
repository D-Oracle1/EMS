import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { StaffClient } from './staff-client';

export default async function StaffPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  const hasAccess = user.permissions.some((p) => p.startsWith('HR:'));
  if (!hasAccess) redirect('/dashboard');

  return <StaffClient user={user} />;
}
