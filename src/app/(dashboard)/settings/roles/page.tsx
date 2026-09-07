import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { RolesClient } from './roles-client';

export default async function RolesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <RolesClient user={session.user as SessionUser} />;
}
