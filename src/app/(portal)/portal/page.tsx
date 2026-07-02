import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { PortalClient } from './portal-client';

export default async function PortalPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  // Staff shouldn't be here; middleware also enforces this.
  if (user.userType !== 'customer') redirect('/dashboard');

  return <PortalClient />;
}
