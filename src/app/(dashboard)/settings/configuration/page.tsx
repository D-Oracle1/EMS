import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { ConfigurationClient } from './configuration-client';

export default async function ConfigurationPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <ConfigurationClient user={session.user as SessionUser} />;
}
