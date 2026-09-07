import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { resolveLandingPath } from '@/lib/landing';
import type { SessionUser } from '@/types';

export default async function Home() {
  const session = await auth();

  if (session) {
    redirect(resolveLandingPath(session.user as SessionUser));
  } else {
    redirect('/login');
  }
}
