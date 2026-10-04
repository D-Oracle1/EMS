import { redirect } from 'next/navigation';
import { getFormAccess } from '@/actions/form.actions';
import { FormBuilder, EMPTY_FORM } from '../form-builder';

export default async function NewFormPage() {
  const { canManage } = await getFormAccess();
  if (!canManage) redirect('/my-forms');
  return <FormBuilder initial={EMPTY_FORM} />;
}
