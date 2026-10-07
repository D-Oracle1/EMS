'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { BadgePercent, Banknote, Loader2, Receipt, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn, formatCurrency, formatDateTime } from '@/lib/utils';
import { FEE_STATE_LABEL } from '@/lib/fees';
import { recordFeePayment, setFeeDiscount, reverseFeePayment } from '@/actions/fee.actions';
import type { FeeSummary } from '@/lib/fee-ledger';

const MODES: [string, string][] = [
  ['CASH', 'Cash'], ['BANK_TRANSFER', 'Bank transfer'], ['POS', 'POS'], ['MOBILE_MONEY', 'Mobile money'], ['CHEQUE', 'Cheque'],
];
export const MODE_LABEL: Record<string, string> = Object.fromEntries([...MODES, ['DIRECT_DEBIT', 'Direct debit']]);

const selectClass =
  'flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const STATE_VARIANT = { NONE: 'secondary', UNPAID: 'destructive', PART_PAID: 'warning', PAID: 'success', WAIVED: 'success' } as const;

/**
 * A form's fee: what is owed, any discount, the payments with their receipts,
 * and recording the next one. Managers and admins also discount the fee and
 * reverse a payment recorded in error (lib/fees canDiscount).
 */
export function FeePanel({ responseId, fee, canDiscount, readOnly, compact, onChanged }: {
  responseId: string;
  fee: FeeSummary;
  canDiscount: boolean;
  /** A rejected application: shown, not taken. */
  readOnly?: boolean;
  /** Inside a guarantor's row. */
  compact?: boolean;
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<'idle' | 'pay' | 'discount'>('idle');
  const [amount, setAmount] = useState('');
  const [payMode, setPayMode] = useState('CASH');
  const [reference, setReference] = useState('');
  const [discount, setDiscount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const open = (next: 'pay' | 'discount') => {
    setMode(next);
    if (next === 'pay') setAmount(String(fee.balance));
    if (next === 'discount') { setDiscount(fee.discount ? String(fee.discount) : ''); setReason(fee.discountReason ?? ''); }
  };

  const pay = async () => {
    setBusy(true);
    const result = await recordFeePayment({ responseId, amount: Number(amount), paymentMode: payMode, paymentReference: reference });
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    setMode('idle');
    setReference('');
    onChanged();
  };

  const saveDiscount = async () => {
    setBusy(true);
    const result = await setFeeDiscount(responseId, Number(discount) || 0, reason);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    setMode('idle');
    onChanged();
  };

  const reverse = async (paymentId: string, receipt: string) => {
    const why = window.prompt(`Reverse receipt ${receipt}? Its ledger entry is reversed too. Give the reason:`);
    if (why === null) return;
    setBusy(true);
    const result = await reverseFeePayment(paymentId, why);
    setBusy(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    onChanged();
  };

  const owing = fee.balance > 0 && !readOnly;

  return (
    <div className={cn('space-y-2 rounded-xl border p-3', compact ? 'bg-background' : 'border-emerald-200 dark:border-emerald-500/30')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Banknote className="h-4 w-4 text-emerald-600" />
          {fee.basis && fee.basis !== 'Registration fee' ? `Processing fee (${fee.basis})` : 'Registration fee'}
        </p>
        <Badge variant={STATE_VARIANT[fee.state]}>{FEE_STATE_LABEL[fee.state]}</Badge>
      </div>

      <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <Figure label="Fee" value={formatCurrency(fee.due)} />
        <Figure label="Discount" value={fee.discount ? `- ${formatCurrency(fee.discount)}` : '-'} />
        <Figure label="Paid" value={formatCurrency(fee.paid)} />
        <Figure label="Still owed" value={formatCurrency(fee.balance)} strong={fee.balance > 0} />
      </dl>

      {fee.discount > 0 && (
        <p className="text-xs text-muted-foreground">
          Discount by {fee.discountBy ?? 'a manager'}: &ldquo;{fee.discountReason}&rdquo;
        </p>
      )}

      {fee.payments.length > 0 && (
        <ul className="space-y-1 text-xs">
          {fee.payments.map((p) => (
            <li key={p.id} className={cn('flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/60 px-2 py-1.5', p.reversed && 'opacity-60')}>
              <span className="flex flex-wrap items-center gap-x-2">
                <Receipt className="h-3.5 w-3.5" />
                <span className={cn('font-mono', p.reversed && 'line-through')}>{p.receiptNumber}</span>
                <span className="font-semibold">{formatCurrency(p.amount)}</span>
                <span>{MODE_LABEL[p.paymentMode] ?? p.paymentMode}{p.paymentReference ? ` · ${p.paymentReference}` : ''}</span>
                <span className="text-muted-foreground">{formatDateTime(p.receivedAt)} · {p.receivedBy}</span>
                {p.reversed && <span className="text-rose-600">Reversed{p.reversed.reason ? `: ${p.reversed.reason}` : ''}</span>}
              </span>
              {canDiscount && !p.reversed && (
                <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-rose-600" disabled={busy} onClick={() => reverse(p.id, p.receiptNumber)}>
                  <Undo2 className="h-3 w-3" />Reverse
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {mode === 'pay' && (
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-emerald-50/60 p-2 sm:grid-cols-[1fr_1fr_1fr_auto] dark:bg-emerald-500/5">
          <Input className="h-9" type="number" min={0} step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount received" placeholder="Amount" />
          <select className={selectClass} value={payMode} onChange={(e) => setPayMode(e.target.value)} aria-label="Paid by">
            {MODES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <Input className="h-9" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)" maxLength={120} />
          <div className="flex gap-1">
            <Button size="sm" variant="success" className="h-9" disabled={busy || !(Number(amount) > 0)} onClick={pay}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Save
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setMode('idle')}>Cancel</Button>
          </div>
        </div>
      )}

      {mode === 'discount' && (
        <div className="grid grid-cols-1 gap-2 rounded-lg bg-indigo-50/60 p-2 sm:grid-cols-[10rem_1fr_auto] dark:bg-indigo-500/5">
          <Input className="h-9" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} aria-label="Discount amount" placeholder="Discount (NGN)" />
          <Input className="h-9" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for the discount" maxLength={300} />
          <div className="flex gap-1">
            <Button size="sm" className="h-9" disabled={busy} onClick={saveDiscount}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}Apply
            </Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setMode('idle')}>Cancel</Button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-3">
            Enter 0 to remove the discount. Money already paid cannot be discounted: fees are non-refundable.
          </p>
        </div>
      )}

      {mode === 'idle' && !readOnly && (owing || canDiscount) && (
        <div className="flex flex-wrap gap-2">
          {owing && (
            <Button size="sm" variant="secondary" onClick={() => open('pay')}>
              <Banknote className="mr-1.5 h-3.5 w-3.5" />Record payment
            </Button>
          )}
          {canDiscount && fee.due - fee.paid > 0 && (
            <Button size="sm" variant="ghost" onClick={() => open('discount')}>
              <BadgePercent className="mr-1.5 h-3.5 w-3.5" />{fee.discount ? 'Change discount' : 'Give discount'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn('tabular-nums', strong && 'font-semibold text-rose-700 dark:text-rose-300')}>{value}</dd>
    </div>
  );
}
