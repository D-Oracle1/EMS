import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { NotificationsClient } from './notifications-client';

export default async function NotificationsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  return <NotificationsClient user={user} />;
}
