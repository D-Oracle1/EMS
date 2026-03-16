import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getLoan } from '@/actions/loan.actions';
import type { SessionUser } from '@/types';
import { LoanDetailClient } from './loan-detail-client';

export default async function LoanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  const { id } = await params;

  let loan;
  try {
    loan = await getLoan(id);
  } catch {
    notFound();
  }

  return <LoanDetailClient loan={loan} user={user} />;
}
