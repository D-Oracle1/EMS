'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Printer, FileDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils';
import { getSavingsStatement, type SavingsStatement } from '@/actions/savings-report.actions';

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function SavingsStatementClient({ accountId }: { accountId: string }) {
  const [statement, setStatement] = useState<SavingsStatement | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = () => {
    setLoading(true);
    getSavingsStatement(accountId, from || undefined, to || undefined)
      .then(setStatement)
      .catch((e) => toast.error(e.message || 'Failed to load statement'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportPdf = async () => {
    if (!statement) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF();

    doc.setFontSize(16);
    doc.text('Savings Statement', 14, 18);
    doc.setFontSize(10);
    doc.text(`${statement.customer.name} (${statement.customer.customerNumber})`, 14, 26);
    doc.text(`Account: ${statement.account.accountNumber} · ${statement.product.name}`, 14, 32);
    const periodLabel =
      statement.period.from || statement.period.to
        ? `Period: ${statement.period.from ?? 'start'} to ${statement.period.to ?? 'today'}`
        : 'Period: Full history';
    doc.text(periodLabel, 14, 38);
    doc.text(`Opening balance: ${formatCurrency(statement.openingBalance)}`, 14, 44);

    autoTable(doc, {
      startY: 50,
      head: [['Date', 'Ref', 'Description', 'Credit', 'Debit', 'Balance']],
      body: statement.lines.map((l) => [
        fmtDate(l.date),
        l.ref,
        l.description,
        l.credit ? formatCurrency(l.credit) : '',
        l.debit ? formatCurrency(l.debit) : '',
        formatCurrency(l.balance),
      ]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [16, 185, 129] },
    });

    const endY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    doc.setFontSize(10);
    doc.text(`Total Deposits: ${formatCurrency(statement.totals.deposits)}`, 14, endY);
    doc.text(`Total Interest: ${formatCurrency(statement.totals.interest)}`, 14, endY + 6);
    doc.text(`Closing Balance: ${formatCurrency(statement.totals.closingBalance)}`, 14, endY + 12);
    doc.text(`Expected Payout at Maturity: ${formatCurrency(statement.account.expectedPayout)}`, 14, endY + 18);

    doc.save(`savings-statement-${statement.account.accountNumber}.pdf`);
    toast.success('Statement PDF exported');
  };

  return (
    <div className="space-y-6">
      {/* Toolbar — hidden when printing */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/savings/${accountId}`}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Account
          </Link>
        </Button>
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">From</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">To</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9" />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Apply
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.print()} disabled={!statement}>
            <Printer className="h-4 w-4 mr-1" />
            Print
          </Button>
          <Button size="sm" onClick={exportPdf} disabled={!statement}>
            <FileDown className="h-4 w-4 mr-1" />
            PDF
          </Button>
        </div>
      </div>

      {loading && !statement ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading statement…
        </div>
      ) : statement ? (
        <Card>
          <CardContent className="p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-4">
              <div>
                <h1 className="text-xl font-bold">Savings Statement</h1>
                <p className="text-sm text-muted-foreground">
                  Generated {fmtDate(statement.generatedAt)}
                </p>
              </div>
              <div className="text-sm text-right">
                <p className="font-medium">{statement.customer.name}</p>
                <p className="text-muted-foreground">{statement.customer.customerNumber}</p>
                <p className="text-muted-foreground">{statement.customer.phone}</p>
              </div>
            </div>

            {/* Account summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Account</p>
                <p className="font-medium">{statement.account.accountNumber}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Product</p>
                <p className="font-medium">{statement.product.name}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Start / Maturity</p>
                <p className="font-medium">
                  {fmtDate(statement.account.startDate)} → {fmtDate(statement.account.maturityDate)}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Term Progress</p>
                <p className="font-medium">
                  {statement.account.monthsCompleted} done
                  {statement.account.monthsRemaining != null
                    ? ` · ${statement.account.monthsRemaining} left`
                    : ''}
                </p>
              </div>
            </div>

            {/* Transactions */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Reference</th>
                    <th className="py-2 pr-3">Description</th>
                    <th className="py-2 pr-3 text-right">Credit</th>
                    <th className="py-2 pr-3 text-right">Debit</th>
                    <th className="py-2 text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b bg-muted/30">
                    <td className="py-2 pr-3" colSpan={5}>
                      Opening Balance
                    </td>
                    <td className="py-2 text-right font-medium">
                      {formatCurrency(statement.openingBalance)}
                    </td>
                  </tr>
                  {statement.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-6 text-center text-muted-foreground">
                        No transactions in this period.
                      </td>
                    </tr>
                  ) : (
                    statement.lines.map((l, i) => (
                      <tr key={`${l.ref}-${i}`} className="border-b">
                        <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(l.date)}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{l.ref}</td>
                        <td className="py-2 pr-3">{l.description}</td>
                        <td className="py-2 pr-3 text-right text-emerald-700">
                          {l.credit ? formatCurrency(l.credit) : ''}
                        </td>
                        <td className="py-2 pr-3 text-right text-rose-700">
                          {l.debit ? formatCurrency(l.debit) : ''}
                        </td>
                        <td className="py-2 text-right font-medium">{formatCurrency(l.balance)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 border-t pt-4 text-sm">
              <div>
                <p className="text-muted-foreground">Total Deposits</p>
                <p className="font-semibold">{formatCurrency(statement.totals.deposits)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total Interest</p>
                <p className="font-semibold">{formatCurrency(statement.totals.interest)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Closing Balance</p>
                <p className="font-semibold">{formatCurrency(statement.totals.closingBalance)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Expected Payout</p>
                <p className="font-semibold text-emerald-700">
                  {formatCurrency(statement.account.expectedPayout)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
