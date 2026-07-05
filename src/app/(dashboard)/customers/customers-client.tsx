'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, useCallback } from 'react';
import Link from 'next/link';
import {
  Search,
  Plus,
  ChevronLeft,
  ChevronRight,
  Users,
  MoreHorizontal,
  Eye,
  Pencil,
  ShieldCheck,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { backfillCustomerLogins } from '@/actions/customer.actions';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { PermissionGate } from '@/components/permission-gate';

interface Customer {
  id: string;
  customerNumber: string;
  customerType: string;
  title?: string | null;
  firstName: string;
  lastName: string;
  middleName?: string | null;
  phone: string;
  email?: string | null;
  status: string;
  kycVerified: boolean;
  riskRating?: string | null;
  branch?: { name: string } | null;
  createdAt: string | Date;
  _count?: {
    loans: number;
    savingsAccounts: number;
    fixedDeposits: number;
  };
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface CustomersClientProps {
  customers: Customer[];
  pagination: Pagination;
  filters: {
    search: string;
    status: string;
    type: string;
  };
}

function getKycBadge(verified: boolean) {
  if (verified) {
    return <Badge variant="success">Verified</Badge>;
  }
  return <Badge variant="warning">Pending</Badge>;
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'ACTIVE':
      return <Badge variant="success">Active</Badge>;
    case 'INACTIVE':
      return <Badge variant="secondary">Inactive</Badge>;
    case 'SUSPENDED':
      return <Badge variant="destructive">Suspended</Badge>;
    case 'BLACKLISTED':
      return <Badge variant="error">Blacklisted</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

function getRiskBadge(rating: string | null | undefined) {
  switch (rating) {
    case 'LOW':
      return <Badge variant="success">Low</Badge>;
    case 'MEDIUM':
      return <Badge variant="warning">Medium</Badge>;
    case 'HIGH':
      return <Badge variant="error">High</Badge>;
    default:
      return <Badge variant="outline">N/A</Badge>;
  }
}

function getTypeBadge(type: string) {
  switch (type) {
    case 'INDIVIDUAL':
      return <Badge variant="info">Individual</Badge>;
    case 'CORPORATE':
      return <Badge variant="default">Corporate</Badge>;
    default:
      return <Badge variant="outline">{type}</Badge>;
  }
}

export function CustomersClient({
  customers,
  pagination,
  filters,
}: CustomersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchValue, setSearchValue] = useState(filters.search);
  const [backfilling, setBackfilling] = useState(false);

  const handleBackfill = async () => {
    if (!window.confirm('Provision portal logins for existing customers with an email? Each will be emailed a temporary password.')) return;
    setBackfilling(true);
    try {
      const r = await backfillCustomerLogins();
      if (r.success) toast.success(r.message || 'Done');
      else toast.error(r.error || 'Backfill failed');
    } finally {
      setBackfilling(false);
    }
  };

  const updateFilters = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      // Reset to page 1 when filters change (except when changing page)
      if (!('page' in updates)) {
        params.delete('page');
      }
      startTransition(() => {
        router.push(`/customers?${params.toString()}`);
      });
    },
    [router, searchParams]
  );

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      updateFilters({ search: searchValue });
    },
    [searchValue, updateFilters]
  );

  const handlePageChange = useCallback(
    (newPage: number) => {
      updateFilters({ page: newPage.toString() });
    },
    [updateFilters]
  );

  return (
    <div className="space-y-5 animate-rise">
      {/* Page Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="icon-tile icon-tile-cyan">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Customers</h1>
            <p className="text-sm text-muted-foreground">
              {pagination.total} customer{pagination.total !== 1 ? 's' : ''} · KYC &amp; profiles
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <PermissionGate permission="SYSTEM:USER_MANAGE">
            <Button
              variant="outline"
              size="sm"
              className="rounded-full"
              onClick={handleBackfill}
              disabled={backfilling}
              title="Provision portal logins for existing customers"
            >
              {backfilling ? <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" /> : <KeyRound className="h-4 w-4 sm:mr-1.5" />}
              <span className="hidden sm:inline">Provision Logins</span>
            </Button>
          </PermissionGate>
          <PermissionGate permission="CUSTOMERS:CREATE">
            <Button asChild className="rounded-full">
              <Link href="/customers/new">
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">New Customer</span>
              </Link>
            </Button>
          </PermissionGate>
        </div>
      </div>

      {/* Filters */}
      <div className="premium-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <form onSubmit={handleSearch} className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, customer #, phone, email…"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                className="pl-9 rounded-full"
              />
            </div>
            <Button type="submit" variant="secondary" className="rounded-full" disabled={isPending}>
              Search
            </Button>
          </form>

          <Select
            value={filters.status || 'all'}
            onValueChange={(value) =>
              updateFilters({ status: value === 'all' ? '' : value })
            }
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="INACTIVE">Inactive</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
              <SelectItem value="BLACKLISTED">Blacklisted</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.type || 'all'}
            onValueChange={(value) =>
              updateFilters({ type: value === 'all' ? '' : value })
            }
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="INDIVIDUAL">Individual</SelectItem>
              <SelectItem value="CORPORATE">Corporate</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden space-y-2.5">
        {customers.length === 0 ? (
          <div className="premium-card text-center py-14 text-muted-foreground">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">No customers found</p>
            {filters.search && <p className="text-sm mt-1">Try adjusting your search or filters</p>}
          </div>
        ) : (
          customers.map((customer) => (
            <Link
              key={customer.id}
              href={`/customers/${customer.id}`}
              className="premium-card premium-card-hover flex items-center gap-3 p-3.5"
            >
              <div className="icon-tile icon-tile-sm icon-tile-cyan font-semibold text-sm">
                {(customer.firstName?.[0] ?? '') + (customer.lastName?.[0] ?? '')}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-medium truncate">
                  {customer.title ? `${customer.title} ` : ''}
                  {customer.firstName} {customer.lastName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {customer.customerNumber} · {customer.phone}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                {getKycBadge(customer.kycVerified)}
                {getRiskBadge(customer.riskRating)}
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="premium-card hidden md:block overflow-hidden">
        <div className="p-4 pb-3">
          <p className="font-semibold">
            {pagination.total} Customer{pagination.total !== 1 ? 's' : ''} found
          </p>
        </div>
        <div className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer #</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>KYC Status</TableHead>
                <TableHead>Risk Rating</TableHead>
                <TableHead>Branch</TableHead>
                <TableHead className="w-[60px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <div className="flex flex-col items-center gap-2 text-muted-foreground">
                      <Users className="h-8 w-8" />
                      <p>No customers found</p>
                      {filters.search && (
                        <p className="text-sm">
                          Try adjusting your search or filters
                        </p>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                customers.map((customer) => (
                  <TableRow
                    key={customer.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/customers/${customer.id}`)}
                  >
                    <TableCell className="font-mono text-sm">
                      {customer.customerNumber}
                    </TableCell>
                    <TableCell className="font-medium">
                      {customer.title ? `${customer.title} ` : ''}
                      {customer.firstName} {customer.lastName}
                    </TableCell>
                    <TableCell>{getTypeBadge(customer.customerType)}</TableCell>
                    <TableCell>{customer.phone}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {customer.email || '-'}
                    </TableCell>
                    <TableCell>{getKycBadge(customer.kycVerified)}</TableCell>
                    <TableCell>{getRiskBadge(customer.riskRating)}</TableCell>
                    <TableCell className="text-sm">
                      {customer.branch?.name || '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link href={`/customers/${customer.id}`}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Details
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href={`/customers/${customer.id}?edit=true`}>
                              <Pencil className="h-4 w-4 mr-2" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          {!customer.kycVerified && (
                            <DropdownMenuItem asChild>
                              <Link href={`/customers/${customer.id}?verify=true`}>
                                <ShieldCheck className="h-4 w-4 mr-2" />
                                Verify KYC
                              </Link>
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t">
            <p className="text-sm text-muted-foreground">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
              {pagination.total} results
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1 || isPending}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Previous
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={
                  pagination.page >= pagination.totalPages || isPending
                }
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
