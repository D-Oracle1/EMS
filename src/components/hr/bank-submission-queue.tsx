'use client';

/**
 * Bank details awaiting confirmation, for whoever runs payroll.
 *
 * Account numbers are masked in the list and shown in full only on the row
 * being acted on. A reviewer needs to read the number they are approving; a
 * screen left open on a shared desk does not need to show everyone's.
 */

import { useCallback, useEffect, useState, useTransition } from 'react';
import { Banknote, Check, X, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  listBankSubmissions,
  approveBankSubmission,
  rejectBankSubmission,
  type BankSubmissionView,
} from '@/actions/bank-details.actions';

function maskAccount(value: string): string {
  if (value.length <= 4) return value;
  return `${'•'.repeat(value.length - 4)}${value.slice(-4)}`;
}

const STATUS_VARIANT: Record<string, 'warning' | 'success' | 'error'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
};

export function BankSubmissionQueue() {
  const [rows, setRows] = useState<BankSubmissionView[]>([]);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(() => {
    listBankSubmissions()
      .then(setRows)
      .catch((e: unknown) => {
        toast.error(e instanceof Error ? e.message : 'Could not load submissions');
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (row: BankSubmissionView) => {
    setBusy(row.id);
    const result = await approveBankSubmission(row.id);
    setBusy(null);
    if (result.success) {
      toast.success(result.message ?? 'Confirmed');
      startTransition(load);
    } else {
      toast.error(result.error);
    }
  };

  const reject = async (row: BankSubmissionView) => {
    setBusy(row.id);
    const result = await rejectBankSubmission(row.id, reason);
    setBusy(null);
    if (result.success) {
      toast.success(result.message ?? 'Rejected');
      setRejecting(null);
      setReason('');
      startTransition(load);
    } else {
      toast.error(result.error);
    }
  };

  const pending = rows.filter((r) => r.status === 'PENDING');
  const settled = rows.filter((r) => r.status !== 'PENDING').slice(0, 20);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Banknote className="h-5 w-5" />
          Bank Details
          {pending.length > 0 && (
            <Badge variant="warning" className="text-xs">{pending.length} waiting</Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Payroll pays into confirmed accounts only. Check each number against what the
          person gave you before confirming it.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {pending.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nothing waiting to be confirmed.
          </p>
        ) : (
          <div className="space-y-2">
            {pending.map((row) => (
              <div key={row.id} className="rounded-2xl border border-border/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{row.staffName}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.employeeId} · {row.department}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <Clock className="mr-1 inline h-3 w-3" />
                    {new Date(row.submittedAt).toLocaleDateString('en-NG', {
                      day: 'numeric', month: 'short',
                    })}
                  </span>
                </div>

                <div className="mt-2 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Bank</p>
                    <p className="truncate">{row.bankName}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Account number</p>
                    <button
                      type="button"
                      onClick={() => setRevealed(revealed === row.id ? null : row.id)}
                      className="tabular-nums underline-offset-2 hover:underline"
                      title={revealed === row.id ? 'Hide' : 'Show the full number'}
                    >
                      {revealed === row.id ? row.accountNumber : maskAccount(row.accountNumber)}
                    </button>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Account name</p>
                    <p className="truncate">{row.accountName}</p>
                  </div>
                </div>

                {row.previousAccountNumber && (
                  <p className="mt-2 text-xs text-amber-700">
                    Replaces an existing account ending {row.previousAccountNumber.slice(-4)} —
                    a change of destination, not a first-time entry.
                  </p>
                )}

                {rejecting === row.id ? (
                  <div className="mt-3 space-y-2">
                    <Input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="What needs correcting? They will see this."
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-full text-rose-600"
                        disabled={busy === row.id || !reason.trim()}
                        onClick={() => reject(row)}
                      >
                        {busy === row.id && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
                        Send back
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-full"
                        onClick={() => { setRejecting(null); setReason(''); }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      className="rounded-full"
                      disabled={busy === row.id || isPending}
                      onClick={() => approve(row)}
                    >
                      {busy === row.id ? (
                        <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Check className="mr-1 h-3.5 w-3.5" />
                      )}
                      Confirm
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setRejecting(row.id)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" />
                      Send back
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {settled.length > 0 && (
          <div className="border-t border-border/50 pt-3">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Recently reviewed
            </p>
            <div className="space-y-1">
              {settled.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{row.staffName}</span>
                  <span className="tabular-nums text-xs text-muted-foreground">
                    {maskAccount(row.accountNumber)}
                  </span>
                  <Badge variant={STATUS_VARIANT[row.status]} className="text-[10px]">
                    {row.status}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
