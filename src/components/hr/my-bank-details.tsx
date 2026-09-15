'use client';

/**
 * A staff member's own bank details, on their profile.
 *
 * Submitting does not change what payroll uses: HR confirms first. The card
 * says so plainly and keeps the confirmed values visually separate from
 * anything pending, because the failure mode here is somebody assuming a
 * submission took effect and then wondering where their salary went.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Banknote, Clock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  getMyBankDetails,
  submitMyBankDetails,
  type MyBankDetails,
} from '@/actions/bank-details.actions';

export function MyBankDetails() {
  const [data, setData] = useState<MyBankDetails | null>(null);
  const [form, setForm] = useState({ bankName: '', accountNumber: '', accountName: '' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    getMyBankDetails()
      .then(setData)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Could not load your bank details');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    setBusy(true);
    const result = await submitMyBankDetails(form);
    setBusy(false);
    if (result.success) {
      toast.success(result.message ?? 'Submitted');
      setEditing(false);
      setForm({ bankName: '', accountNumber: '', accountName: '' });
      startTransition(load);
    } else {
      toast.error(result.error);
    }
  };

  if (!data) return null;

  const { confirmed, pending, lastRejected } = data;
  const hasConfirmed = Boolean(confirmed.accountNumber);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Banknote className="h-5 w-5" />
          Bank Details
          {hasConfirmed ? (
            <Badge variant="success" className="text-xs">Confirmed</Badge>
          ) : (
            <Badge variant="warning" className="text-xs">Not set</Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Payroll pays into the confirmed account below. Anything you submit is used only
          once HR has confirmed it.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* What payroll will actually use */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Bank</p>
            <p className="text-sm font-medium">{confirmed.bankName ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Account number</p>
            <p className="text-sm font-medium tabular-nums">{confirmed.accountNumber ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Account name</p>
            <p className="text-sm font-medium">{confirmed.accountName ?? '—'}</p>
          </div>
        </div>

        {!hasConfirmed && !pending && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            You have no confirmed account on file, so payroll has nowhere to pay you.
            Submit your details below.
          </p>
        )}

        {pending && (
          <div className="rounded-2xl border border-border/60 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium">
              <Clock className="h-4 w-4 text-amber-600" />
              Awaiting confirmation
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {pending.bankName} · {pending.accountNumber} · {pending.accountName}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Submitted {new Date(pending.submittedAt).toLocaleDateString('en-NG', {
                day: 'numeric', month: 'long', year: 'numeric',
              })}. Payroll will keep using the confirmed account until HR approves this.
            </p>
          </div>
        )}

        {lastRejected && !pending && (
          <div className="rounded-2xl bg-rose-500/10 px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-medium text-rose-700">
              <AlertTriangle className="h-4 w-4" />
              Your last submission was not accepted
            </p>
            <p className="mt-0.5 text-xs text-rose-700/90">{lastRejected.rejectionReason}</p>
          </div>
        )}

        {editing ? (
          <div className="space-y-3 rounded-2xl border border-border/60 p-3">
            <div className="space-y-1.5">
              <Label htmlFor="bank-name">Bank</Label>
              <Input
                id="bank-name"
                value={form.bankName}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
                placeholder="e.g. Access Bank"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="bank-account-number">Account number</Label>
                <Input
                  id="bank-account-number"
                  inputMode="numeric"
                  maxLength={14}
                  value={form.accountNumber}
                  onChange={(e) => setForm((f) => ({ ...f, accountNumber: e.target.value }))}
                  placeholder="10 digits"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bank-account-name">Account name</Label>
                <Input
                  id="bank-account-name"
                  value={form.accountName}
                  onChange={(e) => setForm((f) => ({ ...f, accountName: e.target.value }))}
                  placeholder="As it appears at the bank"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Check these against your bank statement. A wrong account number sends your
              salary to someone else, and it is not easily recovered.
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={submit} disabled={busy || isPending} className="rounded-full">
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                Submit for confirmation
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEditing(false)}
                disabled={busy}
                className="rounded-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="rounded-full"
            onClick={() => {
              setForm({
                bankName: confirmed.bankName ?? '',
                accountNumber: confirmed.accountNumber ?? '',
                accountName: confirmed.accountName ?? '',
              });
              setEditing(true);
            }}
          >
            {hasConfirmed ? 'Change my bank details' : 'Add my bank details'}
          </Button>
        )}

        {hasConfirmed && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            Details already copied onto a processed payslip do not change. A run that has
            been processed keeps the account it was processed with.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
