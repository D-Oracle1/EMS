import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getExpenseAccess } from '@/actions/expense.actions';
import { ExpensesClient } from './expenses-client';

export default async function ExpensesPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const access = await getExpenseAccess();
  if (!access.canRecord && !access.canApprove) redirect('/dashboard');

  return <ExpensesClient access={access} />;
}
