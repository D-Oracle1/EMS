import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import type { SessionUser } from '@/types';

/** The portal is for customers: anyone else is sent where they belong. */
export async function requireCustomerPage(): Promise<SessionUser> {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  if (user.userType !== 'customer') redirect('/dashboard');
  return user;
}
