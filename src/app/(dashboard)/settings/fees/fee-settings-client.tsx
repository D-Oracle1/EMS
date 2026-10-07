'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, Banknote, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn, formatCurrency } from '@/lib/utils';
import { computeFee } from '@/lib/fees';
import { saveFeeSettings, type FeeSettingRow } from '@/actions/fee.actions';

type Product = { id: string; name: string; processingFee: number; penaltyRate: number | null; gracePeriodDays: number };

export function FeeSettingsClient({ initial, products }: { initial: FeeSettingRow[]; products: Product[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial.map((r) => ({ ...r, amountText: String(r.amount) })));
  const [saving, setSaving] = useState(false);

  const set = (purpose: string, patch: Partial<(typeof rows)[number]>) =>
    setRows((rs) => rs.map((r) => (r.purpose === purpose ? { ...r, ...patch } : r)));

  const save = async () => {
    setSaving(true);
    const result = await saveFeeSettings(rows.map((r) => ({ purpose: r.purpose, kind: r.kind, amount: Number(r.amountText), isActive: r.isActive })));
    setSaving(false);
    if (!result.success) return toast.error(result.error);
    toast.success(result.message);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fees</h1>
          <p className="text-muted-foreground">What each application form costs. Each applicant owes the fee in force on the day they apply.</p>
        </div>
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save fees
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><Banknote className="h-5 w-5" />Application form fees</CardTitle>
          <CardDescription>
            A fixed amount, or a percentage of the amount applied for. Fees are non-refundable. Only managers and admins can discount one, and must give a reason.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {rows.map((r) => {
            const example = computeFee({ kind: r.kind, amount: Number(r.amountText) || 0, isActive: r.isActive }, 500_000);
            return (
              <div key={r.purpose} className={cn('grid grid-cols-1 items-center gap-3 rounded-xl border p-3 sm:grid-cols-[1fr_auto_9rem_auto]', !r.isActive && 'opacity-70')}>
                <div className="min-w-0">
                  <p className="font-medium">{r.label}</p>
                  <p className="text-xs text-muted-foreground">
                    {!r.isActive
                      ? 'No fee'
                      : r.kind === 'PERCENT'
                        ? `e.g. ${example ? formatCurrency(example.due) : '-'} on ${formatCurrency(500_000)} applied for`
                        : `${formatCurrency(Number(r.amountText) || 0)} per form`}
                  </p>
                </div>
                <div className="inline-flex rounded-lg border p-0.5 text-sm">
                  {(['FLAT', 'PERCENT'] as const).map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => set(r.purpose, { kind: k })}
                      disabled={!r.isActive}
                      className={cn('rounded-md px-3 py-1', r.kind === k ? 'bg-indigo-600 text-white' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {k === 'FLAT' ? 'Fixed NGN' : '% of amount'}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step={r.kind === 'PERCENT' ? '0.01' : '1'}
                    value={r.amountText}
                    onChange={(e) => set(r.purpose, { amountText: e.target.value })}
                    disabled={!r.isActive}
                    aria-label={`${r.label} fee`}
                    className="pr-12"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    {r.kind === 'PERCENT' ? '%' : 'NGN'}
                  </span>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  Charge
                  <Switch checked={r.isActive} onCheckedChange={(v) => set(r.purpose, { isActive: v })} />
                </label>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            A loan created from a paid loan application does not deduct the product&apos;s processing fee again at disbursement.
            Loans created in the office without an application still deduct it.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg"><AlertTriangle className="h-5 w-5 text-amber-600" />Loan default charges</CardTitle>
          <CardDescription>
            Set per loan product. Once an instalment is past its due date and the grace period, it is charged the daily rate on what it
            still owes, every day until paid. Repayments clear these charges first. Managers and admins can waive them on the loan page.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active loan products.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Product</th>
                    <th className="py-1.5 pr-3 font-medium">Processing fee</th>
                    <th className="py-1.5 pr-3 font-medium">Default charge</th>
                    <th className="py-1.5 font-medium">Grace period</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-t">
                      <td className="py-2 pr-3 font-medium">{p.name}</td>
                      <td className="py-2 pr-3">{p.processingFee}%</td>
                      <td className="py-2 pr-3">{p.penaltyRate ? `${p.penaltyRate}% a day` : <span className="text-muted-foreground">None</span>}</td>
                      <td className="py-2">{p.gracePeriodDays} day{p.gracePeriodDays === 1 ? '' : 's'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/settings/loan-products">Change them under Loan Products</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
