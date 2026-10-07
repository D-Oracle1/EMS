import { notFound } from 'next/navigation';
import { requireCustomerPage } from '@/lib/portal-session';
import { getMyDeposit } from '@/actions/portfolio.actions';
import { DepositDetailView } from '@/components/portal/deposit-detail-view';

export default async function MyDepositPage({ params }: { params: Promise<{ id: string }> }) {
  await requireCustomerPage();
  const { id } = await params;
  const deposit = await getMyDeposit(id);
  if (!deposit) notFound();
  return <DepositDetailView deposit={deposit} />;
}
