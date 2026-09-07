import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { SettingsClient } from './settings-client';

export default async function HrSettingsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <SettingsClient user={session.user as SessionUser} />;
}
