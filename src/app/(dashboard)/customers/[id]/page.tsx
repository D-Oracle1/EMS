import { notFound } from 'next/navigation';
import { getCustomer } from '@/actions/customer.actions';
import { CustomerDetailClient } from './customer-detail-client';

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

  return <CustomerDetailClient customer={customer} />;
}
