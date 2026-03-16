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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="h-6 w-6" />
            Customers
          </h1>
          <p className="text-muted-foreground">
            Manage customer accounts, KYC, and profiles
          </p>
        </div>
        <PermissionGate permission="CUSTOMERS:CREATE">
          <Button asChild>
            <Link href="/customers/new">
              <Plus className="h-4 w-4 mr-2" />
              New Customer
            </Link>
          </Button>
        </PermissionGate>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <form onSubmit={handleSearch} className="flex-1 flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by name, customer #, phone, or email..."
                  value={searchValue}
                  onChange={(e) => setSearchValue(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Button type="submit" variant="secondary" disabled={isPending}>
                Search
              </Button>
            </form>

            <Select
              value={filters.status || 'all'}
              onValueChange={(value) =>
                updateFilters({ status: value === 'all' ? '' : value })
              }
            >
              <SelectTrigger className="w-[150px]">
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
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                <SelectItem value="CORPORATE">Corporate</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">
            {pagination.total} Customer{pagination.total !== 1 ? 's' : ''} found
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
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
        </CardContent>

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
      </Card>
    </div>
  );
}
