import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import type { SessionUser } from '@/types';
import { canManageForms } from '@/lib/forms';
import { canDiscount } from '@/lib/fees';
import { reviewablePurposes, isApplicantPurpose } from '@/lib/customer-forms';
import {
  getApplications, getApplicationCounts, getApplicationBranches, getUnlinkedGuarantors,
} from '@/actions/application.actions';
import { ApplicationsClient } from './applications-client';

/**
 * The officers' queue of customer application forms: savings, partnership,
 * fixed deposit and loan (with its guarantors). Each officer sees the kinds
 * their permissions review (lib/customer-forms PURPOSE_INFO).
 */
export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const session = await auth();
  if (!session) redirect('/login');
  const user = session.user as SessionUser;
  const kinds = reviewablePurposes(user);
  if (!kinds.length) redirect('/dashboard');

  const asked = (await searchParams).kind;
  const kind = isApplicantPurpose(asked) && kinds.includes(asked) ? asked : kinds[0];

  const [applications, counts, branches, unlinked] = await Promise.all([
    getApplications(kind, 'PENDING'),
    getApplicationCounts(),
    getApplicationBranches(),
    kinds.includes('LOAN_APPLICATION') ? getUnlinkedGuarantors() : Promise.resolve([]),
  ]);

  return (
    <ApplicationsClient
      key={kind}
      kinds={kinds}
      kind={kind}
      initialApplications={applications}
      counts={counts}
      branches={branches}
      initialUnlinked={unlinked}
      canManageForms={canManageForms(user)}
      canDiscount={canDiscount(user)}
    />
  );
}
