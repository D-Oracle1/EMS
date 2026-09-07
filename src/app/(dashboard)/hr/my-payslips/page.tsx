import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { MyPayslipsClient } from './my-payslips-client';

export default async function HrMyPayslipsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <MyPayslipsClient user={session.user as SessionUser} />;
}
