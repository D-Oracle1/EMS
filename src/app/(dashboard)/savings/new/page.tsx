import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { SavingsNewClient } from './savings-new-client';

export default async function NewSavingsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  return <SavingsNewClient user={user} />;
}
