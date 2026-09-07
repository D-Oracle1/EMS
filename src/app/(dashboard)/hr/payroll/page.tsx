import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { PayrollClient } from './payroll-client';

export default async function HrPayrollPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <PayrollClient user={session.user as SessionUser} />;
}
