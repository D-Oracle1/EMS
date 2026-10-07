import { notFound } from 'next/navigation';
import { getCustomer } from '@/actions/customer.actions';
import { getCustomerApplications } from '@/actions/application.actions';
import { CustomerDetailClient } from './customer-detail-client';
import { CustomerApplications } from './customer-applications';
import { getPortalAccess } from '@/actions/portal-access.actions';
import { PortalAccessCard } from './portal-access-card';

interface CustomerDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function CustomerDetailPage({
  params,
}: CustomerDetailPageProps) {
  const { id } = await params;

  let customer;
  try {
    customer = await getCustomer(id);
  } catch {
    notFound();
  }

  const [applications, access] = await Promise.all([getCustomerApplications(id), getPortalAccess(id)]);

  return (
    <div className="space-y-6">
      <CustomerDetailClient customer={customer} />
      <CustomerApplications applications={applications} />
      {access && <PortalAccessCard customerId={id} access={access} />}
    </div>
  );
}
