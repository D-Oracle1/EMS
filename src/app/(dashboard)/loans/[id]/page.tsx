import { auth } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { getLoan } from '@/actions/loan.actions';
import type { SessionUser } from '@/types';
import { getLoanDefaultCharges } from '@/actions/loan-charges.actions';
import { LoanDetailClient } from './loan-detail-client';
import { LoanDefaultCharges } from './loan-default-charges';

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

  const charges = await getLoanDefaultCharges(id);

  return (
    <div className="space-y-6">
      <LoanDetailClient loan={loan} user={user} />
      {charges && <LoanDefaultCharges loanId={id} charges={charges} />}
    </div>
  );
}
