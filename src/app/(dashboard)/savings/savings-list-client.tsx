'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { Search, Plus, PiggyBank, RefreshCw, Filter, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatCurrency } from '@/lib/utils';
import { getSavingsAccounts, getSavingsProducts } from '@/actions/savings.actions';
import type { SessionUser } from '@/types';

interface SavingsListClientProps {
  user: SessionUser;
}

const statusVariant: Record<string, 'success' | 'warning' | 'error' | 'secondary' | 'default'> = {
  ACTIVE: 'success',
  DORMANT: 'warning',
  FROZEN: 'error',
  CLOSED: 'secondary',
};

export function SavingsListClient({ user }: SavingsListClientProps) {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [products, setProducts] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [productId, setProductId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [isPending, startTransition] = useTransition();

  const fetchAccounts = (page = 1) => {
    startTransition(async () => {
      try {
        const result = await getSavingsAccounts({
          search: search || undefined,
          status: status || undefined,
          productId: productId || undefined,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          page,
          limit: 20,
        });
        setAccounts(result.data);
        setPagination(result.pagination);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load savings accounts');
      }
    });
  };

  useEffect(() => {
    fetchAccounts(1);
    getSavingsProducts().then(setProducts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    fetchAccounts(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setProductId('');
    setDateFrom('');
    setDateTo('');
    setTimeout(() => fetchAccounts(1), 0);
  };

  const hasActiveFilters = status || productId || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Savings Accounts</h1>
          <p className="text-muted-foreground">
            Manage customer savings accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/savings/dashboard">Dashboard</Link>
          </Button>
          {user.permissions.includes('SAVINGS:APPROVE') && (
            <Button variant="outline" asChild>
              <Link href="/savings/withdrawals">Withdrawal Queue</Link>
            </Button>
          )}
          {user.permissions.includes('SAVINGS:CREATE') && (
            <Button asChild>
              <Link href="/savings/new">
                <Plus className="mr-2 h-4 w-4" />
                New Account
              </Link>
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <PiggyBank className="h-5 w-5" />
            All Accounts
            {hasActiveFilters && (
              <Badge variant="secondary" className="ml-2">Filtered</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Search + primary filters */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by account # or customer name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <Select value={status} onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[160px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="DORMANT">Dormant</SelectItem>
                <SelectItem value="FROZEN">Frozen</SelectItem>
                <SelectItem value="CLOSED">Closed</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="sm:hidden"
              >
                <Filter className="mr-1 h-4 w-4" />
                Filters
                {showFilters ? <ChevronUp className="ml-1 h-3 w-3" /> : <ChevronDown className="ml-1 h-3 w-3" />}
              </Button>
              <Button variant="outline" onClick={() => handleSearch()} disabled={isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                Search
              </Button>
            </div>
          </div>

          {/* Extended filters row */}
          <div className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-4 ${showFilters ? '' : 'hidden sm:flex'}`}>
            <Select value={productId} onValueChange={(v) => setProductId(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="All Products" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Products</SelectItem>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">From:</span>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full sm:w-[160px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground whitespace-nowrap">To:</span>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full sm:w-[160px]"
              />
            </div>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                Clear
              </Button>
            )}
          </div>

          {/* Mobile card view */}
          <div className="md:hidden space-y-3">
            {accounts.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                {isPending ? 'Loading...' : 'No savings accounts found'}
              </p>
            )}
            {accounts.map((account) => (
              <Link key={account.id} href={`/savings/${account.id}`} className="block">
                <Card className="hover:bg-muted/50 transition-colors">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-primary">{account.accountNumber}</p>
                        <p className="text-sm">
                          {account.customer.firstName} {account.customer.lastName}
                        </p>
                        <p className="text-xs text-muted-foreground">{account.customer.customerNumber}</p>
                      </div>
                      <Badge variant={statusVariant[account.status] || 'default'}>
                        {account.status}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className="text-xs text-muted-foreground">{account.product.name}</span>
                      <span className="font-semibold">{formatCurrency(account.currentBalance)}</span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {/* Desktop table view */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {isPending ? 'Loading...' : 'No savings accounts found'}
                    </TableCell>
                  </TableRow>
                )}
                {accounts.map((account) => (
                  <TableRow key={account.id}>
                    <TableCell>
                      <Link
                        href={`/savings/${account.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {account.accountNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {account.customer.firstName} {account.customer.lastName}
                      <div className="text-xs text-muted-foreground">
                        {account.customer.customerNumber}
                      </div>
                    </TableCell>
                    <TableCell>{account.product.name}</TableCell>
                    <TableCell className="text-right font-medium">
                      {formatCurrency(account.currentBalance)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[account.status] || 'default'}>
                        {account.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} accounts
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchAccounts(pagination.page - 1)}
                  disabled={pagination.page <= 1 || isPending}
                >
                  Previous
                </Button>
                <span className="text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchAccounts(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || isPending}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
