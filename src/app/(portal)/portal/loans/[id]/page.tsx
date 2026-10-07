import { notFound } from 'next/navigation';
import { requireCustomerPage } from '@/lib/portal-session';
import { getMyLoan } from '@/actions/portfolio.actions';
import { LoanDetailView } from '@/components/portal/loan-detail-view';

export default async function MyLoanPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCustomerPage();
  const { id } = await params;
  const loan = await getMyLoan(id);
  if (!loan) notFound();
  return <LoanDetailView loan={loan} />;
}
