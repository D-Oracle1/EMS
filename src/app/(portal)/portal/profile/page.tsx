import { requireCustomerPage } from '@/lib/portal-session';
import { getMyPortfolio } from '@/actions/portfolio.actions';
import { ProfileView } from '@/components/portal/profile-view';

export default async function PortalProfile() {
  await requireCustomerPage();
  return <ProfileView data={await getMyPortfolio()} />;
}
