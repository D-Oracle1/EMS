import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { PayrollPeriodClient } from './payroll-period-client';

export default async function PayrollPeriodPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');

  const { id } = await params;

  return <PayrollPeriodClient periodId={id} user={session.user as SessionUser} />;
}
