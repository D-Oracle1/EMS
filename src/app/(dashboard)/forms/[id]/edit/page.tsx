import { notFound, redirect } from 'next/navigation';
import { getFormAccess, getFormForEdit } from '@/actions/form.actions';
import { FormBuilder } from '../../form-builder';

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { canManage } = await getFormAccess();
  if (!canManage) redirect('/my-forms');
  const { id } = await params;
  const form = await getFormForEdit(id);
  if (!form) notFound();
  return <FormBuilder key={form.id} initial={form} />;
}
