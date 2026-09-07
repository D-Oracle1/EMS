import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { TrainingClient } from './training-client';

export default async function HrTrainingPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <TrainingClient user={session.user as SessionUser} />;
}
