import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { CreateFixedSavingsClient } from './create-fixed-savings-client';

export default async function CreateFixedSavingsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  return <CreateFixedSavingsClient user={user} />;
}
