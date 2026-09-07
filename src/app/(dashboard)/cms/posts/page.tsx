import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { PostsClient } from './posts-client';

export default async function CmsPostsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <PostsClient user={session.user as SessionUser} />;
}
