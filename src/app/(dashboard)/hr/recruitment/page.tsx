import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { RecruitmentClient } from './recruitment-client';

export default async function HrRecruitmentPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <RecruitmentClient user={session.user as SessionUser} />;
}
