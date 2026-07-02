import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { SavingsStatementClient } from './statement-client';

export default async function SavingsStatementPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session) redirect('/login');
  const { id } = await params;

  return <SavingsStatementClient accountId={id} />;
}
