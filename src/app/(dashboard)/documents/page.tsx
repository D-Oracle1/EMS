import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { DocumentsClient } from './documents-client';

export default async function DocumentsPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  return <DocumentsClient user={user} />;
}
