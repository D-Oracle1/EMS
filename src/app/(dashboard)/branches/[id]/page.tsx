import { auth } from '@/lib/auth';
import { notFound, redirect } from 'next/navigation';
import { getBranchSummary } from '@/actions/branch.actions';
import type { SessionUser } from '@/types';
import { canOpenBranchesConsole } from '@/lib/branch-scope';
import { BranchDetailClient } from './branch-detail-client';

interface BranchDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function BranchDetailPage({ params }: BranchDetailPageProps) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  if (!canOpenBranchesConsole(user)) redirect('/dashboard');

  const { id } = await params;
  const branch = await getBranchSummary(id);
  if (!branch) notFound();

  return <BranchDetailClient branch={branch} />;
}
