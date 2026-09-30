import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getMarketingAccess } from '@/actions/marketing.actions';
import { MarketingClient } from './marketing-client';

export default async function MarketingPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const access = await getMarketingAccess();
  if (!access.canReport && !access.canConfirm) redirect('/dashboard');

  return <MarketingClient access={access} />;
}
