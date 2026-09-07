import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { SessionsClient } from './sessions-client';

export default async function SessionsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <SessionsClient user={session.user as SessionUser} />;
}
