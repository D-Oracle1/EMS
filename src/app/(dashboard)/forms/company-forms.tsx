import { ClipboardList } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import type { getMyFormLinks } from '@/actions/referral.actions';
import { ShareCustomerForms } from '../my-forms/referrals';

type Links = Awaited<ReturnType<typeof getMyFormLinks>>;

/**
 * What a staff member sees under Forms: the company's own forms (savings,
 * partnership, fixed deposit, loan, guarantor), to share with a client or
 * fill in with them. Each application goes to that product's officers for
 * approval and is credited to whoever shared it.
 */
export function CompanyForms({ links }: { links: Links }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Forms</h1>
        <p className="text-muted-foreground">
          The company&apos;s forms. Share one with a client, or open it and fill it in with them. Each application
          goes to the right officer for approval, and is credited to you.
        </p>
      </div>
      {links.forms.length === 0 || !links.code ? (
        <Card>
          <CardContent className="py-14 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <p className="mt-3 font-medium">No forms are open right now</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {links.code ? 'Ask a manager to open the company forms.' : 'Your staff record has no employee ID yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ShareCustomerForms links={links} title="Company forms" />
      )}
    </div>
  );
}
