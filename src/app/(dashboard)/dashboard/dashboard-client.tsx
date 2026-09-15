'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Landmark,
  PiggyBank,
  Wallet,
  ClipboardCheck,
  BookOpen,
  Shield,
  UserCog,
  CalendarOff,
  Bell,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  BarChart3,
  FileText,
  ShieldCheck,
  ArrowRight,
  ArrowUpRight,
  ArrowUp,
  ArrowDown,
  Loader2,
  FileDown,
  FileSpreadsheet,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatCard } from '@/components/ui/stat-card';
import { WorkspaceWidgets, WorkspaceTodo } from '@/components/layout/workspace-widgets';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  getSavingsMonthDetail,
  type SavingsMonthDetail,
} from '@/actions/savings-report.actions';
import { logExportAction } from '@/actions/report.actions';
import type { SessionUser, DashboardData } from '@/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    // "NGN" rather than ₦ — see the note on formatCurrency in src/lib/utils.ts.
    currencyDisplay: 'code',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatCompact(amount: number): string {
  if (amount >= 1_000_000_000) return `NGN ${(amount / 1_000_000_000).toFixed(1)}B`;
  if (amount >= 1_000_000) return `NGN ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `NGN ${(amount / 1_000).toFixed(0)}K`;
  return `NGN ${amount}`;
}

const CHART_COLORS = ['#2563eb', '#16a34a', '#ea580c', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1'];

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'> = {
  DRAFT: 'secondary',
  PENDING_VERIFICATION: 'warning',
  VERIFICATION_IN_PROGRESS: 'info',
  VERIFIED: 'info',
  PENDING_APPROVAL: 'warning',
  APPROVED: 'success',
  ACTIVE: 'success',
  OVERDUE: 'destructive',
  REJECTED: 'destructive',
  CLOSED: 'outline',
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  ASSIGNED: 'info',
  DISBURSED: 'success',
};

interface DashboardClientProps {
  user: SessionUser;
  data: DashboardData;
}

export function DashboardClient({ user, data }: DashboardClientProps) {
  const hasPermission = (perm: string) => user.permissions.includes(perm);
  const hasModule = (mod: string) => user.permissions.some((p) => p.startsWith(`${mod}:`));

  const disbursementChart = data.disbursementChart || [];
  const loansByCategory = data.loansByCategory || [];
  const loansByOfficer = data.loansByOfficer || [];

  const aum = data.executive
    ? data.executive.totalLoansOutstanding +
      data.executive.totalSavingsDeposits +
      data.executive.totalFixedDeposits
    : null;

  return (
    <div className="space-y-5 animate-rise">

      {/* The savings pair and the to-do list share a row: what you hold, how to
          add to it, and what is waiting on you. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Link href="/savings" className="premium-card premium-card-hover p-5">
          <div className="flex items-center gap-2">
            <span className="icon-tile icon-tile-sm icon-tile-emerald">
              <PiggyBank className="h-4 w-4" />
            </span>
            <h2 className="font-semibold">Active accounts</h2>
          </div>
          <p className="mt-3 text-3xl font-bold tracking-tight">
            {data.savings ? data.savings.activeAccounts.toLocaleString('en-NG') : '—'}
          </p>
          <p className="mt-1 break-words text-sm text-muted-foreground">
            {data.savings
              ? `${formatCurrency(data.savings.totalBalance)} held`
              : 'No savings access'}
          </p>
        </Link>

        {hasPermission('SAVINGS:CREATE') ? (
          <Link href="/savings/new" className="premium-card premium-card-hover p-5">
            <div className="flex items-center gap-2">
              <span className="icon-tile icon-tile-sm icon-tile-blue">
                <Wallet className="h-4 w-4" />
              </span>
              <h2 className="font-semibold">New savings</h2>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Open a savings account for a customer.
            </p>
            <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              Open an account <ArrowRight className="h-4 w-4" />
            </p>
          </Link>
        ) : (
          <div className="premium-card p-5">
            <div className="flex items-center gap-2">
              <span className="icon-tile icon-tile-sm icon-tile-slate">
                <PiggyBank className="h-4 w-4" />
              </span>
              <h2 className="font-semibold">Today</h2>
            </div>
            <p className="mt-3 text-3xl font-bold tracking-tight">
              {data.savings ? formatCompact(data.savings.todayDepositsAmount) : '—'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">taken in today</p>
          </div>
        )}

        <WorkspaceTodo />
      </div>

      <WorkspaceWidgets />

      {/* Savings at a glance.
          The greeting already sits in the workspace bar above, so this card
          spends its space on the figures rather than saying someone's name
          back to them. One hero number, then the day's movement beside it. */}
      <div className="hero-card p-5 sm:p-6">
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-blue-100/80">
              {data.savings ? 'Savings under management' : 'Assets under management'}
            </p>
            {/* Hero figure: proportional figures, not tabular — tabular-nums
                makes a large standalone number look loose.

                It starts at text-3xl on a phone rather than text-4xl. Money is
                written "NGN 182,653" now, three characters wider than the ₦ it
                replaced, and at 36px that ran past the right edge of a 360px
                screen. break-all is the backstop for an unusually large figure:
                it wraps rather than widening the page. */}
            <p className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight leading-none mt-1 break-all">
              {data.savings
                ? formatCurrency(data.savings.totalBalance)
                : aum !== null
                  ? formatCurrency(aum)
                  : user.firstName}
            </p>
            <p className="text-sm text-blue-100/70 mt-2">
              {data.savings
                ? `across ${data.savings.activeAccounts.toLocaleString('en-NG')} active account${
                    data.savings.activeAccounts === 1 ? '' : 's'
                  }`
                : `${user.role} · ${user.department}`}
            </p>
          </div>

          {/* shrink-0 so the badges keep their size, and the figure beside them
              is what gives way — without it this column can force the flex row
              wider than the card on a narrow screen. */}
          <div className="flex shrink-0 flex-col items-end gap-2">
            {data.attendance?.isClockedIn && user.roleCode !== 'SUPER_ADMIN' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-400/20 text-emerald-200 text-xs font-medium px-2.5 py-1">
                <CheckCircle className="h-3 w-3" /> Clocked In
              </span>
            )}
            {data.unreadNotifications > 0 && (
              <Link
                href="/notifications"
                className="inline-flex items-center gap-1 rounded-full bg-orange-400/25 text-orange-100 text-xs font-medium px-2.5 py-1"
              >
                <Bell className="h-3 w-3" />
                {data.unreadNotifications} unread
              </Link>
            )}
            <span className="inline-flex items-center rounded-full bg-white/15 text-white/90 text-xs font-medium px-2.5 py-1">
              {user.roleCode}
            </span>
          </div>
        </div>

        {data.savings && (
          <div className="relative z-10 mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-white/15 pt-5 sm:grid-cols-4">
            <HeroFigure
              label="In today"
              value={formatCompact(data.savings.todayDepositsAmount)}
              sub={`${data.savings.todayDeposits} deposit${data.savings.todayDeposits === 1 ? '' : 's'}`}
            />
            <HeroFigure
              label="Out today"
              value={formatCompact(data.savings.todayWithdrawalsAmount)}
              sub={`${data.savings.todayWithdrawals} withdrawal${data.savings.todayWithdrawals === 1 ? '' : 's'}`}
            />
            <HeroFigure
              label="Awaiting approval"
              value={String(data.savings.pendingWithdrawals)}
              sub="withdrawal requests"
              href="/savings/withdrawals"
            />
            <HeroFigure
              label="Net today"
              value={formatCompact(
                data.savings.todayDepositsAmount - data.savings.todayWithdrawalsAmount
              )}
              sub="deposits less withdrawals"
            />
          </div>
        )}
      </div>

      {data.savingsChart && data.savingsChart.length > 0 && (
        <SavingsMovement rows={data.savingsChart} />
      )}

      {/* Risk Dashboard — for managers/directors/accountants */}
      {data.riskIndicators && (
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Risk Indicators
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <RiskKpiCard
              label="Portfolio at Risk"
              value={`${data.riskIndicators.par.toFixed(1)}%`}
              description="Overdue / Total outstanding"
              danger={data.riskIndicators.par > 10}
              warning={data.riskIndicators.par > 5}
            />
            <RiskKpiCard
              label="NPL Rate"
              value={`${data.riskIndicators.nplRate.toFixed(1)}%`}
              description="Non-performing loans count"
              danger={data.riskIndicators.nplRate > 5}
              warning={data.riskIndicators.nplRate > 2}
            />
            <RiskKpiCard
              label="Collection Rate"
              value={`${data.riskIndicators.collectionRate.toFixed(1)}%`}
              description="This month's repayments"
              danger={data.riskIndicators.collectionRate < 70}
              warning={data.riskIndicators.collectionRate < 90}
              invertColor
            />
            <RiskKpiCard
              label="Overdue Loans"
              value={data.riskIndicators.overdueCount}
              description={`of ${data.riskIndicators.totalActiveCount} active`}
              danger={data.riskIndicators.overdueCount > 10}
              warning={data.riskIndicators.overdueCount > 3}
            />
          </div>
        </div>
      )}

      {/* Executive Summary - for finance/exec roles */}
      {data.executive && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <StatCard
            title="Total Loans Outstanding"
            color="orange"
            value={formatCurrency(data.executive.totalLoansOutstanding)}
            icon={TrendingUp}
            variant="info"
            href="/reports"
          />
          <StatCard
            title="Total Savings Deposits"
            color="emerald"
            value={formatCurrency(data.executive.totalSavingsDeposits)}
            icon={PiggyBank}
            variant="success"
            href="/reports"
          />
          <StatCard
            title="Total Fixed Deposits"
            color="purple"
            value={formatCurrency(data.executive.totalFixedDeposits)}
            icon={Wallet}
            variant="info"
            href="/reports"
          />
        </div>
      )}

      {/* ================================================================ */}
      {/* ROLE-SPECIFIC "MY WORK" SECTIONS                                 */}
      {/* ================================================================ */}

      {/* Loan Officer: My Loan Portfolio */}
      {data.myRecentLoans && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Landmark className="h-5 w-5 text-blue-600" />
              My Loan Portfolio
            </CardTitle>
            <Link href="/loans">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {/* Quick stats row */}
            {data.loans && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
                <div className="text-center p-3 rounded-lg bg-slate-50">
                  <p className="text-2xl font-bold">{data.loans.draft}</p>
                  <p className="text-xs text-muted-foreground">Draft</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-yellow-50">
                  <p className="text-2xl font-bold text-yellow-700">{data.loans.pendingVerification}</p>
                  <p className="text-xs text-muted-foreground">Pending Verification</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-amber-50">
                  <p className="text-2xl font-bold text-amber-700">{data.loans.pendingApproval}</p>
                  <p className="text-xs text-muted-foreground">Pending Approval</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-green-50">
                  <p className="text-2xl font-bold text-green-700">{data.loans.active}</p>
                  <p className="text-xs text-muted-foreground">Active</p>
                </div>
                <div className="text-center p-3 rounded-lg bg-red-50">
                  <p className="text-2xl font-bold text-red-700">{data.loans.overdue}</p>
                  <p className="text-xs text-muted-foreground">Overdue</p>
                </div>
              </div>
            )}

            {/* Recent loans list */}
            {data.myRecentLoans.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">Recent Loans</p>
                {data.myRecentLoans.map((loan) => (
                  <Link key={loan.id} href={`/loans/${loan.id}`} className="block">
                    <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                      <div>
                        <p className="text-sm font-medium">
                          {loan.customer?.firstName} {loan.customer?.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground font-mono">{loan.loanNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{formatCurrency(loan.principalAmount)}</p>
                        <Badge variant={STATUS_BADGE_VARIANT[loan.status] || 'secondary'} className="text-xs">
                          {loan.status.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No loans created yet</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Loan Officer: My Loans Status Board */}
      {data.myLoansStatusBoard && data.myLoansStatusBoard.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <Landmark className="h-5 w-5 text-blue-600" />
              My Loans - Status Board
            </CardTitle>
            <Link href="/loans">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Loan #</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Customer</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Product</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">Amount</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Status</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Decision</th>
                    <th className="text-left py-2 px-2 font-medium text-muted-foreground">Verification Officer</th>
                    <th className="text-right py-2 px-2 font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.myLoansStatusBoard.map((loan) => (
                    <tr key={loan.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-2 px-2 font-mono text-xs">{loan.loanNumber}</td>
                      <td className="py-2 px-2">
                        {loan.customer?.firstName} {loan.customer?.lastName}
                      </td>
                      <td className="py-2 px-2 text-muted-foreground">{loan.product?.name}</td>
                      <td className="py-2 px-2 text-right font-medium">{formatCurrency(loan.principalAmount)}</td>
                      <td className="py-2 px-2">
                        <Badge variant={STATUS_BADGE_VARIANT[loan.status] || 'secondary'} className="text-xs">
                          {loan.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="py-2 px-2">
                        {loan.approval ? (
                          <div>
                            <Badge
                              variant={loan.approval.decision === 'APPROVED' ? 'success' : loan.approval.decision === 'REJECTED' ? 'destructive' : 'secondary'}
                              className="text-xs"
                            >
                              {loan.approval.decision}
                            </Badge>
                            {loan.approval.comments && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[150px]">
                                {loan.approval.comments}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">-</span>
                        )}
                      </td>
                      <td className="py-2 px-2 text-xs">
                        {loan.verificationOfficer
                          ? `${loan.verificationOfficer.firstName} ${loan.verificationOfficer.lastName}`
                          : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="py-2 px-2 text-right">
                        <Link href={`/loans/${loan.id}`}>
                          <Button variant="ghost" size="sm" className="text-xs">View</Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Verification Officer: My Verification Queue */}
      {data.myActiveVerificationTasks && data.myActiveVerificationTasks.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-indigo-600" />
              My Verification Queue
            </CardTitle>
            <Link href="/verification">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.myActiveVerificationTasks.map((task) => (
                <Link key={task.id} href={`/verification/${task.id}`} className="block">
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium">
                        {task.customer?.firstName} {task.customer?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {task.loan?.loanNumber || 'No loan'} &middot; {(task.taskType || '').replace(/_/g, ' ')}
                      </p>
                    </div>
                    <Badge variant={STATUS_BADGE_VARIANT[task.status] || 'secondary'} className="text-xs">
                      {task.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Manager: Loans Awaiting Approval */}
      {data.pendingApprovalLoans && data.pendingApprovalLoans.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-amber-600" />
              Loans Awaiting Approval ({data.pendingApprovalLoans.length})
            </CardTitle>
            <Link href="/loans?status=PENDING_APPROVAL">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.pendingApprovalLoans.map((loan) => (
                <Link key={loan.id} href={`/loans/${loan.id}`} className="block">
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium">
                        {loan.customer?.firstName} {loan.customer?.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {loan.loanNumber} &middot; by {loan.createdBy?.firstName} {loan.createdBy?.lastName}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">{formatCurrency(loan.principalAmount)}</p>
                      <Badge variant="warning" className="text-xs">Pending Approval</Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Accountant: Pending Journals */}
      {data.recentJournals && data.recentJournals.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5 text-purple-600" />
              Pending Journal Entries
            </CardTitle>
            <Link href="/accounting/journal">
              <Button variant="ghost" size="sm">
                View All <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.recentJournals.map((journal) => (
                <Link key={journal.id} href={`/accounting/journal/${journal.id}`} className="block">
                  <div className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div>
                      <p className="text-sm font-medium font-mono">{journal.entryNumber}</p>
                      <p className="text-xs text-muted-foreground truncate max-w-[200px]">{journal.description}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{formatCurrency(journal.totalDebit)}</p>
                      <Badge variant={STATUS_BADGE_VARIANT[journal.status] || 'secondary'} className="text-xs">
                        {journal.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ================================================================ */}
      {/* MODULE STATS (existing)                                          */}
      {/* ================================================================ */}

      {/* Module Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {/* Loan Stats - show for non-loan-officers (loan officers see "My Portfolio" above) */}
        {data.loans && !data.myRecentLoans && (
          <>
            <StatCard
              title="Active Loans"
              color="orange"
              value={data.loans.active}
              icon={Landmark}
              variant="success"
              href="/loans?status=ACTIVE"
            />
            <StatCard
              title="Pending Approval"
              color="amber"
              value={data.loans.pendingApproval}
              icon={ClipboardCheck}
              variant="warning"
              description={`${data.loans.pendingVerification} awaiting verification`}
              href="/loans?status=PENDING_APPROVAL"
            />
            <StatCard
              title="Overdue Loans"
              color="rose"
              value={data.loans.overdue}
              icon={AlertTriangle}
              variant="danger"
              href="/loans?status=OVERDUE"
            />
          </>
        )}

        {/* Savings figures moved into the hero card and the movement chart
            above, so they are not also repeated as tiles here. */}

        {/* FD Stats */}
        {data.fixedDeposits && (
          <StatCard
            title="Fixed Deposits"
            color="purple"
            value={data.fixedDeposits.activeCount}
            icon={Wallet}
            description={formatCurrency(data.fixedDeposits.totalPrincipal) + ' invested'}
            variant="info"
            href="/fixed-deposits"
          />
        )}

        {/* Customer Stats */}
        {data.customers && (
          <StatCard
            title="Active Customers"
            color="cyan"
            value={data.customers.activeCount}
            icon={Users}
            variant="default"
            href="/customers"
          />
        )}

        {/* HR Stats */}
        {data.hr && (
          <>
            <StatCard
              title="Active Staff"
              color="indigo"
              value={data.hr.activeStaff}
              icon={UserCog}
              variant="default"
              href="/hr/staff"
            />
            <StatCard
              title="Present Today"
              color="teal"
              value={data.hr.presentToday}
              icon={CheckCircle}
              description={`${data.hr.absentToday} absent`}
              variant="success"
              href="/hr/attendance"
              // A genuine ratio — attendance against headcount — so the ring
              // reads as real information rather than decoration.
              progress={
                data.hr.activeStaff > 0
                  ? (data.hr.presentToday / data.hr.activeStaff) * 100
                  : 0
              }
            />
            <StatCard
              title="Pending Leave"
              color="amber"
              value={data.hr.pendingLeave}
              icon={CalendarOff}
              variant="warning"
              href="/hr/leave"
            />
          </>
        )}

        {/* Verification Stats - only show card if we don't show the queue above */}
        {data.verification && !data.myActiveVerificationTasks?.length && (
          <StatCard
            title="My Verification Tasks"
            color="yellow"
            value={data.verification.myTasks}
            icon={ClipboardCheck}
            description={`${data.verification.allPending} total pending`}
            variant="warning"
            href="/verification"
          />
        )}

        {/* Accounting Stats */}
        {data.accounting && !data.recentJournals?.length && (
          <StatCard
            title="Pending Journals"
            color="sky"
            value={data.accounting.pendingJournals}
            icon={BookOpen}
            variant="warning"
            href="/accounting/journal"
          />
        )}

        {/* Audit Stats */}
        {data.audit && (
          <StatCard
            title="Today's Audit Logs"
            color="slate"
            value={data.audit.todayLogs}
            icon={Shield}
            variant="default"
            href="/audit-logs"
          />
        )}
      </div>

      {/* Loan Disbursement Chart */}
      {disbursementChart.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-600" />
              Total Loans Disbursed (Last 12 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={disbursementChart} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="month"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(val: string) => {
                    const [y, m] = val.split('-');
                    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                    return `${months[parseInt(m, 10) - 1]} ${y.slice(2)}`;
                  }}
                />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(val: number) => formatCompact(val)} />
                <Tooltip
                  formatter={(value: number) => [formatCurrency(value), 'Disbursed']}
                  labelFormatter={(label: string) => {
                    const [y, m] = label.split('-');
                    const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
                    return `${months[parseInt(m, 10) - 1]} ${y}`;
                  }}
                />
                <Bar dataKey="amount" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Loan Portfolio by Category & Officer Performance */}
      {(loansByCategory.length > 0 || loansByOfficer.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Loan Portfolio by Category */}
          {loansByCategory.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Portfolio by Category</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={loansByCategory}
                      dataKey="amount"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={({ name, percent }: { name: string; percent: number }) =>
                        `${name} (${(percent * 100).toFixed(0)}%)`
                      }
                      labelLine
                    >
                      {loansByCategory.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {loansByCategory.map((cat, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="font-medium">{cat.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-muted-foreground">{cat.count} loans</span>
                        <span className="ml-3 font-medium">{formatCurrency(cat.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Loan Officer Performance */}
          {loansByOfficer.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Loan Officer Report Summary</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={loansByOfficer}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(val: number) => formatCompact(val)} />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      width={120}
                    />
                    <Tooltip formatter={(value: number) => [formatCurrency(value), 'Total Amount']} />
                    <Bar dataKey="amount" fill="#16a34a" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4">
                  <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground border-b pb-2 mb-2">
                    <span>Officer</span>
                    <span className="text-center">Loans</span>
                    <span className="text-right">Total Amount</span>
                  </div>
                  {loansByOfficer
                    .sort((a, b) => b.amount - a.amount)
                    .map((officer, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2 text-sm py-1.5 border-b border-dashed last:border-0">
                        <span className="font-medium truncate">{officer.name}</span>
                        <span className="text-center text-muted-foreground">{officer.count}</span>
                        <span className="text-right font-medium">{formatCurrency(officer.amount)}</span>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {hasPermission('CUSTOMERS:CREATE') && (
              <QuickAction href="/customers/new" icon={Users} label="New Customer" />
            )}
            {hasPermission('LOANS:CREATE') && (
              <QuickAction href="/loans/new" icon={Landmark} label="New Loan" />
            )}
            {hasPermission('SAVINGS:CREATE') && (
              <QuickAction href="/savings/new" icon={PiggyBank} label="New Savings" />
            )}
            {hasPermission('FIXED_DEPOSITS:CREATE') && (
              <QuickAction href="/fixed-deposits/new" icon={Wallet} label="New FD" />
            )}
            {hasPermission('ACCOUNTS:JOURNAL_CREATE') && (
              <QuickAction href="/accounting/journal/new" icon={BookOpen} label="New Journal" />
            )}
            {hasPermission('ACCOUNTS:REPORTS_VIEW') && (
              <QuickAction href="/reports" icon={DollarSign} label="Reports" />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function RiskKpiCard({
  label,
  value,
  description,
  danger,
  warning,
  invertColor = false,
}: {
  label: string;
  value: string | number;
  description?: string;
  danger: boolean;
  warning: boolean;
  invertColor?: boolean;
}) {
  // invertColor=true: green is good (collection rate), red is bad
  // invertColor=false: green is safe, red is danger (PAR, NPL)
  const colorClass = invertColor
    ? danger ? 'text-red-700 bg-red-50 border-red-200' : warning ? 'text-yellow-700 bg-yellow-50 border-yellow-200' : 'text-green-700 bg-green-50 border-green-200'
    : danger ? 'text-red-700 bg-red-50 border-red-200' : warning ? 'text-yellow-700 bg-yellow-50 border-yellow-200' : 'text-green-700 bg-green-50 border-green-200';

  return (
    <Card className={`border ${colorClass}`}>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wider mb-1 opacity-70">{label}</p>
        <p className="text-2xl font-bold">{value}</p>
        {description && <p className="text-xs mt-1 opacity-60">{description}</p>}
      </CardContent>
    </Card>
  );
}

/** One figure in the hero card's row. Optionally a link, when there is a
 *  page worth opening behind it. */
function HeroFigure({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: string;
  sub: string;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-xs text-blue-100/70">{label}</p>
      <p className="mt-0.5 text-xl font-bold tracking-tight sm:text-2xl">{value}</p>
      <p className="mt-0.5 text-[11px] text-blue-100/60">{sub}</p>
    </>
  );

  if (href) {
    return (
      <Link href={href} className="block rounded-2xl transition-colors hover:bg-white/5">
        {body}
      </Link>
    );
  }
  return <div>{body}</div>;
}

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** '2026-09' → 'Sep' for the axis, 'September 2026' for the tooltip. */
function monthShort(key: string): string {
  const month = Number(key.split('-')[1]);
  return MONTH_SHORT[month - 1] ?? key;
}
function monthLong(key: string): string {
  const [year, month] = key.split('-');
  return `${MONTH_LONG[Number(month) - 1] ?? month} ${year}`;
}

/**
 * Twelve months of money in and money out.
 *
 * The two series colours sit in the validator's 6–8 CVD band and light-mode
 * aqua is under 3:1 on the surface, so three things here are load-bearing for
 * accessibility rather than decoration: the legend, the 2px gap between paired
 * bars, and the table view. A reader who cannot separate the two hues can
 * still read every value. Do not remove them.
 */
function SavingsMovement({ rows }: { rows: { month: string; deposits: number; withdrawals: number }[] }) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  // The month the reader drilled into, as YYYY-MM. Null means the dialog is shut.
  const [openMonth, setOpenMonth] = useState<string | null>(null);

  return (
    <>
    <MonthDetailDialog month={openMonth} onClose={() => setOpenMonth(null)} />
    <Card className="savings-series">
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="text-lg flex items-center gap-2">
            <PiggyBank className="h-5 w-5 text-emerald-600" />
            Savings movement
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Deposits and withdrawals, last 12 months. Pick a month to see everything in it.
          </p>
        </div>
        <div className="flex shrink-0 rounded-full border border-border/70 p-0.5 text-xs">
          {(['chart', 'table'] as const).map((option) => (
            <button
              key={option}
              onClick={() => setView(option)}
              className={`rounded-full px-3 py-1 capitalize transition-colors ${
                view === option ? 'bg-foreground/10 font-medium text-foreground' : 'text-muted-foreground'
              }`}
              aria-pressed={view === option}
            >
              {option}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {view === 'chart' ? (
          // Height covers the plot *and* the axis band, so the card never
          // grows its own little scrollbar.
          <div className="h-[320px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={rows} barGap={2} barCategoryGap="22%" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                {/* Solid hairline, horizontal only — never dashed. */}
                <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="month"
                  tickFormatter={monthShort}
                  tickLine={false}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis
                  tickFormatter={(value: number) => formatCompact(value)}
                  tickLine={false}
                  axisLine={false}
                  width={64}
                  tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
                />
                <Tooltip
                  cursor={{ fill: 'hsl(var(--foreground) / 0.04)' }}
                  labelFormatter={(label: string) => monthLong(label)}
                  formatter={(value: number, name: string) => [formatCurrency(value), name]}
                  contentStyle={{
                    borderRadius: 12,
                    fontSize: 12,
                    border: '1px solid hsl(var(--border))',
                    background: 'hsl(var(--popover))',
                    color: 'hsl(var(--popover-foreground))',
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar
                  dataKey="deposits"
                  name="Deposits"
                  fill="var(--series-in)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                  cursor="pointer"
                  onClick={(entry: { month?: string; payload?: { month?: string } }) =>
                    setOpenMonth(entry?.payload?.month ?? entry?.month ?? null)
                  }
                />
                <Bar
                  dataKey="withdrawals"
                  name="Withdrawals"
                  fill="var(--series-out)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={18}
                  cursor="pointer"
                  onClick={(entry: { month?: string; payload?: { month?: string } }) =>
                    setOpenMonth(entry?.payload?.month ?? entry?.month ?? null)
                  }
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="px-2 py-2 text-left font-medium text-muted-foreground">Month</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Deposits</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Withdrawals</th>
                  <th className="px-2 py-2 text-right font-medium text-muted-foreground">Net</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((row) => (
                  <tr
                    key={row.month}
                    onClick={() => setOpenMonth(row.month)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setOpenMonth(row.month);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open ${monthLong(row.month)} in full`}
                    className="cursor-pointer border-b transition-colors last:border-0 hover:bg-foreground/5 focus:bg-foreground/5 focus:outline-none"
                  >
                    <td className="px-2 py-1.5">{monthLong(row.month)}</td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(row.deposits)}</td>
                    <td className="px-2 py-1.5 text-right">{formatCurrency(row.withdrawals)}</td>
                    <td className="px-2 py-1.5 text-right font-medium">
                      {formatCurrency(row.deposits - row.withdrawals)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
    </>
  );
}

/**
 * Everything that happened in one month, opened from a bar or a table row.
 *
 * The figures come from the server rather than from the chart's own totals, so
 * the dialog can show what the chart cannot: which accounts moved, who
 * processed each transaction, and the running balance afterwards. Exports reuse
 * the same CSV/Excel/PDF shape as the savings reports page, and go through
 * logExportAction, so a report pulled from here lands in the audit trail like
 * any other.
 */
function MonthDetailDialog({ month, onClose }: { month: string | null; onClose: () => void }) {
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

function QuickAction({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-2 p-4 rounded-lg border border-dashed hover:border-primary hover:bg-primary/5 transition-colors text-center"
    >
      <Icon className="h-6 w-6 text-muted-foreground" />
      <span className="text-sm font-medium">{label}</span>
    </Link>
  );
}
