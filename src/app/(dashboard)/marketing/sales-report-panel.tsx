'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { monthKey, SALE_TYPE_LABELS } from '@/lib/marketing-access';
import { getSalesReport } from '@/actions/marketing.actions';

type Report = Awaited<ReturnType<typeof getSalesReport>>;

// Chart styling follows the savings dashboard. Ticks use the muted text token;
// bars take currentColor from the wrapper, so light and dark each get their
// own validated step (fuchsia-600 / fuchsia-500).
const AXIS = { fontSize: 11, fill: 'hsl(var(--muted-foreground))' } as const;
const TOOLTIP_STYLE = {
  borderRadius: 12,
  fontSize: 12,
  background: 'hsl(var(--popover))',
  color: 'hsl(var(--popover-foreground))',
  border: '1px solid hsl(var(--border))',
  boxShadow: '0 12px 32px -12px hsla(220, 43%, 11%, 0.35)',
} as const;

const compact = (n: number) =>
  new Intl.NumberFormat('en-NG', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

function monthOptions() {
  const now = new Date();
  return Array.from({ length: 24 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { value: monthKey(d), label: d.toLocaleDateString('en-NG', { month: 'short', year: 'numeric' }) };
  });
}

/** CSV cell: quoted when it holds a comma, quote or newline. */
const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function downloadCsv(report: Report) {
  const head = ['Reference', 'Date', 'Type', 'Seller', 'Branch', 'Customer', 'Account', 'Amount', 'Payment', 'Posted ref', 'Commission', 'Commission paid'];
  const lines = report.rows.map((r) => [
    r.reference, r.collectedAt.slice(0, 10), SALE_TYPE_LABELS[r.type], r.marketer, r.branch ?? 'Head office',
    r.customer, r.target?.label ?? '', r.amount.toFixed(2), r.paymentMode, r.postedReference ?? '',
    (r.commissionAmount ?? 0).toFixed(2), r.commissionPaidAt ? r.commissionPaidAt.slice(0, 10) : '',
  ].map(cell).join(','));
  const blob = new Blob([[head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sales-${report.fromMonth}-to-${report.toMonth}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function Breakdown({ title, rows, label }: {
  title: string;
  rows: { amount: number; count: number; commission: number }[];
  label: (i: number) => string;
}) {
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">No confirmed sales in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Share</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell className="text-sm">{label(i)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.count}</TableCell>
                  <TableCell className="whitespace-nowrap text-right tabular-nums">{formatCurrency(r.amount)}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {total > 0 ? `${Math.round((r.amount / total) * 100)}%` : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function SalesReportPanel({ company }: { company: boolean }) {
  const options = useMemo(() => monthOptions(), []);
  const [fromMonth, setFromMonth] = useState(() => options[5].value);
  const [toMonth, setToMonth] = useState(() => options[0].value);
  const [report, setReport] = useState<Report | null>(null);
  const [loadedKey, setLoadedKey] = useState('');
  const key = `${fromMonth}:${toMonth}`;

  useEffect(() => {
    getSalesReport(fromMonth, toMonth)
      .then((r) => { setReport(r); setLoadedKey(`${fromMonth}:${toMonth}`); })
      .catch((e) => toast.error(e.message || 'Could not load the report'));
  }, [fromMonth, toMonth]);

  const loading = !report || loadedKey !== key;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5" />{company ? 'Company sales report' : 'My sales report'}
          </CardTitle>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Select value={fromMonth} onValueChange={setFromMonth}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Select value={toMonth} onValueChange={setToMonth}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button variant="outline" disabled={loading || !report?.rows.length} onClick={() => report && downloadCsv(report)}>
              <Download className="mr-2 h-4 w-4" />Export CSV
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading...</div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Figure label="Confirmed sales" value={formatCurrency(report!.totals.amount)} sub={`${report!.totals.count} sale${report!.totals.count === 1 ? '' : 's'}`} />
                {company
                  ? <Figure label="Company (direct) sales" value={formatCurrency(report!.totals.companyAmount)} sub="Not credited to any staff" />
                  : <Figure label="Commission earned" value={formatCurrency(report!.totals.commission)} />}
                <Figure label="Still awaiting confirmation" value={String(report!.totals.pending)} />
                <Figure label="Rejected" value={String(report!.totals.rejected)} />
              </div>

              <div>
                <p className="mb-2 text-sm font-medium">Confirmed sales by month</p>
                <div className="text-fuchsia-600 dark:text-fuchsia-500">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={report!.byMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} tickFormatter={compact} width={56} />
                      <Tooltip
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.5 }}
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number, _n: string, item: { payload?: { count?: number } }) =>
                          [`${formatCurrency(v)} · ${item.payload?.count ?? 0} sales`, 'Confirmed']}
                      />
                      <Bar dataKey="amount" name="Confirmed" fill="currentColor" radius={[4, 4, 0, 0]} maxBarSize={48} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              {report!.truncated && (
                <p className="text-xs text-muted-foreground">Showing the first 5,000 sales in this period. Narrow the range for complete figures.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!loading && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {company && <Breakdown title="Staff vs company" rows={report!.byChannel} label={(i) => report!.byChannel[i].channel} />}
          <Breakdown title="By sale type" rows={report!.byType} label={(i) => report!.byType[i].label} />
          {company && <Breakdown title="By branch" rows={report!.byBranch} label={(i) => report!.byBranch[i].branch} />}
          {company && <Breakdown title="By seller" rows={report!.byMarketer} label={(i) => report!.byMarketer[i].name} />}
          <Breakdown title="By month" rows={report!.byMonth} label={(i) => report!.byMonth[i].label} />
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-muted/40 px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
