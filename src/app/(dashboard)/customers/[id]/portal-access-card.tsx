'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Copy, KeyRound, Loader2, MonitorSmartphone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import { issuePortalAccess, revokePortalAccess, type getPortalAccess } from '@/actions/portal-access.actions';

type Access = NonNullable<Awaited<ReturnType<typeof getPortalAccess>>>;
type Issued = { password: string; signInWith: string[]; emailed: boolean; phoneShared: boolean };

/** Gives a customer a one-time password to their online portfolio, shown once to hand over. */
export function PortalAccessCard({ customerId, access }: { customerId: string; access: Access }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);

  const issue = async () => {
    if (access.enabled && !window.confirm('Give a new one-time password? The customer\'s current password stops working.')) return;
    setBusy(true);
    const result = await issuePortalAccess(customerId);
    setBusy(false);
    if (!result.success || !result.data) return toast.error(result.error ?? 'Could not give access');
    setIssued(result.data);
    router.refresh();
  };

  const revoke = async () => {
    if (!window.confirm('Switch off this customer\'s online access? Their accounts are not affected.')) return;
    setBusy(true);
    const result = await revokePortalAccess(customerId);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    setIssued(null);
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <MonitorSmartphone className="h-5 w-5" />Online portfolio
          {access.enabled ? (
            access.locked ? <Badge variant="destructive">Locked</Badge>
              : access.waitingFirstSignIn ? <Badge variant="warning">Waiting for first sign-in</Badge>
              : <Badge variant="success">Active</Badge>
          ) : <Badge variant="secondary">No access</Badge>}
        </CardTitle>
        <CardDescription>
          The customer signs in at the Hy-Link app to see their savings, deposits, loans and receipts.
          {access.lastLoginAt && ` Last signed in ${formatDateTime(access.lastLoginAt)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {access.phoneShared && (
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            Another customer with online access has the same phone number, so the phone cannot be used to sign in.
            {access.email ? ' This customer signs in with their email.' : ' Add an email to this customer, or correct the phone number.'}
          </p>
        )}

        {issued && (
          <div className="space-y-2 rounded-xl border-2 border-dashed border-indigo-300 p-4">
            <p className="text-sm">
              Give these to {issued.signInWith.length ? 'the customer' : 'the customer once they have a way to sign in'}. The password is shown only now.
            </p>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Sign in with</dt>
                <dd className="font-medium">{issued.signInWith.join(' or ') || 'No usable email or phone'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">One-time password</dt>
                <dd className="flex items-center gap-2">
                  <span className="select-all font-mono text-lg font-bold tracking-wider">{issued.password}</span>
                  <button
                    type="button"
                    aria-label="Copy password"
                    className="text-muted-foreground hover:text-foreground"
                    onClick={() => navigator.clipboard.writeText(issued.password).then(() => toast.success('Copied'), () => undefined)}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </dd>
              </div>
            </dl>
            <p className="text-xs text-muted-foreground">
              {issued.emailed ? 'Also emailed to the customer. ' : ''}They must set their own password at first sign-in.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={issue} disabled={busy || !access.active}>
            {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <KeyRound className="mr-1.5 h-3.5 w-3.5" />}
            {access.enabled ? 'Reset password' : 'Give online access'}
          </Button>
          {access.enabled && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={revoke} className="hover:text-rose-600">Switch off</Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
