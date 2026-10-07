import { requireCustomerPage } from '@/lib/portal-session';
import { getMyPortfolio } from '@/actions/portfolio.actions';
import { getMyNotifications } from '@/actions/portal.actions';
import { ActivityView } from '@/components/portal/activity-view';

export default async function PortalActivity() {
  await requireCustomerPage();
  const [data, notices] = await Promise.all([getMyPortfolio(), getMyNotifications(50)]);
  return <ActivityView data={data} notices={notices} />;
}
