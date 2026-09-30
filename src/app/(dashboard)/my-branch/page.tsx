import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getBranchSummary, getMyBranchId } from '@/actions/branch.actions';
import { BranchDetailClient } from '../branches/[id]/branch-detail-client';

/** A branch manager's view of the branch they run, and no other. */
export default async function MyBranchPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const branchId = await getMyBranchId();
  if (!branchId) redirect('/dashboard');

  const branch = await getBranchSummary(branchId);
  if (!branch) redirect('/dashboard');

  return <BranchDetailClient branch={branch} mine />;
}
