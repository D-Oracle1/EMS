import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBranchOverview } from '@/actions/branch.actions';
import type { SessionUser } from '@/types';
import { BranchesClient } from './branches-client';

export default async function BranchesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  if (!user.permissions.includes('ADMIN:SYSTEM')) redirect('/dashboard');

  const branches = await getBranchOverview();
  return <BranchesClient branches={branches} />;
}
