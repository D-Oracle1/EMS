import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { SavingsListClient } from './savings-list-client';

export default async function SavingsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;

  return <SavingsListClient user={user} />;
}
