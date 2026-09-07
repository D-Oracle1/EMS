import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { LifecycleClient } from './lifecycle-client';

export default async function HrLifecyclePage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <LifecycleClient user={session.user as SessionUser} />;
}
