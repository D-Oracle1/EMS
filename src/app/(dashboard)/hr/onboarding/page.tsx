import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { OnboardingClient } from './onboarding-client';

export default async function HrOnboardingPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <OnboardingClient user={session.user as SessionUser} />;
}
