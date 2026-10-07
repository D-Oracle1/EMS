'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCurrency, formatDate } from '@/lib/utils';
import { waiveDefaultCharges, type getLoanDefaultCharges } from '@/actions/loan-charges.actions';

type Charges = NonNullable<Awaited<ReturnType<typeof getLoanDefaultCharges>>>;

/**
 * A loan's default charges: the daily charge on overdue instalments, what has
 * been paid and waived, and what is owed. Repayments clear these first.
 */
export function LoanDefaultCharges({ loanId, charges }: { loanId: string; charges: Charges }) {
  const router = useRouter();
  const [waiving, setWaiving] = useState(false);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const { totals } = charges;

  if (!charges.rate && totals.charged === 0) return null;

  const waive = async () => {
    setBusy(true);
    const result = await waiveDefaultCharges(loanId, Number(amount), reason);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    setWaiving(false);
    setAmount('');
    setReason('');
    router.refresh();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <AlertTriangle className="h-5 w-5 text-amber-600" />Default charges
        </CardTitle>
        <CardDescription>
          {charges.rate
            ? `${charges.rate}% a day on the unpaid amount of each instalment, from ${charges.graceDays} day${charges.graceDays === 1 ? '' : 's'} after it falls due. Repayments clear these first.`
            : 'This loan product charges no default charges now.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Figure label="Charged" value={totals.charged} />
          <Figure label="Paid" value={totals.paid} />
          <Figure label="Waived" value={totals.waived} />
          <Figure label="Owed now" value={totals.owed} strong={totals.owed > 0} />
        </dl>

        {charges.instalments.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Instalment</th>
                  <th className="py-1.5 pr-3 font-medium">Due</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Charged</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Paid</th>
                  <th className="py-1.5 pr-3 text-right font-medium">Waived</th>
                  <th className="py-1.5 text-right font-medium">Owed</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {charges.instalments.map((s) => (
                  <tr key={s.installmentNumber} className="border-t">
                    <td className="py-1.5 pr-3">#{s.installmentNumber}</td>
                    <td className="py-1.5 pr-3">{formatDate(s.dueDate)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatCurrency(s.charged)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatCurrency(s.paid)}</td>
                    <td className="py-1.5 pr-3 text-right">{formatCurrency(s.waived)}</td>
                    <td className="py-1.5 text-right font-medium">{formatCurrency(s.owed)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {charges.waivers.length > 0 && (
          <ul className="space-y-1 text-xs text-muted-foreground">
            {charges.waivers.map((w) => (
              <li key={w.id}>
                {formatDate(w.date)}: {formatCurrency(w.amount)} waived by {w.by ?? 'a manager'}: &ldquo;{w.reason}&rdquo;
              </li>
            ))}
          </ul>
        )}

        {charges.recent.length > 0 && (
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground">Latest daily charges</summary>
            <ul className="mt-2 space-y-0.5 text-xs tabular-nums">
              {charges.recent.map((c) => (
                <li key={c.id}>
                  {formatDate(c.date)} · instalment #{c.installmentNumber} · {c.rate}% of {formatCurrency(c.overdueAmount)} = {formatCurrency(c.amount)}
                </li>
              ))}
            </ul>
          </details>
        )}

        {charges.canWaive && totals.owed > 0 && (
          waiving ? (
            <div className="grid grid-cols-1 gap-2 rounded-lg bg-muted/50 p-3 sm:grid-cols-[10rem_1fr_auto]">
              <Input type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount" aria-label="Amount to waive" />
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the waiver" maxLength={300} />
              <div className="flex gap-1">
                <Button size="sm" className="h-10" disabled={busy || !(Number(amount) > 0)} onClick={waive}>
                  {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Waive
                </Button>
                <Button size="sm" variant="ghost" className="h-10" onClick={() => setWaiving(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => { setWaiving(true); setAmount(String(totals.owed)); }}>
              Waive default charges
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}

function Figure({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={strong ? 'font-semibold text-rose-700 dark:text-rose-300' : 'font-medium'}>{formatCurrency(value)}</dd>
    </div>
  );
}
