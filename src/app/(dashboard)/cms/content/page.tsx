import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { ContentClient } from './content-client';

export default async function CmsContentPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <ContentClient user={session.user as SessionUser} />;
}
