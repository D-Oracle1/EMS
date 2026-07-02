'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, FileDown, FileSpreadsheet, FileText, Loader2, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { getSavingsProducts } from '@/actions/savings.actions';
import {
  getSavingsReport,
  type SavingsReportRow,
  type SavingsReportFilters,
} from '@/actions/savings-report.actions';
import { logExportAction } from '@/actions/report.actions';
import type { SessionUser } from '@/types';

const STATUSES = ['ACTIVE', 'DORMANT', 'FROZEN', 'MATURED', 'COMPLETED', 'CLOSED', 'TERMINATED'];
const ALL = '__all__';

function fmtDate(d: string | null) {
  return d ? new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
}

export function SavingsReportsClient({ user: _user }: { user: SessionUser }) {
  const [products, setProducts] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<SavingsReportRow[]>([]);
  const [summary, setSummary] = useState({ count: 0, totalBalance: 0, totalInterest: 0, totalDeposits: 0 });
  const [loading, setLoading] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const [productId, setProductId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [maturityMonth, setMaturityMonth] = useState('');

  useEffect(() => {
    getSavingsProducts()
      .then((p: any) => setProducts(p.map((x: any) => ({ id: x.id, name: x.name }))))
      .catch(() => {});
  }, []);

  const run = () => {
    setLoading(true);
    const filters: SavingsReportFilters = {
      productId: productId || undefined,
      status: status || undefined,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      maturityMonth: maturityMonth || undefined,
    };
    getSavingsReport(filters)
      .then((res) => {
        setRows(res.rows);
        setSummary(res.summary);
        setHasRun(true);
      })
      .catch((e) => toast.error(e.message || 'Failed to run report'))
      .finally(() => setLoading(false));
  };

  const filename = `savings-report-${new Date().toISOString().slice(0, 10)}`;
  const HEADERS = ['Account', 'Customer', 'Customer No', 'Product', 'Status', 'Balance', 'Interest Accrued', 'Total Deposits', 'Start', 'Maturity', 'Months Left', 'Officer'];
  const toRowArray = (r: SavingsReportRow) => [
    r.accountNumber, r.customer, r.customerNumber, r.product, r.status,
    r.currentBalance, r.interestAccrued, r.totalDeposits,
    fmtDate(r.startDate), fmtDate(r.maturityDate), r.monthsRemaining ?? '', r.officer,
  ];

  const guard = () => {
    if (!hasRun || rows.length === 0) {
      toast.error('Run the report first');
      return false;
    }
    return true;
  };

  const exportCsv = () => {
    if (!guard()) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const csv = [HEADERS.map(esc).join(','), ...rows.map((r) => toRowArray(r).map(esc).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    logExportAction('savings-report', 'CSV').catch(() => {});
    toast.success('CSV exported');
  };

  const exportExcel = async () => {
    if (!guard()) return;
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Savings Report');
    ws.addRow(HEADERS);
    ws.getRow(1).font = { bold: true };
    rows.forEach((r) => ws.addRow(toRowArray(r)));
    ws.addRow([]);
    ws.addRow(['', '', '', '', 'TOTALS', summary.totalBalance, summary.totalInterest, summary.totalDeposits]);
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
    logExportAction('savings-report', 'EXCEL').catch(() => {});
    toast.success('Excel exported');
  };

  const exportPdf = async () => {
    if (!guard()) return;
    const { default: jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;
    const doc = new jsPDF({ orientation: 'landscape' });
    doc.setFontSize(14);
    doc.text('Savings Report', 14, 16);
    doc.setFontSize(9);
    doc.text(
      `${summary.count} accounts · Balance ${formatCurrency(summary.totalBalance)} · Interest ${formatCurrency(summary.totalInterest)}`,
      14,
      22
    );
    autoTable(doc, {
      startY: 27,
      head: [HEADERS],
      body: rows.map((r) => [
        r.accountNumber, r.customer, r.customerNumber, r.product, r.status,
        formatCurrency(r.currentBalance), formatCurrency(r.interestAccrued), formatCurrency(r.totalDeposits),
        fmtDate(r.startDate), fmtDate(r.maturityDate), r.monthsRemaining ?? '', r.officer,
      ]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [16, 185, 129] },
    });
    doc.save(`${filename}.pdf`);
    logExportAction('savings-report', 'PDF').catch(() => {});
    toast.success('PDF exported');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-pink-50 flex items-center justify-center">
            <BarChart3 className="h-5 w-5 text-pink-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Savings Reports</h1>
            <p className="text-sm text-muted-foreground">Filter and export savings account data</p>
          </div>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/savings/dashboard">Dashboard</Link>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={productId || ALL} onValueChange={(v) => setProductId(v === ALL ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All products" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All products</SelectItem>
                  {products.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={status || ALL} onValueChange={(v) => setStatus(v === ALL ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Maturity Month</Label>
              <Input type="month" value={maturityMonth} onChange={(e) => setMaturityMonth(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Opened From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Opened To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div className="flex items-end">
              <Button onClick={run} disabled={loading} className="w-full">
                {loading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Filter className="h-4 w-4 mr-1" />}
                Run Report
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      {hasRun && (
        <Card>
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{summary.count} accounts</Badge>
              <Badge variant="success">Balance {formatCurrency(summary.totalBalance)}</Badge>
              <Badge variant="warning">Interest {formatCurrency(summary.totalInterest)}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={exportCsv}>
                <FileText className="h-4 w-4 mr-1" />
                CSV
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel}>
                <FileSpreadsheet className="h-4 w-4 mr-1" />
                Excel
              </Button>
              <Button variant="outline" size="sm" onClick={exportPdf}>
                <FileDown className="h-4 w-4 mr-1" />
                PDF
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {rows.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground">No accounts match these filters.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Balance</TableHead>
                      <TableHead className="text-right">Interest</TableHead>
                      <TableHead>Maturity</TableHead>
                      <TableHead>Officer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>
                          <Link href={`/savings/${r.id}`} className="font-medium hover:underline">
                            {r.customer}
                          </Link>
                          <div className="text-xs text-muted-foreground">{r.accountNumber}</div>
                        </TableCell>
                        <TableCell className="text-sm">{r.product}</TableCell>
                        <TableCell>
                          <Badge variant="secondary">{r.status.replace(/_/g, ' ')}</Badge>
                        </TableCell>
                        <TableCell className="text-right">{formatCurrency(r.currentBalance)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.interestAccrued)}</TableCell>
                        <TableCell className="text-sm">{fmtDate(r.maturityDate)}</TableCell>
                        <TableCell className="text-sm">{r.officer}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
