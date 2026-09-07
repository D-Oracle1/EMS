import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { AssetsClient } from './assets-client';

export default async function HrAssetsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <AssetsClient user={session.user as SessionUser} />;
}
