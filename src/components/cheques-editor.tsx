'use client';

import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ChequeInput } from '@/lib/loan-cheques';

/** A cheque row as the form holds it: every field a string. */
export interface ChequeRow {
  bankName: string;
  chequeNumber: string;
  amount: string;
  chequeDate: string;
}

export const blankCheque: ChequeRow = { bankName: '', chequeNumber: '', amount: '', chequeDate: '' };

/** Rows to the shape createLoan takes; empty rows are dropped server side. */
export function toChequeInputs(rows: ChequeRow[]): ChequeInput[] {
  return rows.map((r) => ({
    bankName: r.bankName.trim(),
    chequeNumber: r.chequeNumber.trim(),
    amount: r.amount ? parseFloat(r.amount) : null,
    chequeDate: r.chequeDate || null,
  }));
}

/** The cheques submitted: one row per cheque, add as many as were handed in. */
export function ChequesEditor({
  value,
  onChange,
  title = 'Cheques Submitted',
}: {
  value: ChequeRow[];
  onChange: (rows: ChequeRow[]) => void;
  title?: string;
}) {
  const update = (i: number, field: keyof ChequeRow, v: string) =>
    onChange(value.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium">{title}</p>
      {value.length === 0 && <p className="text-xs text-muted-foreground">No cheques added.</p>}
      {value.map((r, i) => (
        <div key={i} className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] sm:items-end">
          <div className="space-y-1.5">
            <Label>Bank <span className="text-destructive">*</span></Label>
            <Input value={r.bankName} onChange={(e) => update(i, 'bankName', e.target.value)} placeholder="e.g. GTBank" />
          </div>
          <div className="space-y-1.5">
            <Label>Cheque No. <span className="text-destructive">*</span></Label>
            <Input value={r.chequeNumber} onChange={(e) => update(i, 'chequeNumber', e.target.value)} placeholder="Cheque number" />
          </div>
          <div className="space-y-1.5">
            <Label>Amount (NGN)</Label>
            <Input type="number" min="0" step="0.01" value={r.amount} onChange={(e) => update(i, 'amount', e.target.value)} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <Label>Date on Cheque</Label>
            <Input type="date" value={r.chequeDate} onChange={(e) => update(i, 'chequeDate', e.target.value)} />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove cheque ${i + 1}`}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...value, { ...blankCheque }])}>
        <Plus className="mr-2 h-4 w-4" />
        Add Cheque
      </Button>
    </div>
  );
}
