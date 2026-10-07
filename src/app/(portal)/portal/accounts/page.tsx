import { requireCustomerPage } from '@/lib/portal-session';
import { getMyPortfolio } from '@/actions/portfolio.actions';
import { AccountsView } from '@/components/portal/accounts-view';

export default async function PortalAccounts() {
  await requireCustomerPage();
  return <AccountsView data={await getMyPortfolio()} />;
}
