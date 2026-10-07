import { requireCustomerPage } from '@/lib/portal-session';
import { getMyPortfolio } from '@/actions/portfolio.actions';
import { LoansView } from '@/components/portal/loans-view';

export default async function PortalLoans() {
  await requireCustomerPage();
  return <LoansView data={await getMyPortfolio()} />;
}
