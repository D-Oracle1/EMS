import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { MyProfileClient } from './my-profile-client';

export default async function MyProfilePage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  return <MyProfileClient user={user} />;
}
