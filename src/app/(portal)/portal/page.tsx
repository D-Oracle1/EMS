import { requireCustomerPage } from '@/lib/portal-session';
import { getMyPortfolio } from '@/actions/portfolio.actions';
import { HomeView } from '@/components/portal/home-view';

export default async function PortalHome() {
  await requireCustomerPage();
  return <HomeView data={await getMyPortfolio()} />;
}
