import { notFound, redirect } from 'next/navigation';
import { getFormAccess, getFormResponses } from '@/actions/form.actions';
import { ResponsesClient } from './responses-client';

export default async function FormResponsesPage({ params }: { params: Promise<{ id: string }> }) {
  const { canManage } = await getFormAccess();
  if (!canManage) redirect('/my-forms');
  const { id } = await params;
  const form = await getFormResponses(id);
  if (!form) notFound();
  return <ResponsesClient form={form} />;
}
