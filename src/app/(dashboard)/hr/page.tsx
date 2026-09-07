import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { HRHubClient } from './hr-hub-client';

export default async function HRPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <HRHubClient user={session.user as SessionUser} />;
}
