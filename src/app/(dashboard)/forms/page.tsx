import { redirect } from 'next/navigation';
import { getFormAccess, getForms } from '@/actions/form.actions';
import { FormsClient } from './forms-client';

export default async function FormsPage() {
  const { canManage } = await getFormAccess();
  if (!canManage) redirect('/my-forms');
  const forms = await getForms();
  return <FormsClient forms={forms} />;
}
