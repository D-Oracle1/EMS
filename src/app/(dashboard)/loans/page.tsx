import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getLoans } from '@/actions/loan.actions';
import type { SessionUser } from '@/types';
import { LoansClient } from './loans-client';

export default async function LoansPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; search?: string; page?: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  const params = await searchParams;

  const statusFilter = params.status ? params.status.split(',') : undefined;
  const page = params.page ? parseInt(params.page, 10) : 1;

  const result = await getLoans({
    status: statusFilter,
    search: params.search,
    page,
    limit: 20,
  });

  return (
    <LoansClient
      user={user}
      loans={result.data}
      pagination={result.pagination}
      currentStatus={params.status || ''}
      currentSearch={params.search || ''}
    />
  );
}
