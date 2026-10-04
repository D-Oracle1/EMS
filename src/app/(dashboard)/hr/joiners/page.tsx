import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { getOnboardingOptions, getOnboardingRequests } from '@/actions/onboarding.actions';
import { JoinersClient } from './joiners-client';

/** HR's queue of onboarding form responses, each one a staff account waiting to be created. */
export default async function JoinersPage() {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  if (!user.permissions.includes('HR:STAFF_CREATE')) redirect('/hr/staff');

  const [requests, options] = await Promise.all([getOnboardingRequests('PENDING'), getOnboardingOptions()]);
  return <JoinersClient userId={user.id} initialRequests={requests} options={options} />;
}
