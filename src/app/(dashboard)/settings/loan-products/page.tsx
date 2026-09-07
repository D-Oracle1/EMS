import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { LoanProductsClient } from './loan-products-client';

export default async function LoanProductsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  return <LoanProductsClient user={session.user as SessionUser} />;
}
