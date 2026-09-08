'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, Plus, PiggyBank, RefreshCw, TrendingUp, Calendar, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatCard } from '@/components/ui/stat-card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { formatCurrency, formatDate } from '@/lib/utils';
import {
  getSavingsAccountsList,
  getFixedSavingsProducts,
  getFixedSavingsDashboard,
  fixedSavingsDeposit,
} from '@/actions/fixed-savings.actions';
import type { SessionUser } from '@/types';

interface Props { user: SessionUser; }

const statusVariant: Record<string, any> = {
  ACTIVE: 'success',
  MATURED: 'warning',
  TERMINATION_REQUESTED: 'warning',
  TERMINATED: 'destructive',
  COMPLETED: 'secondary',
  DORMANT: 'secondary',
  CLOSED: 'secondary',
};

export function FixedSavingsAccountsClient({ user }: Props) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [productId, setProductId] = useState('');
  const [kind, setKind] = useState<'ALL' | 'FIXED' | 'ORDINARY'>('ALL');
  const [isPending, startTransition] = useTransition();

  // Deposit dialog
  const [depositOpen, setDepositOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositMode, setDepositMode] = useState('CASH');
  const [depositRef, setDepositRef] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);

  function loadData(page = 1) {
    startTransition(async () => {
      try {
        const [accs, prods, dash] = await Promise.all([
          getSavingsAccountsList({ search: search || undefined, status: status || undefined, productId: productId || undefined, kind, page, limit: 20 }),
          getFixedSavingsProducts(),
          getFixedSavingsDashboard(),
        ]);
        setAccounts(accs.data);
        setPagination(accs.pagination);
        setProducts(prods);
        setStats(dash);
      } catch (e: any) {
        toast.error(e.message || 'Failed to load data');
      }
    });
  }

  useEffect(() => { loadData(1); }, []);

  function monthsRemaining(maturityDate: string | Date | null) {
    if (!maturityDate) return '—';
    const diff = new Date(maturityDate).getTime() - Date.now();
    const months = Math.ceil(diff / (1000 * 60 * 60 * 24 * 30));
    if (months <= 0) return 'Matured';
    return `${months}m`;
  }

  function openDeposit(account: any) {
    setSelectedAccount(account);
    setDepositAmount('');
    setDepositMode('CASH');
    setDepositRef('');
    setDepositOpen(true);
  }

  async function handleDeposit() {
    if (!depositAmount || parseFloat(depositAmount) <= 0) return toast.error('Enter a valid amount');
    setDepositLoading(true);
    try {
      const result = await fixedSavingsDeposit({
        accountId: selectedAccount.id,
        amount: parseFloat(depositAmount),
        paymentMode: depositMode,
        paymentReference: depositRef || undefined,
      });
      if (result.success) {
        toast.success(result.message);
        setDepositOpen(false);
        loadData(pagination.page);
      } else {
        toast.error(result.error);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setDepositLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <PiggyBank className="h-6 w-6" />
            Fixed Savings Accounts
          </h1>
          <p className="text-muted-foreground">Manage fixed-term savings accounts with interest accrual</p>
        </div>
        <div className="flex gap-2">
          {user.permissions.includes('SAVINGS:APPROVE') && (
            <Button variant="outline" asChild>
              <Link href="/savings/terminations">Terminations</Link>
            </Button>
          )}
          {user.permissions.includes('SAVINGS:CREATE') && (
            <Button asChild>
              <Link href="/savings/create">
                <Plus className="mr-2 h-4 w-4" />
                New Account
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard title="Active Accounts" color="emerald" value={stats.activeAccounts} />
          <StatCard
            title="Total Deposits"
            color="sky"
            value={formatCurrency(stats.totalDeposits)}
          />
          <StatCard
            title="Accrued Interest"
            color="teal"
            value={formatCurrency(stats.totalAccruedInterest)}
          />
          <StatCard
            title="Pending Terminations"
            color="amber"
            value={stats.pendingTerminations}
          />
        </div>
      )}

      {/* Accounts Table */}
      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by account # or customer name..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && loadData(1)} className="pl-9" />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="MATURED">Matured</SelectItem>
                <SelectItem value="TERMINATION_REQUESTED">Termination Requested</SelectItem>
                <SelectItem value="TERMINATED">Terminated</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={productId} onValueChange={(v) => setProductId(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="All Plans" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Plans</SelectItem>
                {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={kind} onValueChange={(v) => setKind(v as 'ALL' | 'FIXED' | 'ORDINARY')}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All types</SelectItem>
                <SelectItem value="FIXED">Fixed-term</SelectItem>
                <SelectItem value="ORDINARY">Ordinary savings</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => loadData(1)} disabled={isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              Search
            </Button>
          </div>

          {/* Desktop Table */}
          <div className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead className="text-right">Total Deposits</TableHead>
                  <TableHead className="text-right">Eligible Bal.</TableHead>
                  <TableHead className="text-right">Pending Dep.</TableHead>
                  <TableHead className="text-right">Accrued Interest</TableHead>
                  <TableHead className="text-center">Matures</TableHead>
                  <TableHead className="text-center">Remaining</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isPending && <TableRow><TableCell colSpan={12} className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></TableCell></TableRow>}
                {!isPending && accounts.length === 0 && <TableRow><TableCell colSpan={12} className="text-center text-muted-foreground py-8">No accounts found</TableCell></TableRow>}
                {accounts.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/savings/${a.id}`} className="font-medium text-primary hover:underline">{a.accountNumber}</Link>
                    </TableCell>
                    <TableCell>
                      <p>{a.customer.firstName} {a.customer.lastName}</p>
                      <p className="text-xs text-muted-foreground">{a.customer.customerNumber}</p>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{a.product.name}</p>
                      {a.maturityDate ? (
                        <p className="text-xs text-muted-foreground">
                          {a.product.durationMonths}m @ {parseFloat(a.product.totalInterestRate ?? 0).toFixed(1)}%
                        </p>
                      ) : (
                        <Badge variant="secondary" className="mt-0.5 text-[10px]">Ordinary savings</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(a.currentBalance)}</TableCell>
                    <TableCell className="text-right">
                      {a.maturityDate ? formatCurrency(a.totalDeposits) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {a.maturityDate ? formatCurrency(a.eligibleBalance) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-orange-600">{a.pendingDeposits > 0 ? formatCurrency(a.pendingDeposits) : '—'}</TableCell>
                    <TableCell className="text-right text-green-600">{formatCurrency(a.interestAccrued)}</TableCell>
                    <TableCell className="text-center text-sm">{a.maturityDate ? formatDate(a.maturityDate) : '—'}</TableCell>
                    <TableCell className="text-center text-sm">{monthsRemaining(a.maturityDate)}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={statusVariant[a.status] || 'default'}>{a.status.replace('_', ' ')}</Badge>
                    </TableCell>
                    <TableCell>
                      {a.status === 'ACTIVE' && user.permissions.includes('SAVINGS:DEPOSIT') && (
                        <Button size="sm" variant="outline" onClick={() => openDeposit(a)}>Deposit</Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Mobile Cards */}
          <div className="lg:hidden space-y-3">
            {accounts.map((a) => (
              <Card key={a.id}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <Link href={`/savings/${a.id}`} className="font-medium text-primary hover:underline">{a.accountNumber}</Link>
                      <p className="text-sm">{a.customer.firstName} {a.customer.lastName}</p>
                    </div>
                    <Badge variant={statusVariant[a.status] || 'default'}>{a.status.replace('_', ' ')}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-1 text-sm">
                    <span className="text-muted-foreground">Plan:</span><span>{a.product.name}</span>
                    <span className="text-muted-foreground">Total Deposits:</span><span className="font-semibold">{formatCurrency(a.totalDeposits)}</span>
                    <span className="text-muted-foreground">Eligible Balance:</span><span>{formatCurrency(a.eligibleBalance)}</span>
                    <span className="text-muted-foreground">Accrued Interest:</span><span className="text-green-600">{formatCurrency(a.interestAccrued)}</span>
                    <span className="text-muted-foreground">Matures:</span><span>{a.maturityDate ? formatDate(a.maturityDate) : '—'}</span>
                    <span className="text-muted-foreground">Remaining:</span><span>{monthsRemaining(a.maturityDate)}</span>
                  </div>
                  {a.status === 'ACTIVE' && user.permissions.includes('SAVINGS:DEPOSIT') && (
                    <Button size="sm" variant="outline" onClick={() => openDeposit(a)} className="w-full">Deposit</Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => loadData(pagination.page - 1)} disabled={pagination.page <= 1 || isPending}>Previous</Button>
                <span className="text-sm py-1">Page {pagination.page} of {pagination.totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => loadData(pagination.page + 1)} disabled={pagination.page >= pagination.totalPages || isPending}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deposit Dialog */}
      <Dialog open={depositOpen} onOpenChange={setDepositOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Make Deposit — {selectedAccount?.accountNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedAccount && (
              <div className="bg-muted rounded-md p-3 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Current Balance:</span>
                  <span className="font-semibold">{formatCurrency(selectedAccount.currentBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Eligible Balance:</span>
                  <span>{formatCurrency(selectedAccount.eligibleBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pending (next roll):</span>
                  <span className="text-orange-600">{formatCurrency(selectedAccount.pendingDeposits)}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">New deposits are pending until the next monthly interest run.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Amount (₦) <span className="text-destructive">*</span></Label>
              <Input type="number" min={0.01} step={0.01} placeholder="0.00" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Payment Mode</Label>
              <Select value={depositMode} onValueChange={setDepositMode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CASH">Cash</SelectItem>
                  <SelectItem value="BANK_TRANSFER">Bank Transfer</SelectItem>
                  <SelectItem value="CHEQUE">Cheque</SelectItem>
                  <SelectItem value="ONLINE">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Payment Reference</Label>
              <Input placeholder="Optional reference" value={depositRef} onChange={(e) => setDepositRef(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDepositOpen(false)}>Cancel</Button>
            <Button onClick={handleDeposit} disabled={depositLoading}>
              {depositLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Process Deposit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
