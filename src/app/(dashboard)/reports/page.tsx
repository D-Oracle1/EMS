'use client';

import { useState, useTransition } from 'react';
import {
  FileText,
  Download,
  CheckCircle2,
  XCircle,
  RefreshCw,
  BarChart3,
  Wallet,
  Scale,
  Landmark,
  Printer,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import {
  getTrialBalanceReport,
  getIncomeStatement,
  getBalanceSheet,
  getLoanPortfolioReport,
  getCashFlowReport,
  logExportAction,
} from '@/actions/report.actions';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type ReportType = 'trial-balance' | 'income-statement' | 'balance-sheet' | 'loan-portfolio' | 'cash-flow';

const formatCurrency = (amount: number): string => {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 2,
  }).format(amount);
};

const formatDate = (date: string | Date | null): string => {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const statusVariant: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default' | 'secondary'> = {
  ACTIVE: 'success',
  OVERDUE: 'error',
  DEFAULTED: 'error',
  CLOSED: 'secondary',
  PENDING: 'warning',
  APPROVED: 'info',
};

const reportTabs: { key: ReportType; label: string; icon: React.ElementType }[] = [
  { key: 'trial-balance', label: 'Trial Balance', icon: Scale },
  { key: 'income-statement', label: 'Income Statement', icon: BarChart3 },
  { key: 'balance-sheet', label: 'Balance Sheet', icon: Landmark },
  { key: 'cash-flow', label: 'Cash Flow', icon: TrendingUp },
  { key: 'loan-portfolio', label: 'Loan Portfolio', icon: Wallet },
];

export default function ReportsPage() {
  const [activeReport, setActiveReport] = useState<ReportType>('trial-balance');
  const [isPending, startTransition] = useTransition();

  // Trial Balance state
  const [trialBalance, setTrialBalance] = useState<{
    rows: Array<{ accountCode: string; accountName: string; accountType: string; debit: number; credit: number }>;
    totalDebits: number;
    totalCredits: number;
    isBalanced: boolean;
  } | null>(null);

  // Income Statement state
  const [incomeStatement, setIncomeStatement] = useState<{
    income: Array<{ accountCode: string; accountName: string; amount: number }>;
    expenses: Array<{ accountCode: string; accountName: string; amount: number }>;
    totalIncome: number;
    totalExpenses: number;
    netIncome: number;
  } | null>(null);
  const [isStartDate, setIsStartDate] = useState('');
  const [isEndDate, setIsEndDate] = useState('');

  // Balance Sheet state
  const [balanceSheet, setBalanceSheet] = useState<Record<
    string,
    { accounts: Array<{ code: string; name: string; balance: number }>; total: number }
  > | null>(null);

  // Cash Flow state
  const [cashFlow, setCashFlow] = useState<{
    openingBalance: number;
    closingBalance: number;
    netChange: number;
    sections: Array<{ module: string; label: string; cashIn: number; cashOut: number; netCash: number }>;
    periodStart?: string;
    periodEnd?: string;
  } | null>(null);
  const [cfStartDate, setCfStartDate] = useState('');
  const [cfEndDate, setCfEndDate] = useState('');

  // Loan Portfolio state
  const [loanPortfolio, setLoanPortfolio] = useState<{
    portfolio: Array<{
      loanNumber: string;
      customer: string;
      customerNumber: string;
      product: string;
      principalAmount: number;
      outstanding: number;
      status: string;
      disbursedAt: string | Date | null;
      maturityDate: string | Date | null;
    }>;
    summary: {
      totalLoans: number;
      totalDisbursed: number;
      totalOutstanding: number;
      activeLoans: number;
      overdueLoans: number;
    };
  } | null>(null);

  const loadReport = (type: ReportType) => {
    setActiveReport(type);
    startTransition(async () => {
      try {
        switch (type) {
          case 'trial-balance': {
            const data = await getTrialBalanceReport();
            setTrialBalance(data);
            break;
          }
          case 'income-statement': {
            const data = await getIncomeStatement(
              isStartDate || undefined,
              isEndDate || undefined
            );
            setIncomeStatement(data);
            break;
          }
          case 'balance-sheet': {
            const data = await getBalanceSheet();
            setBalanceSheet(data);
            break;
          }
          case 'cash-flow': {
            const data = await getCashFlowReport(
              cfStartDate || undefined,
              cfEndDate || undefined
            );
            setCashFlow(data);
            break;
          }
          case 'loan-portfolio': {
            const data = await getLoanPortfolioReport();
            setLoanPortfolio(data);
            break;
          }
        }
      } catch (error: any) {
        toast.error(error.message || `Failed to load ${type} report`);
      }
    });
  };

  const handleExportPDF = async () => {
    const doc = new jsPDF();
    const title = reportTabs.find((t) => t.key === activeReport)?.label ?? activeReport;
    const dateStr = new Date().toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });

    doc.setFontSize(16);
    doc.text('Hylink Finance Limited', 14, 15);
    doc.setFontSize(12);
    doc.text(title, 14, 23);
    doc.setFontSize(9);
    doc.text(`Generated: ${dateStr}`, 14, 29);

    if (activeReport === 'trial-balance' && trialBalance) {
      autoTable(doc, {
        startY: 35,
        head: [['Account Code', 'Account Name', 'Type', 'Debit', 'Credit']],
        body: [
          ...trialBalance.rows.map((r) => [
            r.accountCode, r.accountName, r.accountType,
            r.debit > 0 ? formatCurrency(r.debit) : '-',
            r.credit > 0 ? formatCurrency(r.credit) : '-',
          ]),
          ['', '', 'TOTALS', formatCurrency(trialBalance.totalDebits), formatCurrency(trialBalance.totalCredits)],
        ],
      });
    } else if (activeReport === 'income-statement' && incomeStatement) {
      autoTable(doc, {
        startY: 35,
        head: [['Account Code', 'Account Name', 'Amount']],
        body: [
          [{ content: 'INCOME', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [220, 252, 231] } }],
          ...incomeStatement.income.map((r) => [r.accountCode, r.accountName, formatCurrency(r.amount)]),
          ['', 'Total Income', formatCurrency(incomeStatement.totalIncome)],
          [{ content: 'EXPENSES', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [254, 226, 226] } }],
          ...incomeStatement.expenses.map((r) => [r.accountCode, r.accountName, formatCurrency(r.amount)]),
          ['', 'Total Expenses', formatCurrency(incomeStatement.totalExpenses)],
          ['', 'NET INCOME', formatCurrency(incomeStatement.netIncome)],
        ],
      });
    } else if (activeReport === 'balance-sheet' && balanceSheet) {
      const sections = [
        { label: 'ASSETS', key: 'ASSET' },
        { label: 'LIABILITIES', key: 'LIABILITY' },
        { label: 'EQUITY', key: 'EQUITY' },
      ];
      const body: any[] = [];
      for (const s of sections) {
        body.push([{ content: s.label, colSpan: 3, styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } }]);
        for (const a of balanceSheet[s.key]?.accounts ?? []) {
          body.push([a.code, a.name, formatCurrency(a.balance)]);
        }
        body.push(['', `Total ${s.label}`, formatCurrency(balanceSheet[s.key]?.total ?? 0)]);
      }
      autoTable(doc, { startY: 35, head: [['Code', 'Name', 'Balance']], body });
    } else if (activeReport === 'cash-flow' && cashFlow) {
      autoTable(doc, {
        startY: 35,
        head: [['Activity', 'Cash In', 'Cash Out', 'Net Cash Flow']],
        body: [
          [{ content: 'Opening Cash Balance', colSpan: 3, styles: { fontStyle: 'bold' } }, formatCurrency(cashFlow.openingBalance)],
          ...cashFlow.sections.map((s) => [s.label, formatCurrency(s.cashIn), formatCurrency(s.cashOut), formatCurrency(s.netCash)]),
          [{ content: 'Net Change in Cash', colSpan: 3, styles: { fontStyle: 'bold' } }, formatCurrency(cashFlow.netChange)],
          [{ content: 'Closing Cash Balance', colSpan: 3, styles: { fontStyle: 'bold', fillColor: [229, 231, 235] } }, formatCurrency(cashFlow.closingBalance)],
        ],
      });
    } else if (activeReport === 'loan-portfolio' && loanPortfolio) {
      autoTable(doc, {
        startY: 35,
        head: [['Loan #', 'Customer', 'Product', 'Principal', 'Outstanding', 'Status', 'Disbursed', 'Maturity']],
        body: loanPortfolio.portfolio.map((l) => [
          l.loanNumber, l.customer, l.product,
          formatCurrency(l.principalAmount), formatCurrency(l.outstanding),
          l.status, formatDate(l.disbursedAt), formatDate(l.maturityDate),
        ]),
        styles: { fontSize: 7 },
      });
    } else {
      toast.error('Generate the report first before exporting');
      return;
    }

    doc.save(`${activeReport}-${new Date().toISOString().slice(0, 10)}.pdf`);
    logExportAction(activeReport, 'PDF').catch(() => {});
    toast.success('PDF exported successfully');
  };

  const handleExportCSV = async () => {
    let headers: string[] = [];
    let rows: string[][] = [];

    if (activeReport === 'trial-balance' && trialBalance) {
      headers = ['Account Code', 'Account Name', 'Account Type', 'Debit', 'Credit'];
      rows = trialBalance.rows.map((r) => [
        r.accountCode, r.accountName, r.accountType, r.debit.toString(), r.credit.toString(),
      ]);
    } else if (activeReport === 'income-statement' && incomeStatement) {
      headers = ['Section', 'Account Code', 'Account Name', 'Amount'];
      rows = [
        ...incomeStatement.income.map((r) => ['Income', r.accountCode, r.accountName, r.amount.toString()]),
        ...incomeStatement.expenses.map((r) => ['Expense', r.accountCode, r.accountName, r.amount.toString()]),
        ['', '', 'Net Income', incomeStatement.netIncome.toString()],
      ];
    } else if (activeReport === 'balance-sheet' && balanceSheet) {
      headers = ['Type', 'Code', 'Name', 'Balance'];
      rows = [];
      for (const type of ['ASSET', 'LIABILITY', 'EQUITY']) {
        for (const a of balanceSheet[type]?.accounts ?? []) {
          rows.push([type, a.code, a.name, a.balance.toString()]);
        }
      }
    } else if (activeReport === 'cash-flow' && cashFlow) {
      headers = ['Activity', 'Cash In', 'Cash Out', 'Net Cash Flow'];
      rows = [
        ['Opening Cash Balance', '', '', cashFlow.openingBalance.toString()],
        ...cashFlow.sections.map((s) => [s.label, s.cashIn.toString(), s.cashOut.toString(), s.netCash.toString()]),
        ['Net Change in Cash', '', '', cashFlow.netChange.toString()],
        ['Closing Cash Balance', '', '', cashFlow.closingBalance.toString()],
      ];
    } else if (activeReport === 'loan-portfolio' && loanPortfolio) {
      headers = ['Loan Number', 'Customer', 'Customer Number', 'Product', 'Principal', 'Outstanding', 'Status', 'Disbursed Date', 'Maturity Date'];
      rows = loanPortfolio.portfolio.map((l) => [
        l.loanNumber, l.customer, l.customerNumber, l.product,
        l.principalAmount.toString(), l.outstanding.toString(), l.status,
        l.disbursedAt ? new Date(l.disbursedAt).toISOString().slice(0, 10) : '',
        l.maturityDate ? new Date(l.maturityDate).toISOString().slice(0, 10) : '',
      ]);
    } else {
      toast.error('Generate the report first before exporting');
      return;
    }

    const escapeCsv = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const csvContent = [
      headers.map(escapeCsv).join(','),
      ...rows.map((row) => row.map(escapeCsv).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeReport}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    logExportAction(activeReport, 'CSV').catch(() => {});
    toast.success('CSV exported successfully');
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Financial Reports</h1>
          <p className="text-muted-foreground">
            Generate and view financial reports
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.print()} disabled={isPending} className="print:hidden">
            <Printer className="mr-2 h-4 w-4" />
            Print
          </Button>
          <Button variant="outline" onClick={handleExportPDF} disabled={isPending} className="print:hidden">
            <Download className="mr-2 h-4 w-4" />
            Export PDF
          </Button>
          <Button variant="outline" onClick={handleExportCSV} disabled={isPending} className="print:hidden">
            <FileText className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Report Type Selector */}
      <div className="flex flex-wrap gap-2">
        {reportTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <Button
              key={tab.key}
              variant={activeReport === tab.key ? 'default' : 'outline'}
              onClick={() => loadReport(tab.key)}
              disabled={isPending}
              className="gap-2"
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </Button>
          );
        })}
      </div>

      {/* Loading State */}
      {isPending && (
        <Card>
          <CardContent className="flex items-center justify-center py-16">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
            <span className="text-muted-foreground">Loading report...</span>
          </CardContent>
        </Card>
      )}

      {/* Trial Balance Report */}
      {activeReport === 'trial-balance' && !isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Scale className="h-5 w-5" />
              Trial Balance
              {trialBalance && (
                trialBalance.isBalanced ? (
                  <Badge variant="success" className="ml-2">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Balanced
                  </Badge>
                ) : (
                  <Badge variant="error" className="ml-2">
                    <XCircle className="h-3 w-3 mr-1" />
                    Not Balanced
                  </Badge>
                )
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!trialBalance ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Click the &quot;Trial Balance&quot; button above to generate this report.</p>
              </div>
            ) : trialBalance.rows.length === 0 ? (
              <p className="text-center py-8 text-muted-foreground">
                No accounts with balances found.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Account Code</TableHead>
                    <TableHead>Account Name</TableHead>
                    <TableHead>Account Type</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trialBalance.rows.map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-sm">{row.accountCode}</TableCell>
                      <TableCell>{row.accountName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{row.accountType}</Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.debit > 0 ? formatCurrency(row.debit) : '-'}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {row.credit > 0 ? formatCurrency(row.credit) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Totals Row */}
                  <TableRow className="bg-muted/50 font-bold border-t-2">
                    <TableCell colSpan={3} className="text-right font-bold">
                      TOTALS
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(trialBalance.totalDebits)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-bold">
                      {formatCurrency(trialBalance.totalCredits)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Income Statement Report */}
      {activeReport === 'income-statement' && !isPending && (
        <div className="space-y-4">
          {/* Date Filters for Income Statement */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="is-start-date" className="text-xs">Start Date</Label>
                  <Input
                    id="is-start-date"
                    type="date"
                    value={isStartDate}
                    onChange={(e) => setIsStartDate(e.target.value)}
                    className="w-[170px]"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="is-end-date" className="text-xs">End Date</Label>
                  <Input
                    id="is-end-date"
                    type="date"
                    value={isEndDate}
                    onChange={(e) => setIsEndDate(e.target.value)}
                    className="w-[170px]"
                  />
                </div>
                <Button onClick={() => loadReport('income-statement')} disabled={isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                  Generate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Income Statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!incomeStatement ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Click the &quot;Income Statement&quot; button above to generate this report.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Income Section */}
                  <div>
                    <h3 className="text-base font-semibold mb-3">Income</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account Code</TableHead>
                          <TableHead>Account Name</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incomeStatement.income.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              No income accounts with balances
                            </TableCell>
                          </TableRow>
                        ) : (
                          incomeStatement.income.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-sm">{item.accountCode}</TableCell>
                              <TableCell>{item.accountName}</TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                        <TableRow className="bg-green-50 font-bold border-t-2">
                          <TableCell colSpan={2} className="text-right font-bold">
                            Total Income
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-green-700">
                            {formatCurrency(incomeStatement.totalIncome)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <Separator />

                  {/* Expenses Section */}
                  <div>
                    <h3 className="text-base font-semibold mb-3">Expenses</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Account Code</TableHead>
                          <TableHead>Account Name</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {incomeStatement.expenses.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-muted-foreground">
                              No expense accounts with balances
                            </TableCell>
                          </TableRow>
                        ) : (
                          incomeStatement.expenses.map((item, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-sm">{item.accountCode}</TableCell>
                              <TableCell>{item.accountName}</TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrency(item.amount)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                        <TableRow className="bg-red-50 font-bold border-t-2">
                          <TableCell colSpan={2} className="text-right font-bold">
                            Total Expenses
                          </TableCell>
                          <TableCell className="text-right font-mono font-bold text-red-700">
                            {formatCurrency(incomeStatement.totalExpenses)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>

                  <Separator />

                  {/* Net Income */}
                  <div
                    className={`flex items-center justify-between p-4 rounded-lg border-2 ${
                      incomeStatement.netIncome >= 0
                        ? 'bg-green-50 border-green-200'
                        : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <span className="text-lg font-bold">NET INCOME</span>
                    <span
                      className={`text-xl font-bold font-mono ${
                        incomeStatement.netIncome >= 0 ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {formatCurrency(incomeStatement.netIncome)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Balance Sheet Report */}
      {activeReport === 'balance-sheet' && !isPending && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Landmark className="h-5 w-5" />
              Balance Sheet
              {balanceSheet && (
                (() => {
                  const assetsTotal = balanceSheet.ASSET?.total ?? 0;
                  const liabilitiesTotal = balanceSheet.LIABILITY?.total ?? 0;
                  const equityTotal = balanceSheet.EQUITY?.total ?? 0;
                  const isBalanced = Math.abs(assetsTotal - (liabilitiesTotal + equityTotal)) < 0.01;
                  return isBalanced ? (
                    <Badge variant="success" className="ml-2">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Assets = Liabilities + Equity
                    </Badge>
                  ) : (
                    <Badge variant="error" className="ml-2">
                      <XCircle className="h-3 w-3 mr-1" />
                      Not Balanced
                    </Badge>
                  );
                })()
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!balanceSheet ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>Click the &quot;Balance Sheet&quot; button above to generate this report.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Assets Section */}
                <div>
                  <h3 className="text-base font-semibold mb-3">Assets</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(balanceSheet.ASSET?.accounts ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            No asset accounts with balances
                          </TableCell>
                        </TableRow>
                      ) : (
                        (balanceSheet.ASSET?.accounts ?? []).map((account, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{account.code}</TableCell>
                            <TableCell>{account.name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(account.balance)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      <TableRow className="bg-blue-50 font-bold border-t-2">
                        <TableCell colSpan={2} className="text-right font-bold">
                          Total Assets
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(balanceSheet.ASSET?.total ?? 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                {/* Liabilities Section */}
                <div>
                  <h3 className="text-base font-semibold mb-3">Liabilities</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(balanceSheet.LIABILITY?.accounts ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            No liability accounts with balances
                          </TableCell>
                        </TableRow>
                      ) : (
                        (balanceSheet.LIABILITY?.accounts ?? []).map((account, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{account.code}</TableCell>
                            <TableCell>{account.name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(account.balance)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      <TableRow className="bg-orange-50 font-bold border-t-2">
                        <TableCell colSpan={2} className="text-right font-bold">
                          Total Liabilities
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(balanceSheet.LIABILITY?.total ?? 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                {/* Equity Section */}
                <div>
                  <h3 className="text-base font-semibold mb-3">Equity</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(balanceSheet.EQUITY?.accounts ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-muted-foreground">
                            No equity accounts with balances
                          </TableCell>
                        </TableRow>
                      ) : (
                        (balanceSheet.EQUITY?.accounts ?? []).map((account, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-mono text-sm">{account.code}</TableCell>
                            <TableCell>{account.name}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(account.balance)}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      <TableRow className="bg-purple-50 font-bold border-t-2">
                        <TableCell colSpan={2} className="text-right font-bold">
                          Total Equity
                        </TableCell>
                        <TableCell className="text-right font-mono font-bold">
                          {formatCurrency(balanceSheet.EQUITY?.total ?? 0)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <Separator />

                {/* Balance Check */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">Total Assets</p>
                      <p className="text-xl font-bold font-mono">
                        {formatCurrency(balanceSheet.ASSET?.total ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">Total Liabilities</p>
                      <p className="text-xl font-bold font-mono">
                        {formatCurrency(balanceSheet.LIABILITY?.total ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="p-4 text-center">
                      <p className="text-sm text-muted-foreground">Total Equity</p>
                      <p className="text-xl font-bold font-mono">
                        {formatCurrency(balanceSheet.EQUITY?.total ?? 0)}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Cash Flow Report */}
      {activeReport === 'cash-flow' && !isPending && (
        <div className="space-y-4">
          {/* Date Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                  <Label htmlFor="cf-start" className="text-xs">Start Date</Label>
                  <Input id="cf-start" type="date" value={cfStartDate} onChange={(e) => setCfStartDate(e.target.value)} className="w-[170px]" />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cf-end" className="text-xs">End Date</Label>
                  <Input id="cf-end" type="date" value={cfEndDate} onChange={(e) => setCfEndDate(e.target.value)} className="w-[170px]" />
                </div>
                <Button onClick={() => loadReport('cash-flow')} disabled={isPending}>
                  <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                  Generate
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Cash Flow Statement
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!cashFlow ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Click &quot;Generate&quot; above to view the Cash Flow Statement.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Opening Balance */}
                  <div className="flex items-center justify-between p-4 rounded-lg bg-slate-50 border">
                    <span className="font-semibold">Opening Cash Balance</span>
                    <span className="font-bold font-mono text-lg">{formatCurrency(cashFlow.openingBalance)}</span>
                  </div>

                  {/* Activities by Module */}
                  {cashFlow.sections.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No cash movements found for this period.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Activity</TableHead>
                          <TableHead className="text-right">Cash Inflows</TableHead>
                          <TableHead className="text-right">Cash Outflows</TableHead>
                          <TableHead className="text-right">Net Cash Flow</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {cashFlow.sections.map((section, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{section.label}</TableCell>
                            <TableCell className="text-right font-mono text-green-700">
                              {section.cashIn > 0 ? formatCurrency(section.cashIn) : '-'}
                            </TableCell>
                            <TableCell className="text-right font-mono text-red-700">
                              {section.cashOut > 0 ? formatCurrency(section.cashOut) : '-'}
                            </TableCell>
                            <TableCell className={`text-right font-mono font-medium ${section.netCash >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                              <span className="flex items-center justify-end gap-1">
                                {section.netCash >= 0
                                  ? <TrendingUp className="h-3 w-3" />
                                  : <TrendingDown className="h-3 w-3" />}
                                {formatCurrency(Math.abs(section.netCash))}
                              </span>
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="bg-muted/50 font-bold border-t-2">
                          <TableCell className="font-bold">Net Change in Cash</TableCell>
                          <TableCell />
                          <TableCell />
                          <TableCell className={`text-right font-mono font-bold ${cashFlow.netChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {formatCurrency(cashFlow.netChange)}
                          </TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}

                  {/* Closing Balance */}
                  <div className={`flex items-center justify-between p-4 rounded-lg border-2 ${cashFlow.closingBalance >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                    <span className="font-bold text-lg">Closing Cash Balance</span>
                    <span className={`font-bold font-mono text-xl ${cashFlow.closingBalance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(cashFlow.closingBalance)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Loan Portfolio Report */}
      {activeReport === 'loan-portfolio' && !isPending && (
        <div className="space-y-4">
          {/* Summary Cards */}
          {loanPortfolio && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Total Loans</p>
                  <p className="text-2xl font-bold">{loanPortfolio.summary.totalLoans}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Total Disbursed</p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(loanPortfolio.summary.totalDisbursed)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Total Outstanding</p>
                  <p className="text-lg font-bold font-mono">
                    {formatCurrency(loanPortfolio.summary.totalOutstanding)}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Active Loans</p>
                  <p className="text-2xl font-bold text-green-600">
                    {loanPortfolio.summary.activeLoans}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <p className="text-sm text-muted-foreground">Overdue Loans</p>
                  <p className="text-2xl font-bold text-red-600">
                    {loanPortfolio.summary.overdueLoans}
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Loan Portfolio
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!loanPortfolio ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Click the &quot;Loan Portfolio&quot; button above to generate this report.</p>
                </div>
              ) : loanPortfolio.portfolio.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  No active loans found in the portfolio.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Loan Number</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Principal</TableHead>
                        <TableHead className="text-right">Outstanding</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Disbursed Date</TableHead>
                        <TableHead>Maturity Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loanPortfolio.portfolio.map((loan, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-mono text-sm">{loan.loanNumber}</TableCell>
                          <TableCell>
                            <div className="text-sm font-medium">{loan.customer}</div>
                            <div className="text-xs text-muted-foreground">{loan.customerNumber}</div>
                          </TableCell>
                          <TableCell>{loan.product}</TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(loan.principalAmount)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {formatCurrency(loan.outstanding)}
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusVariant[loan.status] || 'default'}>
                              {loan.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(loan.disbursedAt)}</TableCell>
                          <TableCell className="text-sm">{formatDate(loan.maturityDate)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
