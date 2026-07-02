'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Plus,
  Search,
  Eye,
  ChevronLeft,
  ChevronRight,
  Landmark,
  AlertTriangle,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatCurrency, formatDate } from '@/lib/utils';
import { markOverdueLoans } from '@/actions/loan.actions';
import type { SessionUser } from '@/types';

type LoanStatus =
  | 'DRAFT'
  | 'PENDING_VERIFICATION'
  | 'VERIFICATION_IN_PROGRESS'
  | 'VERIFIED'
  | 'PENDING_APPROVAL'
  | 'APPROVED'
  | 'PENDING_DISBURSEMENT'
  | 'REJECTED'
  | 'ACTIVE'
  | 'OVERDUE'
  | 'DEFAULTED'
  | 'CLOSED'
  | 'WRITTEN_OFF';

const STATUS_CONFIG: Record<
  LoanStatus,
  { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' | 'error' }
> = {
  DRAFT: { label: 'Draft', variant: 'secondary' },
  PENDING_VERIFICATION: { label: 'Pending Verification', variant: 'warning' },
  VERIFICATION_IN_PROGRESS: { label: 'Verification In Progress', variant: 'warning' },
  VERIFIED: { label: 'Verified', variant: 'info' },
  PENDING_APPROVAL: { label: 'Pending Approval', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'info' },
  PENDING_DISBURSEMENT: { label: 'Pending Disbursement', variant: 'info' },
  REJECTED: { label: 'Rejected', variant: 'error' },
  ACTIVE: { label: 'Active', variant: 'success' },
  OVERDUE: { label: 'Overdue', variant: 'destructive' },
  DEFAULTED: { label: 'Defaulted', variant: 'error' },
  CLOSED: { label: 'Closed', variant: 'outline' },
  WRITTEN_OFF: { label: 'Written Off', variant: 'error' },
};

const STATUS_TABS: { label: string; value: string }[] = [
  { label: 'All', value: '' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Pending Verification', value: 'PENDING_VERIFICATION' },
  { label: 'Verified', value: 'VERIFIED' },
  { label: 'Pending Approval', value: 'PENDING_APPROVAL' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Pending Disbursement', value: 'PENDING_DISBURSEMENT' },
  { label: 'Active', value: 'ACTIVE' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Closed', value: 'CLOSED' },
  { label: 'Rejected', value: 'REJECTED' },
];

interface LoansClientProps {
  user: SessionUser;
  loans: Array<{
    id: string;
    loanNumber: string;
    principalAmount: number;
    interestRate: number;
    tenure: number;
    status: string;
    createdAt: Date | string;
    customer: { customerNumber: string; firstName: string; lastName: string };
    product: { name: string; code: string };
    createdBy: { firstName: string; lastName: string };
  }>;
  pagination: { page: number; limit: number; total: number; totalPages: number };
  currentStatus: string;
  currentSearch: string;
}

export function LoansClient({
  user,
  loans,
  pagination,
  currentStatus,
  currentSearch,
}: LoansClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(currentSearch);

  const hasPermission = (perm: string) => user.permissions.includes(perm);

  function navigate(params: { status?: string; search?: string; page?: number }) {
    const sp = new URLSearchParams();
    const status = params.status ?? currentStatus;
    const searchVal = params.search ?? currentSearch;
    const page = params.page ?? 1;

    if (status) sp.set('status', status);
    if (searchVal) sp.set('search', searchVal);
    if (page > 1) sp.set('page', String(page));

    startTransition(() => {
      router.push(`/loans${sp.toString() ? `?${sp.toString()}` : ''}`);
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    navigate({ search, page: 1 });
  }

  return (
    <div className="space-y-5 animate-rise">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-tile icon-tile-orange">
            <Landmark className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Loans</h1>
            <p className="text-sm text-muted-foreground">
              {pagination.total} total loan{pagination.total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {(hasPermission('LOANS:APPROVE_L1') || hasPermission('LOANS:APPROVE_L2')) && (
            <Button
              variant="outline"
              className="rounded-full"
              onClick={() => {
                startTransition(async () => {
                  const result = await markOverdueLoans();
                  if (result.success) {
                    toast.success(result.message);
                    router.refresh();
                  } else {
                    toast.error(result.error || 'Failed to mark overdue loans');
                  }
                });
              }}
              disabled={isPending}
            >
              <AlertTriangle className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Mark Overdue</span>
            </Button>
          )}
          {hasPermission('LOANS:CREATE') && (
            <Link href="/loans/new">
              <Button className="rounded-full">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New Loan</span>
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1 pb-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => navigate({ status: tab.value, page: 1 })}
            className={`whitespace-nowrap px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors ${
              currentStatus === tab.value
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                : 'bg-muted text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="flex gap-2 max-w-md">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search loan number or customer…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 rounded-full"
          />
        </div>
        <Button type="submit" variant="secondary" className="rounded-full" disabled={isPending}>
          Search
        </Button>
      </form>

      {/* Loans */}
      {loans.length === 0 ? (
        <div className="premium-card text-center py-14 text-muted-foreground">
          <Landmark className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No loans found</p>
          <p className="text-sm mt-1">
            {currentSearch || currentStatus
              ? 'Try adjusting your filters'
              : 'Create a new loan application to get started'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-2.5">
            {loans.map((loan) => {
              const statusConf = STATUS_CONFIG[loan.status as LoanStatus] || {
                label: loan.status,
                variant: 'outline' as const,
              };
              return (
                <Link
                  key={loan.id}
                  href={`/loans/${loan.id}`}
                  className="premium-card premium-card-hover flex items-center gap-3 p-3.5"
                >
                  <div className="icon-tile icon-tile-sm icon-tile-orange">
                    <Landmark className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">
                      {loan.customer.firstName} {loan.customer.lastName}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {loan.loanNumber} · {loan.product.name}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-semibold text-sm">{formatCurrency(loan.principalAmount)}</p>
                    <Badge variant={statusConf.variant} className="mt-1">
                      {statusConf.label}
                    </Badge>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Desktop table */}
          <div className="premium-card hidden md:block overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Loan #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-center">Tenure</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loans.map((loan) => {
                  const statusConf = STATUS_CONFIG[loan.status as LoanStatus] || {
                    label: loan.status,
                    variant: 'outline' as const,
                  };
                  return (
                    <TableRow key={loan.id}>
                      <TableCell className="font-mono text-sm font-medium">
                        {loan.loanNumber}
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">
                            {loan.customer.firstName} {loan.customer.lastName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {loan.customer.customerNumber}
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{loan.product.name}</span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(loan.principalAmount)}
                      </TableCell>
                      <TableCell className="text-right">{loan.interestRate}%</TableCell>
                      <TableCell className="text-center">{loan.tenure}m</TableCell>
                      <TableCell>
                        <Badge variant={statusConf.variant}>{statusConf.label}</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDate(loan.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/loans/${loan.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" />
                            View
                          </Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between pt-1">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={pagination.page <= 1 || isPending}
                  onClick={() => navigate({ page: pagination.page - 1 })}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={pagination.page >= pagination.totalPages || isPending}
                  onClick={() => navigate({ page: pagination.page + 1 })}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
