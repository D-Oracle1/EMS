import { notFound, redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import type { SessionUser } from '@/types';
import { getMySavings } from '@/actions/portfolio.actions';
import { SavingsDetail } from './savings-detail';

export default async function MySavingsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');
  if ((session.user as SessionUser).userType !== 'customer') redirect('/dashboard');
  const { id } = await params;
  const account = await getMySavings(id);
  if (!account) notFound();
  return <SavingsDetail account={account} />;
}
