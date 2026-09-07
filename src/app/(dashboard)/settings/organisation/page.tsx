import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { OrganisationClient } from './organisation-client';

export default async function OrganisationPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <OrganisationClient user={session.user as SessionUser} />;
}
