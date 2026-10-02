'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Building2, MapPin, Phone, Mail, UserCog, Users, Landmark,
  PiggyBank, Wallet, Activity, ArrowRightLeft, BookOpen, Search,
  RefreshCw, ChevronLeft, ChevronRight, AlertTriangle, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatCard } from '@/components/ui/stat-card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import {
  getBranchRecords,
  type getBranchSummary,
  type BranchRecordKind,
} from '@/actions/branch.actions';

type Branch = NonNullable<Awaited<ReturnType<typeof getBranchSummary>>>;
type Row = Record<string, any>;
type BadgeVariant = 'success' | 'error' | 'warning' | 'info' | 'default' | 'secondary' | 'outline' | 'orange' | 'cyan';

const TABS: { kind: BranchRecordKind; label: string; icon: React.ComponentType<{ className?: string }>; searchHint: string }[] = [
  { kind: 'activity',       label: 'Activity',       icon: Activity,       searchHint: 'Description, module, email...' },
  { kind: 'transactions',   label: 'Transactions',   icon: ArrowRightLeft, searchHint: 'Reference, account, customer...' },
  { kind: 'loans',          label: 'Loans',          icon: Landmark,       searchHint: 'Loan number, customer...' },
  { kind: 'savings',        label: 'Savings',        icon: PiggyBank,      searchHint: 'Account number, customer...' },
  { kind: 'fixed-deposits', label: 'Fixed Deposits', icon: Wallet,         searchHint: 'Certificate, customer...' },
  { kind: 'customers',      label: 'Customers',      icon: Users,          searchHint: 'Name, number, phone...' },
  { kind: 'staff',          label: 'Staff',          icon: UserCog,        searchHint: 'Name, employee ID, email...' },
  { kind: 'journal',        label: 'Journal',        icon: BookOpen,       searchHint: 'Entry number, description...' },
];

const actionVariant: Record<string, BadgeVariant> = {
  CREATE: 'success', UPDATE: 'info', DELETE: 'error', APPROVE: 'success',
  REJECT: 'error', LOGIN: 'info', LOGOUT: 'secondary', LOGIN_FAILED: 'error',
  PASSWORD_CHANGE: 'warning', EXPORT: 'info', REVERSAL: 'warning',
};

function statusVariant(status: string): BadgeVariant {
  if (['ACTIVE', 'DISBURSED', 'APPROVED', 'POSTED', 'COMPLETED', 'MATURED'].includes(status)) return 'success';
  if (['OVERDUE', 'DEFAULTED', 'REJECTED', 'WRITTEN_OFF', 'TERMINATED', 'SUSPENDED', 'FROZEN', 'BLACKLISTED'].includes(status)) return 'error';
  if (status.startsWith('PENDING') || ['DRAFT', 'VERIFICATION_IN_PROGRESS', 'TERMINATION_REQUESTED', 'DORMANT', 'ON_LEAVE'].includes(status)) return 'warning';
  if (['CLOSED', 'INACTIVE', 'WITHDRAWN', 'PREMATURE_CLOSED'].includes(status)) return 'secondary';
  return 'info';
}

const label = (s: string) => s.replace(/_/g, ' ');

function StatusBadge({ status }: { status: string }) {
  return <Badge variant={statusVariant(status)}>{label(status)}</Badge>;
}

/**
 * One branch's figures and records. `mine` renders it as a manager's own
 * My Branch page: no route back to the all-branches index they cannot open.
 */
export function BranchDetailClient({ branch, mine = false }: { branch: Branch; mine?: boolean }) {
  const [tab, setTab] = useState<BranchRecordKind>('activity');
  const [rows, setRows] = useState<Row[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 1 });
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPending, startTransition] = useTransition();

  const load = (kind: BranchRecordKind, page: number, filters = { search, startDate, endDate }) => {
    startTransition(async () => {
      try {
        const result = await getBranchRecords(branch.id, kind, {
          page,
          limit: 25,
          search: filters.search || undefined,
          startDate: filters.startDate || undefined,
          endDate: filters.endDate || undefined,
        });
        setRows(result.data);
        setPagination(result.pagination);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load branch records');
      }
    });
  };

  useEffect(() => {
    load(tab, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const reset = () => {
    setSearch('');
    setStartDate('');
    setEndDate('');
    load(tab, 1, { search: '', startDate: '', endDate: '' });
  };

  const current = TABS.find((t) => t.kind === tab)!;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        {mine ? (
          <p className="text-sm font-medium text-muted-foreground">My Branch</p>
        ) : (
          <Link href="/branches" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> All branches
          </Link>
        )}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Building2 className="h-6 w-6 text-indigo-600" />
              <h1 className="text-2xl font-bold tracking-tight">{branch.name}</h1>
              <Badge variant="outline" className="font-mono">{branch.code}</Badge>
              <Badge variant={branch.isActive ? 'success' : 'secondary'}>
                {branch.isActive ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {branch.address && <span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" />{branch.address}</span>}
              {branch.phone && <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" />{branch.phone}</span>}
              {branch.email && <span className="flex items-center gap-1.5"><Mail className="h-4 w-4" />{branch.email}</span>}
              <span className="flex items-center gap-1.5"><Clock className="h-4 w-4" />Opened {formatDate(branch.createdAt)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Headline figures */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Staff" color="indigo" icon={UserCog}
          value={branch.staffCount} description={`${branch.activeStaffCount} active`} />
        <StatCard title="Customers" color="cyan" icon={Users}
          value={branch.customerCount} description={`${branch.newCustomers30d} new in the last 30 days`} />
        <StatCard title="Loan Portfolio" color="orange" icon={Landmark}
          value={formatCurrency(branch.loanPortfolio)}
          description={`${branch.liveLoanCount} live · ${branch.pipelineLoanCount} in pipeline`} />
        <StatCard title="Deposits Held" color="emerald" icon={PiggyBank}
          value={formatCurrency(branch.savingsBalance + branch.fixedDepositPrincipal)}
          description={`${branch.savingsCount} savings · ${branch.fixedDepositCount} fixed deposits`} />
      </div>

      {branch.overdueLoanCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {branch.overdueLoanCount} loan{branch.overdueLoanCount === 1 ? ' is' : 's are'} overdue or in default at this branch.
        </div>
      )}

      {/* Records */}
      <Card>
        <CardHeader className="space-y-4">
          <div className="overflow-x-auto -mx-1 px-1">
            <Tabs value={tab} onValueChange={(v) => setTab(v as BranchRecordKind)}>
              <TabsList className="w-max">
                {TABS.map((t) => (
                  <TabsTrigger key={t.kind} value={t.kind} className="gap-1.5">
                    <t.icon className="h-4 w-4" />{t.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1 w-full sm:w-64">
              <Label htmlFor="branch-search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="branch-search"
                  placeholder={current.searchHint}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && load(tab, 1)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="branch-start" className="text-xs">From</Label>
              <Input id="branch-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-[150px]" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="branch-end" className="text-xs">To</Label>
              <Input id="branch-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-[150px]" />
            </div>
            <Button onClick={() => load(tab, 1)} disabled={isPending}>
              <Search className="mr-2 h-4 w-4" />Filter
            </Button>
            <Button variant="ghost" onClick={reset} disabled={isPending}>Reset</Button>
          </div>

          <CardTitle className="flex items-center gap-2 text-lg">
            <current.icon className="h-5 w-5" />
            {current.label}
            <Badge variant="secondary">{pagination.total.toLocaleString()} records</Badge>
          </CardTitle>
        </CardHeader>

        <CardContent>
          {isPending ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <RefreshCw className="mr-2 h-5 w-5 animate-spin" />Loading...
            </div>
          ) : (
            <div className="overflow-x-auto">
              <RecordsTable kind={tab} rows={rows} />
            </div>
          )}

          {pagination.totalPages > 1 && !isPending && (
            <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => load(tab, pagination.page - 1)} disabled={pagination.page <= 1}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Previous
                </Button>
                <span className="text-sm">Page {pagination.page} of {pagination.totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => load(tab, pagination.page + 1)} disabled={pagination.page >= pagination.totalPages}>
                  Next<ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tables ──────────────────────────────────────────────────────────────────

const COLUMNS: Record<BranchRecordKind, string[]> = {
  activity:         ['Date/Time', 'Staff', 'Module', 'Action', 'Description'],
  transactions:     ['Date/Time', 'Type', 'Reference', 'Account', 'Customer', 'Amount', 'Mode', 'By'],
  loans:            ['Loan', 'Customer', 'Product', 'Principal', 'Repayable', 'Status', 'Officer', 'Applied'],
  savings:          ['Account', 'Customer', 'Product', 'Balance', 'Status', 'Opened', 'Last Activity'],
  'fixed-deposits': ['Certificate', 'Customer', 'Principal', 'Rate', 'At Maturity', 'Status', 'Start', 'Maturity'],
  customers:        ['Customer', 'Phone', 'Loans', 'Savings', 'FDs', 'KYC', 'Status', 'Registered'],
  staff:            ['Name', 'Employee ID', 'Role', 'Department', 'Status', 'Hired', 'Last Login'],
  journal:          ['Entry', 'Date', 'Type', 'Description', 'Source', 'Amount', 'Status', 'Created By'],
};

const money = 'text-right tabular-nums whitespace-nowrap';
const when = 'text-xs whitespace-nowrap';
const linkCls = 'font-medium text-indigo-700 hover:underline dark:text-indigo-400';

function RecordsTable({ kind, rows }: { kind: BranchRecordKind; rows: Row[] }) {
  const cols = COLUMNS[kind];
  const moneyCols = new Set(['Amount', 'Principal', 'Repayable', 'Balance', 'At Maturity']);

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {cols.map((c) => (
            <TableHead key={c} className={moneyCols.has(c) ? 'text-right' : undefined}>{c}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.length === 0 ? (
          <TableRow>
            <TableCell colSpan={cols.length} className="py-8 text-center text-muted-foreground">
              Nothing recorded for this branch yet
            </TableCell>
          </TableRow>
        ) : (
          rows.map((r) => <RecordRow key={r.id} kind={kind} r={r} />)
        )}
      </TableBody>
    </Table>
  );
}

function RecordRow({ kind, r }: { kind: BranchRecordKind; r: Row }) {
  switch (kind) {
    case 'activity':
      return (
        <TableRow>
          <TableCell className={when}>{formatDateTime(r.createdAt)}</TableCell>
          <TableCell>
            <div className="text-sm font-medium">{r.userName}</div>
            {r.employeeId && <div className="font-mono text-xs text-muted-foreground">{r.employeeId}</div>}
          </TableCell>
          <TableCell><Badge variant="outline">{r.module}</Badge></TableCell>
          <TableCell><Badge variant={actionVariant[r.action] || 'default'}>{label(r.action)}</Badge></TableCell>
          <TableCell className="min-w-[240px] text-sm">{r.description}</TableCell>
        </TableRow>
      );
    case 'transactions':
      return (
        <TableRow className={r.reversed ? 'opacity-60' : undefined}>
          <TableCell className={when}>{formatDateTime(r.at)}</TableCell>
          <TableCell>
            <Badge variant={r.source === 'LOAN' ? 'orange' : 'cyan'}>{label(r.type)}</Badge>
            {r.reversed && <Badge variant="warning" className="ml-1">Reversed</Badge>}
          </TableCell>
          <TableCell className="font-mono text-xs">{r.reference}</TableCell>
          <TableCell><Link href={r.href} className={linkCls}>{r.account}</Link></TableCell>
          <TableCell className="text-sm">{r.customer}</TableCell>
          <TableCell className={money}>{formatCurrency(r.amount)}</TableCell>
          <TableCell className="text-xs">{label(r.paymentMode)}</TableCell>
          <TableCell className="text-sm">{r.by ?? '-'}</TableCell>
        </TableRow>
      );
    case 'loans':
      return (
        <TableRow>
          <TableCell><Link href={`/loans/${r.id}`} className={linkCls}>{r.loanNumber}</Link></TableCell>
          <TableCell>
            <div className="text-sm">{r.customer}</div>
            <div className="font-mono text-xs text-muted-foreground">{r.customerNumber}</div>
          </TableCell>
          <TableCell className="text-sm">{r.product ?? '-'}</TableCell>
          <TableCell className={money}>{formatCurrency(r.principalAmount)}</TableCell>
          <TableCell className={money}>{formatCurrency(r.totalRepayment)}</TableCell>
          <TableCell><StatusBadge status={r.status} /></TableCell>
          <TableCell className="text-sm">{r.officer ?? '-'}</TableCell>
          <TableCell className={when}>{formatDate(r.applicationDate)}</TableCell>
        </TableRow>
      );
    case 'savings':
      return (
        <TableRow>
          <TableCell><Link href={`/savings/${r.id}`} className={linkCls}>{r.accountNumber}</Link></TableCell>
          <TableCell className="text-sm">{r.customer}</TableCell>
          <TableCell className="text-sm">{r.product ?? '-'}</TableCell>
          <TableCell className={money}>{formatCurrency(r.currentBalance)}</TableCell>
          <TableCell><StatusBadge status={r.status} /></TableCell>
          <TableCell className={when}>{formatDate(r.openedAt)}</TableCell>
          <TableCell className={when}>{r.lastTransactionAt ? formatDate(r.lastTransactionAt) : '-'}</TableCell>
        </TableRow>
      );
    case 'fixed-deposits':
      return (
        <TableRow>
          <TableCell><Link href={`/fixed-deposits/${r.id}`} className={linkCls}>{r.certificateNumber}</Link></TableCell>
          <TableCell className="text-sm">{r.customer}</TableCell>
          <TableCell className={money}>{formatCurrency(r.principalAmount)}</TableCell>
          <TableCell className="tabular-nums">{r.interestRate}%</TableCell>
          <TableCell className={money}>{formatCurrency(r.maturityAmount)}</TableCell>
          <TableCell><StatusBadge status={r.status} /></TableCell>
          <TableCell className={when}>{formatDate(r.startDate)}</TableCell>
          <TableCell className={when}>{formatDate(r.maturityDate)}</TableCell>
        </TableRow>
      );
    case 'customers':
      return (
        <TableRow>
          <TableCell>
            <Link href={`/customers/${r.id}`} className={linkCls}>{r.name}</Link>
            <div className="font-mono text-xs text-muted-foreground">{r.customerNumber}</div>
          </TableCell>
          <TableCell className="text-sm">{r.phone}</TableCell>
          <TableCell className="tabular-nums">{r.loans}</TableCell>
          <TableCell className="tabular-nums">{r.savings}</TableCell>
          <TableCell className="tabular-nums">{r.fixedDeposits}</TableCell>
          <TableCell>
            <Badge variant={r.kycVerified ? 'success' : 'warning'}>{r.kycVerified ? 'Verified' : 'Pending'}</Badge>
          </TableCell>
          <TableCell><StatusBadge status={r.status} /></TableCell>
          <TableCell className={when}>{formatDate(r.createdAt)}</TableCell>
        </TableRow>
      );
    case 'staff':
      return (
        <TableRow>
          <TableCell>
            <div className="text-sm font-medium">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.jobTitle || r.email}</div>
          </TableCell>
          <TableCell className="font-mono text-xs">{r.employeeId}</TableCell>
          <TableCell className="text-sm">{r.role ?? '-'}</TableCell>
          <TableCell className="text-sm">{r.department ?? '-'}</TableCell>
          <TableCell><StatusBadge status={r.status} /></TableCell>
          <TableCell className={when}>{formatDate(r.hireDate)}</TableCell>
          <TableCell className={when}>{r.lastLoginAt ? formatDateTime(r.lastLoginAt) : 'Never'}</TableCell>
        </TableRow>
      );
    case 'journal':
      return (
        <TableRow className={r.isReversed ? 'opacity-60' : undefined}>
          <TableCell className="font-mono text-xs">{r.entryNumber}</TableCell>
          <TableCell className={when}>{formatDate(r.entryDate)}</TableCell>
          <TableCell className="text-xs">{label(r.entryType)}</TableCell>
          <TableCell className="min-w-[200px] text-sm">{r.description}</TableCell>
          <TableCell className="text-xs">{r.sourceModule ?? 'MANUAL'}</TableCell>
          <TableCell className={money}>{formatCurrency(r.totalDebit)}</TableCell>
          <TableCell>
            <StatusBadge status={r.status} />
            {r.isReversed && <Badge variant="warning" className="ml-1">Reversed</Badge>}
          </TableCell>
          <TableCell className="text-sm">{r.createdBy ?? '-'}</TableCell>
        </TableRow>
      );
  }
}
