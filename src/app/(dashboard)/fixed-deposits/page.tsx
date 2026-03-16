'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Search, Plus, Landmark, RefreshCw } from 'lucide-react';
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
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { getFixedDeposits } from '@/actions/fixed-deposit.actions';

const statusVariant: Record<string, 'success' | 'info' | 'error' | 'default'> = {
  ACTIVE: 'success',
  MATURED: 'info',
  PREMATURE_CLOSED: 'error',
};

const statusLabel: Record<string, string> = {
  ACTIVE: 'Active',
  MATURED: 'Matured',
  PREMATURE_CLOSED: 'Premature Closed',
};

const currencyFormatter = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  minimumFractionDigits: 2,
});

export default function FixedDepositsPage() {
  const router = useRouter();
  const [deposits, setDeposits] = useState<any[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [isPending, startTransition] = useTransition();

  const fetchDeposits = (page = 1) => {
    startTransition(async () => {
      try {
        const result = await getFixedDeposits({
          search: search || undefined,
          status: status || undefined,
          page,
          limit: 20,
        });
        setDeposits(result.data);
        setPagination(result.pagination);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load fixed deposits');
      }
    });
  };

  useEffect(() => {
    fetchDeposits(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearch = () => {
    fetchDeposits(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Fixed Deposits</h1>
          <p className="text-muted-foreground">
            Manage customer fixed deposit certificates
          </p>
        </div>
        <Button asChild>
          <Link href="/fixed-deposits/new">
            <Plus className="mr-2 h-4 w-4" />
            New Fixed Deposit
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            All Fixed Deposits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by certificate # or customer name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleKeyDown}
                className="pl-9"
              />
            </div>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v === 'ALL' ? '' : v)}
            >
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Statuses</SelectItem>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="MATURED">Matured</SelectItem>
                <SelectItem value="PREMATURE_CLOSED">Premature Closed</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              onClick={() => handleSearch()}
              disabled={isPending}
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`}
              />
              Search
            </Button>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Certificate Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Principal Amount</TableHead>
                <TableHead className="text-right">Interest Rate</TableHead>
                <TableHead className="text-right">Tenure</TableHead>
                <TableHead>Maturity Date</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deposits.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-muted-foreground py-8"
                  >
                    {isPending ? 'Loading...' : 'No fixed deposits found'}
                  </TableCell>
                </TableRow>
              )}
              {deposits.map((fd) => (
                <TableRow
                  key={fd.id}
                  className="cursor-pointer"
                  onClick={() => router.push(`/fixed-deposits/${fd.id}`)}
                >
                  <TableCell className="font-medium text-primary">
                    {fd.certificateNumber}
                  </TableCell>
                  <TableCell>
                    {fd.customer?.firstName} {fd.customer?.lastName}
                    <div className="text-xs text-muted-foreground">
                      {fd.customer?.customerNumber}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(fd.principalAmount)}
                  </TableCell>
                  <TableCell className="text-right">
                    {fd.interestRate}%
                  </TableCell>
                  <TableCell className="text-right">
                    {fd.tenure} days
                  </TableCell>
                  <TableCell>
                    {fd.maturityDate ? formatDateTime(fd.maturityDate) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant[fd.status] || 'default'}>
                      {statusLabel[fd.status] || fd.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/fixed-deposits/${fd.id}`);
                      }}
                    >
                      View
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(
                  pagination.page * pagination.limit,
                  pagination.total
                )}{' '}
                of {pagination.total} fixed deposits
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchDeposits(pagination.page - 1)}
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
                  onClick={() => fetchDeposits(pagination.page + 1)}
                  disabled={
                    pagination.page >= pagination.totalPages || isPending
                  }
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
