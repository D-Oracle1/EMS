import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { AnnouncementsClient } from './announcements-client';

export default async function HrAnnouncementsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <AnnouncementsClient user={session.user as SessionUser} />;
}
