'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, BadgePercent, Banknote, Download, Filter, Receipt, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
import { cn, formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import type { FeeReport, FeeReportFilters } from '@/actions/fee.actions';

const MODE_LABEL: Record<string, string> = {
  CASH: 'Cash', BANK_TRANSFER: 'Bank transfer', POS: 'POS', MOBILE_MONEY: 'Mobile money', CHEQUE: 'Cheque', DIRECT_DEBIT: 'Direct debit',
};

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const isoDay = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function csvCell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) && !/^-?\d+(\.\d+)?$/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function FeeReportClient({ report, filters }: { report: FeeReport; filters: FeeReportFilters }) {
  const router = useRouter();
  const [f, setF] = useState({
    from: filters.from ?? isoDay(report.range.from),
    to: filters.to ?? isoDay(report.range.to),
    type: filters.type ?? 'ALL',
    branch: filters.branchId ?? '',
    mode: filters.paymentMode ?? '',
    officer: filters.receivedById ?? '',
  });
  const { totals, options } = report;

  const apply = (next = f) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v && !(k === 'type' && v === 'ALL')) q.set(k, v);
    router.push(`/fees?${q.toString()}`);
  };

  const preset = (days: number | 'month' | 'year') => {
    const end = new Date();
    const start = new Date();
    if (days === 'month') start.setDate(1);
    else if (days === 'year') start.setMonth(0, 1);
    else start.setDate(start.getDate() - (days - 1));
    const next = { ...f, from: isoDay(start.toISOString()), to: isoDay(end.toISOString()) };
    setF(next);
    apply(next);
  };

  const exportCsv = () => {
    const header = ['Date', 'Receipt', 'Type', 'Paid by', 'Reference', 'Amount', 'Payment mode', 'Branch', 'Received by', 'Reversed'];
    const lines = report.rows.map((r) => [
      new Date(r.date).toISOString(), r.receiptNumber, r.typeLabel, r.payer, r.reference ?? '', r.amount.toFixed(2),
      MODE_LABEL[r.paymentMode] ?? r.paymentMode, r.branch ?? '', r.receivedBy ?? '', r.reversed ? `Yes: ${r.reversalReason ?? ''}` : '',
    ]);
    const csv = [header, ...lines].map((row) => row.map((c) => csvCell(String(c))).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `fees-and-charges-${f.from}-to-${f.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fees &amp; charges</h1>
          <p className="text-muted-foreground">
            Application fees and loan default charges collected, {formatDate(report.range.from)} to {formatDate(report.range.to)}
          </p>
        </div>
        <Button variant="outline" onClick={exportCsv} disabled={!report.rows.length}>
          <Download className="mr-2 h-4 w-4" />Export CSV
        </Button>
      </div>

      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            {([['Today', 1], ['7 days', 7], ['30 days', 30], ['This month', 'month'], ['This year', 'year']] as const).map(([label, d]) => (
              <Button key={label} size="sm" variant="secondary" onClick={() => preset(d)}>{label}</Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="From"><Input type="date" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
            <Field label="To"><Input type="date" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
            <Field label="Type">
              <select className={selectClass} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as typeof f.type })}>
                <option value="ALL">Everything</option>
                {options.types.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </Field>
            {!options.lockedToBranch && (
              <Field label="Branch">
                <select className={selectClass} value={f.branch} onChange={(e) => setF({ ...f, branch: e.target.value })}>
                  <option value="">All branches</option>
                  {options.branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Field>
            )}
            <Field label="Paid by">
              <select className={selectClass} value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value })}>
                <option value="">Any way</option>
                {options.modes.map((m) => <option key={m} value={m}>{MODE_LABEL[m] ?? m}</option>)}
              </select>
            </Field>
            <Field label="Received by">
              <select className={selectClass} value={f.officer} onChange={(e) => setF({ ...f, officer: e.target.value })}>
                <option value="">Any officer</option>
                {options.staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => apply()}><Filter className="mr-2 h-4 w-4" />Apply filters</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Collected" color="emerald" icon={Banknote} value={formatCurrency(totals.collected)} description={`${totals.count} payment${totals.count === 1 ? '' : 's'}`} />
        <StatCard title="Discounts given" color="indigo" icon={BadgePercent} value={formatCurrency(totals.discounts)} description={`Waived charges ${formatCurrency(totals.waivers)}`} />
        <StatCard title="Fees still owed" color="amber" icon={Receipt} value={formatCurrency(totals.feesOwed)} description={`${totals.feesOwedCount} application${totals.feesOwedCount === 1 ? '' : 's'}, all dates`} />
        <StatCard title="Default charges owed" color="rose" icon={AlertTriangle} value={formatCurrency(totals.chargesOwed)} description={`${totals.chargesOwedLoans} loan${totals.chargesOwedLoans === 1 ? '' : 's'} · ${formatCurrency(totals.chargesAccrued)} charged in period`} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By type</CardTitle></CardHeader>
          <CardContent>
            {report.byType.length === 0 ? <Empty /> : (
              <ul className="divide-y text-sm">
                {report.byType.map((t) => (
                  <li key={t.type} className="flex items-center justify-between py-2">
                    <span>{t.label} <span className="text-xs text-muted-foreground">({t.count})</span></span>
                    <span className="font-semibold tabular-nums">{formatCurrency(t.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">By payment mode</CardTitle></CardHeader>
          <CardContent>
            {report.byMode.length === 0 ? <Empty /> : (
              <ul className="divide-y text-sm">
                {report.byMode.map((m) => (
                  <li key={m.mode} className="flex items-center justify-between py-2">
                    <span>{MODE_LABEL[m.mode] ?? m.mode}</span>
                    <span className="font-semibold tabular-nums">{formatCurrency(m.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-4 w-4" />Payments ({report.rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {report.rows.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Date</th>
                    <th className="py-2 pr-3 font-medium">Receipt</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium">Paid by</th>
                    <th className="py-2 pr-3 text-right font-medium">Amount</th>
                    <th className="py-2 pr-3 font-medium">Mode</th>
                    <th className="py-2 pr-3 font-medium">Branch</th>
                    <th className="py-2 font-medium">Received by</th>
                  </tr>
                </thead>
                <tbody>
                  {report.rows.map((r) => (
                    <tr key={`${r.type}-${r.id}`} className={cn('border-t', r.reversed && 'text-muted-foreground')}>
                      <td className="whitespace-nowrap py-2 pr-3">{formatDateTime(r.date)}</td>
                      <td className={cn('py-2 pr-3 font-mono text-xs', r.reversed && 'line-through')}>{r.receiptNumber}</td>
                      <td className="py-2 pr-3">{r.typeLabel}{r.reversed && <span className="ml-1 text-xs text-rose-600">reversed</span>}</td>
                      <td className="py-2 pr-3">
                        {r.payer}
                        {r.reference && <span className="block font-mono text-[11px] text-muted-foreground">{r.reference}</span>}
                      </td>
                      <td className={cn('py-2 pr-3 text-right font-medium tabular-nums', r.reversed && 'line-through')}>{formatCurrency(r.amount)}</td>
                      <td className="py-2 pr-3">{MODE_LABEL[r.paymentMode] ?? r.paymentMode}</td>
                      <td className="py-2 pr-3">{r.branch ?? '-'}</td>
                      <td className="py-2">{r.receivedBy ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {totals.reversed > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{formatCurrency(totals.reversed)} reversed in this period, not counted in the totals.</p>
          )}
        </CardContent>
      </Card>

      {(report.discounts.length > 0 || report.waivers.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Discounts ({report.discounts.length})</CardTitle></CardHeader>
            <CardContent>
              {report.discounts.length === 0 ? <Empty /> : (
                <ul className="divide-y text-sm">
                  {report.discounts.map((d) => (
                    <li key={d.id} className="space-y-0.5 py-2">
                      <div className="flex justify-between gap-2">
                        <span>{d.payer} <span className="font-mono text-xs text-muted-foreground">{d.reference}</span></span>
                        <span className="font-semibold tabular-nums">{formatCurrency(d.discount)} of {formatCurrency(d.fee)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{d.typeLabel} · {formatDate(d.date)} · {d.by}: &ldquo;{d.reason}&rdquo;</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Default charges waived ({report.waivers.length})</CardTitle></CardHeader>
            <CardContent>
              {report.waivers.length === 0 ? <Empty /> : (
                <ul className="divide-y text-sm">
                  {report.waivers.map((w) => (
                    <li key={w.id} className="space-y-0.5 py-2">
                      <div className="flex justify-between gap-2">
                        <span>{w.borrower} <span className="font-mono text-xs text-muted-foreground">{w.loanNumber}</span></span>
                        <span className="font-semibold tabular-nums">{formatCurrency(w.amount)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground">{formatDate(w.date)} · {w.by}: &ldquo;{w.reason}&rdquo;</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function Empty() {
  return <p className="py-6 text-center text-sm text-muted-foreground">Nothing in this period</p>;
}
