import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getSavingsAccount } from '@/actions/savings.actions';
import type { SessionUser } from '@/types';
import { SavingsDetailClient } from './savings-detail-client';

interface SavingsDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function SavingsDetailPage({ params }: SavingsDetailPageProps) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;
  const user = session.user as SessionUser;
  const account = await getSavingsAccount(id);

  return <SavingsDetailClient user={user} account={account} />;
}
