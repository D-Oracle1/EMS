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
  Plus,
  RefreshCw,
  Loader2,
  ArrowUpRight,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';
import { getSavingsDashboard, type SavingsDashboard } from '@/actions/savings-dashboard.actions';
import type { SessionUser } from '@/types';

interface Props {
  user: SessionUser;
}

// Savings-scoped sub-navigation. This dashboard handles savings and nothing else.
const savingsNav = [
  { label: 'Overview', href: '/savings/dashboard' },
  { label: 'Accounts', href: '/savings' },
  { label: 'Withdrawals', href: '/savings/withdrawals' },
  { label: 'Terminations', href: '/savings/terminations' },
  { label: 'Reports', href: '/savings/reports' },
];

const SEGMENT_COLORS = ['#1d4ed8', '#f97316', '#059669', '#7c3aed', '#0891b2', '#d97706', '#e11d48', '#0284c7'];
const TILE_TINTS = ['blue', 'orange', 'emerald', 'violet', 'cyan', 'amber', 'rose', 'sky'] as const;

function compact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `₦${(n / 1_000).toFixed(0)}k`;
  return formatCurrency(n);
}

/** Small elevated stat tile with a rounded icon. */
function StatTile({
  icon: Icon,
  tint,
  label,
  value,
  sub,
}: {
  icon: LucideIcon;
  tint: string;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="premium-card premium-card-hover p-4">
      <div className={`icon-tile icon-tile-sm icon-tile-${tint}`}>
        <Icon style={{ height: 18, width: 18 }} />
      </div>
      <p className="mt-3 text-xl font-bold tracking-tight leading-tight">{value}</p>
      <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</p>}
    </div>
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

  // Donut segments from product balances
  const segments = (data?.productBreakdown ?? []).filter((p) => p.totalBalance > 0);
  const segTotal = segments.reduce((s, p) => s + p.totalBalance, 0) || 1;
  let acc = 0;
  const gradientStops = segments
    .map((p, i) => {
      const start = (acc / segTotal) * 100;
      acc += p.totalBalance;
      const end = (acc / segTotal) * 100;
      return `${SEGMENT_COLORS[i % SEGMENT_COLORS.length]} ${start}% ${end}%`;
    })
    .join(', ');
  const donutBg = segments.length
    ? `conic-gradient(${gradientStops})`
    : 'conic-gradient(#e2e8f0 0% 100%)';

  const maxProduct = Math.max(1, ...segments.map((p) => p.totalBalance));

  return (
    <div className="space-y-5 animate-rise">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-tile icon-tile-blue">
            <PiggyBank className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Savings</h1>
            <p className="text-sm text-muted-foreground">Portfolio overview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-full">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" asChild className="rounded-full">
            <Link href="/savings/create">
              <Plus className="h-4 w-4 mr-1" />
              New
            </Link>
          </Button>
        </div>
      </div>

      {/* Sub-nav pills */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1 no-scrollbar">
        {savingsNav.map((item) => {
          const active = item.href === '/savings/dashboard';
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm transition-colors ${
                active
                  ? 'bg-blue-600 text-white font-medium shadow-sm shadow-blue-500/30'
                  : 'bg-muted text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="flex items-center justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Loading savings data…
        </div>
      ) : data ? (
        <>
          {/* Hero */}
          <div className="hero-card p-5 sm:p-6">
            <div className="relative z-10">
              <p className="text-sm text-blue-100/80">Total Savings Portfolio</p>
              <div className="mt-1 flex items-end gap-3 flex-wrap">
                <span className="text-3xl sm:text-4xl font-bold tracking-tight">
                  {formatCurrency(data.portfolio.totalPortfolio)}
                </span>
                <span className="trend-up mb-1.5">
                  <TrendingUp className="h-3 w-3" />
                  {formatCurrency(data.interest.thisMonth)} interest
                </span>
              </div>
              <p className="mt-1 text-sm text-blue-100/70">
                Across {data.portfolio.activeAccounts} active account
                {data.portfolio.activeAccounts !== 1 ? 's' : ''}
              </p>

              {/* Inline quick figures */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white/10 backdrop-blur-sm p-3">
                  <div className="flex items-center gap-1.5 text-blue-100/80 text-xs">
                    <ArrowUpRight className="h-3.5 w-3.5" /> Deposits this month
                  </div>
                  <p className="mt-1 text-lg font-semibold">{formatCurrency(data.deposits.monthAmount)}</p>
                </div>
                <div className="rounded-2xl bg-white/10 backdrop-blur-sm p-3">
                  <div className="flex items-center gap-1.5 text-blue-100/80 text-xs">
                    <Clock className="h-3.5 w-3.5" /> Interest liability
                  </div>
                  <p className="mt-1 text-lg font-semibold">
                    {formatCurrency(data.interest.outstandingLiability)}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick stat tiles */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatTile
              icon={TrendingUp}
              tint="blue"
              label="Today's Deposits"
              value={compact(data.deposits.todayAmount)}
              sub={`${data.deposits.todayCount} txn`}
            />
            <StatTile
              icon={Percent}
              tint="orange"
              label="Interest (all time)"
              value={compact(data.interest.totalAllocated)}
            />
            <StatTile
              icon={Coins}
              tint="emerald"
              label="Eligible Balance"
              value={compact(data.portfolio.totalEligibleBalance)}
              sub="Earning interest"
            />
            <StatTile
              icon={CheckCircle2}
              tint="violet"
              label="Completed"
              value={String(data.completed.count)}
              sub={compact(data.completed.totalPaidOut)}
            />
          </div>

          {/* Composition donut + breakdown */}
          <div className="premium-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Portfolio Composition</h2>
              {data.mostPopularProduct && (
                <span className="text-xs text-muted-foreground">
                  Top: {data.mostPopularProduct.name}
                </span>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Donut */}
              <div className="relative shrink-0" style={{ width: 160, height: 160 }}>
                <div className="h-40 w-40 rounded-full" style={{ background: donutBg }} />
                <div className="absolute inset-0 m-auto h-[104px] w-[104px] rounded-full bg-card flex flex-col items-center justify-center shadow-inner">
                  <span className="text-lg font-bold leading-none">
                    {compact(data.portfolio.totalPortfolio)}
                  </span>
                  <span className="text-[11px] text-muted-foreground mt-0.5">Total</span>
                </div>
              </div>

              {/* Breakdown list */}
              <div className="flex-1 w-full space-y-3">
                {segments.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No active balances yet.
                  </p>
                ) : (
                  segments.slice(0, 5).map((p, i) => {
                    const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];
                    const pct = Math.round((p.totalBalance / segTotal) * 100);
                    return (
                      <div key={p.productId}>
                        <div className="flex items-center justify-between text-sm">
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ background: color }}
                            />
                            <span className="font-medium truncate">{p.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              {p.accountCount} acct
                            </span>
                          </div>
                          <span className="font-semibold shrink-0 ml-2">
                            {compact(p.totalBalance)}
                          </span>
                        </div>
                        <div className="progress-track mt-1.5">
                          <div
                            className="progress-fill"
                            style={{ width: `${(p.totalBalance / maxProduct) * 100}%`, background: color }}
                          />
                        </div>
                        <div className="text-right text-[11px] text-muted-foreground mt-0.5">{pct}%</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {/* Maturities + deposits */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Upcoming maturities */}
            <div className="premium-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="icon-tile icon-tile-sm icon-tile-amber">
                  <CalendarClock className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold leading-tight">Upcoming Maturities</h2>
                  <p className="text-xs text-muted-foreground">Within 60 days</p>
                </div>
              </div>
              {data.upcomingMaturities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">
                  Nothing maturing soon.
                </p>
              ) : (
                <div className="space-y-1">
                  {data.upcomingMaturities.slice(0, 6).map((m, i) => (
                    <Link
                      key={m.id}
                      href={`/savings/${m.id}`}
                      className="flex items-center gap-3 rounded-xl px-2 py-2 -mx-2 hover:bg-muted/60 transition-colors"
                    >
                      <div className={`icon-tile icon-tile-sm icon-tile-${TILE_TINTS[i % TILE_TINTS.length]}`}>
                        <Wallet className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{m.customerName}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {m.productName} · in {m.daysToMaturity}d
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-semibold">{compact(m.projectedPayout)}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Deposits by month */}
            <div className="premium-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <div className="icon-tile icon-tile-sm icon-tile-blue">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div>
                  <h2 className="font-semibold leading-tight">Deposits Trend</h2>
                  <p className="text-xs text-muted-foreground">Last 6 months</p>
                </div>
              </div>
              <div className="space-y-3">
                {data.depositsByMonth.map((m) => (
                  <div key={m.label} className="flex items-center gap-3">
                    <span className="w-9 text-xs text-muted-foreground shrink-0">{m.label}</span>
                    <div className="flex-1 h-6 rounded-lg bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-lg bg-gradient-to-r from-blue-600 to-blue-400"
                        style={{ width: `${(m.amount / maxMonth) * 100}%` }}
                      />
                    </div>
                    <span className="w-20 text-right text-xs font-medium shrink-0">{compact(m.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Status chips */}
          {Object.keys(data.statusCounts).length > 0 && (
            <div className="premium-card p-4">
              <div className="flex flex-wrap gap-2">
                {Object.entries(data.statusCounts).map(([status, count]) => (
                  <span
                    key={status}
                    className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium"
                  >
                    {status.replace(/_/g, ' ')}
                    <span className="text-foreground/60">{count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
