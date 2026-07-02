'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  PiggyBank,
  Wallet,
  TrendingUp,
  CalendarClock,
  Percent,
  CheckCircle2,
  Coins,
  Clock,
  ArrowUpRight,
  List,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency } from '@/lib/utils';
import { getSavingsDashboard, type SavingsDashboard } from '@/actions/savings-dashboard.actions';
import type { SessionUser } from '@/types';

interface Props {
  user: SessionUser;
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'secondary' | 'default'> = {
  ACTIVE: 'success',
  DORMANT: 'warning',
  FROZEN: 'error',
  CLOSED: 'secondary',
  MATURED: 'default',
  COMPLETED: 'secondary',
  TERMINATED: 'error',
  TERMINATION_REQUESTED: 'warning',
};

// Savings-scoped sub-navigation. This dashboard handles savings and nothing else.
const savingsNav = [
  { label: 'Dashboard', href: '/savings/dashboard' },
  { label: 'Accounts', href: '/savings' },
  { label: 'Withdrawals', href: '/savings/withdrawals' },
  { label: 'Terminations', href: '/savings/terminations' },
  { label: 'Reports', href: '/savings/reports' },
];

function Kpi({
  icon: Icon,
  label,
  value,
  sub,
  tint,
}: {
  icon: typeof PiggyBank;
  label: string;
  value: string;
  sub?: string;
  tint: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className={`h-9 w-9 rounded-lg flex items-center justify-center ${tint}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-sm text-muted-foreground">{label}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function SavingsDashboardClient({ user: _user }: Props) {
  const [data, setData] = useState<SavingsDashboard | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    getSavingsDashboard()
      .then(setData)
      .catch((e) => toast.error(e.message || 'Failed to load savings dashboard'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const maxMonth = data ? Math.max(1, ...data.depositsByMonth.map((m) => m.amount)) : 1;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-emerald-50 flex items-center justify-center">
            <PiggyBank className="h-5 w-5 text-emerald-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Savings Dashboard</h1>
            <p className="text-sm text-muted-foreground">Savings portfolio overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href="/savings/create">
              <ArrowUpRight className="h-4 w-4 mr-1" />
              New Fixed Savings
            </Link>
          </Button>
        </div>
      </div>

      {/* Savings-scoped sub-nav */}
      <div className="flex flex-wrap gap-1 border-b">
        {savingsNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
              item.href === '/savings/dashboard'
                ? 'border-emerald-600 text-emerald-700 font-medium'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading savings data…
        </div>
      ) : data ? (
        <>
          {/* KPI grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Kpi
              icon={Wallet}
              label="Total Savings Portfolio"
              value={formatCurrency(data.portfolio.totalPortfolio)}
              sub={`${data.portfolio.activeAccounts} active accounts`}
              tint="bg-emerald-50 text-emerald-600"
            />
            <Kpi
              icon={TrendingUp}
              label="Today's Deposits"
              value={formatCurrency(data.deposits.todayAmount)}
              sub={`${data.deposits.todayCount} transaction${data.deposits.todayCount !== 1 ? 's' : ''}`}
              tint="bg-blue-50 text-blue-600"
            />
            <Kpi
              icon={Coins}
              label="Deposits This Month"
              value={formatCurrency(data.deposits.monthAmount)}
              sub={`${data.deposits.monthCount} transaction${data.deposits.monthCount !== 1 ? 's' : ''}`}
              tint="bg-indigo-50 text-indigo-600"
            />
            <Kpi
              icon={Percent}
              label="Interest Allocated (all time)"
              value={formatCurrency(data.interest.totalAllocated)}
              sub={`${formatCurrency(data.interest.thisMonth)} this month`}
              tint="bg-amber-50 text-amber-600"
            />
            <Kpi
              icon={Clock}
              label="Outstanding Interest Liability"
              value={formatCurrency(data.interest.outstandingLiability)}
              sub="Accrued, payable at maturity"
              tint="bg-rose-50 text-rose-600"
            />
            <Kpi
              icon={PiggyBank}
              label="Pending Deposits"
              value={formatCurrency(data.portfolio.totalPendingDeposits)}
              sub="Awaiting next interest roll"
              tint="bg-cyan-50 text-cyan-600"
            />
            <Kpi
              icon={TrendingUp}
              label="Eligible Balance"
              value={formatCurrency(data.portfolio.totalEligibleBalance)}
              sub="Currently earning interest"
              tint="bg-teal-50 text-teal-600"
            />
            <Kpi
              icon={CheckCircle2}
              label="Completed Savings"
              value={String(data.completed.count)}
              sub={`${formatCurrency(data.completed.totalPaidOut)} paid out`}
              tint="bg-slate-100 text-slate-600"
            />
          </div>

          {/* Status breakdown */}
          {Object.keys(data.statusCounts).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Accounts by Status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {Object.entries(data.statusCounts).map(([status, count]) => (
                  <Badge key={status} variant={statusVariant[status] ?? 'secondary'}>
                    {status.replace(/_/g, ' ')}: {count}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming maturities */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <CalendarClock className="h-5 w-5" />
                  Upcoming Maturities
                </CardTitle>
                <CardDescription>Active accounts maturing within 60 days</CardDescription>
              </CardHeader>
              <CardContent>
                {data.upcomingMaturities.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No accounts maturing in the next 60 days.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead>Matures</TableHead>
                        <TableHead className="text-right">Projected Payout</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.upcomingMaturities.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <Link href={`/savings/${m.id}`} className="font-medium hover:underline">
                              {m.customerName}
                            </Link>
                            <div className="text-xs text-muted-foreground">
                              {m.accountNumber} · {m.productName}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {new Date(m.maturityDate).toLocaleDateString('en-NG', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })}
                            <div className="text-xs text-muted-foreground">
                              in {m.daysToMaturity} day{m.daysToMaturity !== 1 ? 's' : ''}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(m.projectedPayout)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Deposits by month */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Deposits — Last 6 Months
                </CardTitle>
                <CardDescription>Total savings deposits per month</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {data.depositsByMonth.map((m) => (
                    <div key={m.label} className="flex items-center gap-3">
                      <span className="w-12 text-xs text-muted-foreground shrink-0">{m.label}</span>
                      <div className="flex-1 h-6 rounded bg-muted overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded transition-all"
                          style={{ width: `${(m.amount / maxMonth) * 100}%` }}
                        />
                      </div>
                      <span className="w-28 text-right text-xs font-medium shrink-0">
                        {formatCurrency(m.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Product breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <List className="h-5 w-5" />
                Customers per Product
              </CardTitle>
              <CardDescription>
                {data.mostPopularProduct
                  ? `Most popular: ${data.mostPopularProduct.name} (${data.mostPopularProduct.accountCount} accounts)`
                  : 'Active accounts grouped by savings product'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.productBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">No active accounts yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Accounts</TableHead>
                      <TableHead className="text-right">Total Balance</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.productBreakdown.map((p) => (
                      <TableRow key={p.productId}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">{p.accountCount}</TableCell>
                        <TableCell className="text-right">{formatCurrency(p.totalBalance)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
