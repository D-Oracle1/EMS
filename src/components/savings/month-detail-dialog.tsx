'use client';

/**
 * Everything that happened to savings in one month.
 *
 * Shared by the home dashboard and the savings dashboard: both plot savings
 * movement by month, and a reader clicking a bar on either wants the same
 * answer. One implementation rather than two that drift.
 *
 * The figures come from the server rather than from a chart's own totals, so
 * this can show what a chart cannot: which accounts moved, who processed each
 * transaction, and the running balance afterwards. Exports reuse the shape of
 * the savings reports page and go through logExportAction, so a report pulled
 * from here lands in the audit trail like any other.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, FileDown, FileSpreadsheet, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatCurrency } from '@/lib/utils';
import {
  getSavingsMonthDetail,
  type SavingsMonthDetail,
} from '@/actions/savings-report.actions';
import { logExportAction } from '@/actions/report.actions';

const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-09' → 'September 2026'. Exported so callers can label their own UI. */
export function monthLong(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_LONG[Number(month) - 1] ?? month} ${year}`;
}

/** '2026-09' → 'Sep', for axis ticks. */
export function monthShort(key: string): string {
  const month = Number(key.split('-')[1]);
  return MONTH_LONG[month - 1]?.slice(0, 3) ?? key;
}

export function MonthDetailDialog({
  month,
  onClose,
}: {
  /** YYYY-MM, or null when the dialog is shut. */
  month: string | null;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<SavingsMonthDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!month) {
      setDetail(null);
      return;
    }
    let stale = false;
    setLoading(true);
    getSavingsMonthDetail(month)
      .then((result) => {
        if (!stale) setDetail(result);
      })
      .catch((error: unknown) => {
        if (!stale) {
          toast.error(error instanceof Error ? error.message : 'Could not load that month');
          onClose();
        }
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month]);

  const HEADERS = ['Date', 'Reference', 'Type', 'Account', 'Customer', 'Amount', 'Balance after', 'Mode', 'Processed by'];
  const toRow = (t: SavingsMonthDetail['transactions'][number]) => [
    new Date(t.date).toLocaleDateString('en-NG'),
    t.ref,
    t.type,
    t.accountNumber,
    t.customer,
    t.amount,
    t.balanceAfter,
    t.paymentMode,
    t.processedBy,
  ];

  const filename = detail ? `savings-${detail.month}` : 'savings-month';

  const exportCsv = () => {
    if (!detail) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [
      HEADERS.map(esc).join(','),
      ...detail.transactions.map((t) => toRow(t).map(esc).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    logExportAction('savings-month', 'CSV').catch(() => {});
    toast.success('CSV exported');
  };

  const exportExcel = async () => {
    if (!detail) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(detail.month);
    ws.addRow([`Savings movement — ${detail.label}`]);
    ws.getRow(1).font = { bold: true, size: 14 };
    ws.addRow([]);
    ws.addRow(['Deposits', detail.summary.deposits.amount, `${detail.summary.deposits.count} transactions`]);
    ws.addRow(['Withdrawals', detail.summary.withdrawals.amount, `${detail.summary.withdrawals.count} transactions`]);
    ws.addRow(['Net', detail.summary.net]);
    ws.addRow([]);
    ws.addRow(HEADERS);
    ws.getRow(7).font = { bold: true };
    detail.transactions.forEach((t) => ws.addRow(toRow(t)));
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    logExportAction('savings-month', 'EXCEL').catch(() => {});
    toast.success('Excel exported');
  };

  const exportPdf = async () => {
    if (!detail) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text(`Savings movement — ${detail.label}`, 14, 16);
    doc.setFontSize(9);
    doc.text(
      `In ${formatCurrency(detail.summary.deposits.amount)} · Out ${formatCurrency(
        detail.summary.withdrawals.amount
      )} · Net ${formatCurrency(detail.summary.net)} · ${detail.summary.accounts} accounts`,
      14,
      22
    );
    autoTable(doc, {
      startY: 27,
      head: [HEADERS],
      body: detail.transactions.map((t) => [
        new Date(t.date).toLocaleDateString('en-NG'),
        t.ref,
        t.type,
        t.accountNumber,
        t.customer,
        formatCurrency(t.amount),
        formatCurrency(t.balanceAfter),
        t.paymentMode,
        t.processedBy,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [27, 175, 122] },
    });
    doc.save(`${filename}.pdf`);
    logExportAction('savings-month', 'PDF').catch(() => {});
    toast.success('PDF exported');
  };

  return (
    <Dialog open={Boolean(month)} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail ? detail.label : 'Loading month…'}</DialogTitle>
        </DialogHeader>

        {loading && !detail ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Pulling the month together…
          </p>
        ) : detail ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <MonthFigure
                label="Deposits"
                value={formatCurrency(detail.summary.deposits.amount)}
                sub={`${detail.summary.deposits.count} transaction${detail.summary.deposits.count === 1 ? '' : 's'}`}
              />
              <MonthFigure
                label="Withdrawals"
                value={formatCurrency(detail.summary.withdrawals.amount)}
                sub={`${detail.summary.withdrawals.count} transaction${detail.summary.withdrawals.count === 1 ? '' : 's'}`}
              />
              <MonthFigure
                label="Net"
                value={formatCurrency(detail.summary.net)}
                sub="deposits less withdrawals"
              />
              <MonthFigure
                label="Accounts"
                value={String(detail.summary.accounts)}
                sub={`${detail.summary.customers} customer${detail.summary.customers === 1 ? '' : 's'}`}
              />
            </div>

            {detail.summary.busiestDay && (
              <p className="text-sm text-muted-foreground">
                Busiest day:{' '}
                <span className="font-medium text-foreground">
                  {new Date(detail.summary.busiestDay.date).toLocaleDateString('en-NG', {
                    day: 'numeric',
                    month: 'long',
                  })}
                </span>{' '}
                — {formatCurrency(detail.summary.busiestDay.amount)} moved.
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <FileDown className="mr-1 h-4 w-4" /> CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="mr-1 h-4 w-4" /> Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportPdf}>
                <FileText className="mr-1 h-4 w-4" /> PDF
              </Button>
            </div>

            {detail.truncated && (
              <p className="rounded-2xl bg-amber-500/10 px-3 py-2 text-xs text-amber-700">
                This month has more transactions than the dialog lists. The figures above cover the
                whole month; the table and exports show the first {detail.transactions.length}.
              </p>
            )}

            {detail.transactions.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                No deposits or withdrawals were recorded in {detail.label}.
              </p>
            ) : (
              <div className="max-h-[42vh] overflow-auto rounded-2xl border border-border/60">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b">
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Date</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Account</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Customer</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground">Amount</th>
                      <th className="px-2 py-2 text-right font-medium text-muted-foreground">Balance after</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">By</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {detail.transactions.map((t) => (
                      <tr key={t.id} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-2 py-1.5">
                          {new Date(t.date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-2 py-1.5">
                          <Link href={`/savings/${t.accountId}`} className="hover:underline">
                            {t.accountNumber}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5">{t.customer}</td>
                        <td className="px-2 py-1.5">
                          <Badge
                            variant={t.type === 'DEPOSIT' ? 'success' : 'secondary'}
                            className="text-[10px]"
                          >
                            {t.type}
                          </Badge>
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">{formatCurrency(t.amount)}</td>
                        <td className="px-2 py-1.5 text-right text-muted-foreground">
                          {formatCurrency(t.balanceAfter)}
                        </td>
                        <td className="px-2 py-1.5 text-xs text-muted-foreground">{t.processedBy}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MonthFigure({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="glass-inset p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tracking-tight">{value}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}
