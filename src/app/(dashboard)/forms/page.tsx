import { redirect } from 'next/navigation';
import { getFormAccess, getForms } from '@/actions/form.actions';
import { getMyFormLinks } from '@/actions/referral.actions';
import { FormsClient } from './forms-client';
import { CompanyForms } from './company-forms';

export default async function FormsPage() {
  const { canManage, canCreate } = await getFormAccess();
  if (!canCreate) redirect('/my-forms');
  // Staff work from the company's own forms; form managers build and run them.
  if (!canManage) return <CompanyForms links={await getMyFormLinks()} />;
  const forms = await getForms();
  return <FormsClient forms={forms} canManage={canManage} />;
}
