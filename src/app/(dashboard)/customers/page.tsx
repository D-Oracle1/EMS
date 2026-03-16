import { getCustomers } from '@/actions/customer.actions';
import { CustomersClient } from './customers-client';

interface CustomersPageProps {
  searchParams: Promise<{
    search?: string;
    status?: string;
    type?: string;
    page?: string;
  }>;
}

export default async function CustomersPage({ searchParams }: CustomersPageProps) {
  const params = await searchParams;
  const page = params.page ? parseInt(params.page, 10) : 1;

  const result = await getCustomers({
    search: params.search,
    status: params.status,
    type: params.type,
    page,
    limit: 20,
  });

  return (
    <CustomersClient
      customers={result.data}
      pagination={result.pagination}
      filters={{
        search: params.search || '',
        status: params.status || '',
        type: params.type || '',
      }}
    />
  );
}
