import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { SavingsProductsClient } from './savings-products-client';

export default async function SavingsProductsPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;

  return <SavingsProductsClient user={user} />;
}
