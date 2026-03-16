import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import {
  BookOpen,
  FileText,
  Calendar,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/utils';
import type { SessionUser } from '@/types';

async function getAccountingSummary() {
  const [
    totalAccounts,
    pendingJournals,
    postedJournals,
    openPeriods,
    recentEntries,
  ] = await Promise.all([
    prisma.chartOfAccounts.count({ where: { isActive: true, isHeader: false } }),
    prisma.journalEntry.count({ where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] } } }),
    prisma.journalEntry.count({ where: { status: 'POSTED' } }),
    prisma.financialPeriod.count({ where: { status: 'OPEN' } }),
    prisma.journalEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: {
        id: true,
        entryNumber: true,
        description: true,
        totalDebit: true,
        status: true,
        entryDate: true,
      },
    }),
  ]);

  // Get total debit/credit sums from posted entries
  const totals = await prisma.journalEntry.aggregate({
    where: { status: 'POSTED' },
    _sum: { totalDebit: true, totalCredit: true },
  });

  return {
    totalAccounts,
    pendingJournals,
    postedJournals,
    openPeriods,
    recentEntries: recentEntries.map((e) => ({
      ...e,
      totalDebit: e.totalDebit.toNumber(),
    })),
    totalDebits: totals._sum.totalDebit?.toNumber() || 0,
    totalCredits: totals._sum.totalCredit?.toNumber() || 0,
  };
}

const statusVariant: Record<string, 'success' | 'warning' | 'info' | 'secondary' | 'default' | 'error'> = {
  POSTED: 'success',
  DRAFT: 'warning',
  PENDING_APPROVAL: 'info',
  APPROVED: 'info',
  REVERSED: 'secondary',
  VOIDED: 'error',
};

export default async function AccountingPage() {
  const session = await auth();
  if (!session) redirect('/login');

  const user = session.user as SessionUser;
  const hasAccounting = user.permissions.some((p) => p.startsWith('ACCOUNTS:'));
  if (!hasAccounting) redirect('/dashboard');

  const summary = await getAccountingSummary();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Accounting</h1>
        <p className="text-muted-foreground">
          General ledger and financial management
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">GL Accounts</p>
                <p className="text-2xl font-bold mt-1">{summary.totalAccounts}</p>
                <p className="text-xs text-muted-foreground mt-1">Active postable accounts</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-blue-50 flex items-center justify-center">
                <BookOpen className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pending Journals</p>
                <p className="text-2xl font-bold mt-1">{summary.pendingJournals}</p>
                <p className="text-xs text-muted-foreground mt-1">Awaiting posting/approval</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-yellow-50 flex items-center justify-center">
                <FileText className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Posted Journals</p>
                <p className="text-2xl font-bold mt-1">{summary.postedJournals}</p>
                <p className="text-xs text-muted-foreground mt-1">Total posted entries</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-green-50 flex items-center justify-center">
                <FileText className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Open Periods</p>
                <p className="text-2xl font-bold mt-1">{summary.openPeriods}</p>
                <p className="text-xs text-muted-foreground mt-1">Financial periods open</p>
              </div>
              <div className="h-12 w-12 rounded-lg bg-slate-50 flex items-center justify-center">
                <Calendar className="h-6 w-6 text-slate-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Module Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link href="/accounting/chart-of-accounts">
          <Card className="hover:border-primary transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-blue-600" />
                Chart of Accounts
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                View and manage the general ledger chart of accounts. Browse account hierarchy,
                balances, and account details.
              </p>
              <p className="text-sm font-medium mt-2">
                {summary.totalAccounts} active accounts
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/accounting/journal">
          <Card className="hover:border-primary transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileText className="h-5 w-5 text-yellow-600" />
                Journal Entries
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Create, review, and post journal entries. View transaction history and manage
                draft entries.
              </p>
              <p className="text-sm font-medium mt-2">
                {summary.pendingJournals} pending entries
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/accounting/periods">
          <Card className="hover:border-primary transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Calendar className="h-5 w-5 text-slate-600" />
                Financial Periods
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Manage financial periods, perform period close operations, and control
                posting permissions by period.
              </p>
              <p className="text-sm font-medium mt-2">
                {summary.openPeriods} open periods
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link href="/accounting/trial-balance">
          <Card className="hover:border-primary transition-colors cursor-pointer h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-green-600" />
                Trial Balance
                <ArrowRight className="h-4 w-4 ml-auto text-muted-foreground" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Generate and review trial balance reports. Verify that total debits equal
                total credits across all accounts.
              </p>
              <p className="text-sm font-medium mt-2">
                Total posted: {formatCurrency(summary.totalDebits)}
              </p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Recent Journal Entries */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent Journal Entries</CardTitle>
        </CardHeader>
        <CardContent>
          {summary.recentEntries.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No journal entries yet
            </p>
          ) : (
            <div className="space-y-3">
              {summary.recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <div>
                      <p className="text-sm font-medium">{entry.entryNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.description}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {formatCurrency(entry.totalDebit)}
                    </span>
                    <Badge variant={statusVariant[entry.status] || 'default'}>
                      {entry.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
