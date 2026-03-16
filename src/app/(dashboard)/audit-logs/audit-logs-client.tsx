'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Shield,
  Search,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { getAuditLogs } from '@/actions/audit.actions';
import type { SessionUser } from '@/types';

const actionVariant: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default' | 'secondary'> = {
  CREATE: 'success',
  READ: 'default',
  UPDATE: 'info',
  DELETE: 'error',
  APPROVE: 'success',
  REJECT: 'error',
  LOGIN: 'info',
  LOGOUT: 'secondary',
  LOGIN_FAILED: 'error',
  PASSWORD_CHANGE: 'warning',
  EXPORT: 'info',
  PRINT: 'default',
  REVERSAL: 'warning',
};

interface AuditLogsClientProps {
  user: SessionUser;
}

export function AuditLogsClient({ user }: AuditLogsClientProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [isPending, startTransition] = useTransition();

  const fetchLogs = (page = 1) => {
    startTransition(async () => {
      try {
        const result = await getAuditLogs({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          module: module || undefined,
          action: action || undefined,
          search: search || undefined,
          page,
          limit: 50,
        });
        setLogs(result.data);
        setPagination(result.pagination);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load audit logs');
      }
    });
  };

  useEffect(() => {
    fetchLogs(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFilter = () => {
    fetchLogs(1);
  };

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    setModule('');
    setAction('');
    setSearch('');
    // Fetch with no filters after reset
    startTransition(async () => {
      try {
        const result = await getAuditLogs({ page: 1, limit: 50 });
        setLogs(result.data);
        setPagination(result.pagination);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load audit logs');
      }
    });
  };

  const formatTimestamp = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">
          System-wide activity and change tracking
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Activity Log
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            <div className="space-y-1">
              <Label htmlFor="audit-start" className="text-xs">Start Date</Label>
              <Input
                id="audit-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit-end" className="text-xs">End Date</Label>
              <Input
                id="audit-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Module</Label>
              <Select value={module} onValueChange={(v) => setModule(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Modules</SelectItem>
                  <SelectItem value="AUTH">Auth</SelectItem>
                  <SelectItem value="CUSTOMERS">Customers</SelectItem>
                  <SelectItem value="LOANS">Loans</SelectItem>
                  <SelectItem value="SAVINGS">Savings</SelectItem>
                  <SelectItem value="FIXED_DEPOSITS">Fixed Deposits</SelectItem>
                  <SelectItem value="ACCOUNTING">Accounting</SelectItem>
                  <SelectItem value="HR">HR</SelectItem>
                  <SelectItem value="SYSTEM">System</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Action</Label>
              <Select value={action} onValueChange={(v) => setAction(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Actions</SelectItem>
                  <SelectItem value="CREATE">Create</SelectItem>
                  <SelectItem value="UPDATE">Update</SelectItem>
                  <SelectItem value="DELETE">Delete</SelectItem>
                  <SelectItem value="APPROVE">Approve</SelectItem>
                  <SelectItem value="REJECT">Reject</SelectItem>
                  <SelectItem value="LOGIN">Login</SelectItem>
                  <SelectItem value="LOGOUT">Logout</SelectItem>
                  <SelectItem value="LOGIN_FAILED">Login Failed</SelectItem>
                  <SelectItem value="PASSWORD_CHANGE">Password Change</SelectItem>
                  <SelectItem value="REVERSAL">Reversal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="audit-search" className="text-xs">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="audit-search"
                  placeholder="Email, description..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
                  className="pl-9 w-[200px]"
                />
              </div>
            </div>
            <Button variant="outline" onClick={handleFilter} disabled={isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
              Filter
            </Button>
            <Button variant="ghost" onClick={handleReset} disabled={isPending}>
              Reset
            </Button>
          </div>

          {/* Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {isPending ? 'Loading...' : 'No audit logs found'}
                  </TableCell>
                </TableRow>
              )}
              {logs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs whitespace-nowrap">
                    {formatTimestamp(log.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{log.userName}</div>
                    {log.userRole && (
                      <div className="text-xs text-muted-foreground">{log.userRole}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={actionVariant[log.action] || 'default'}>
                      {log.action}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{log.module}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{log.entityType}</div>
                    {log.entityId && (
                      <div className="text-xs text-muted-foreground font-mono truncate max-w-[100px]">
                        {log.entityId}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="max-w-[280px] truncate text-sm">
                    {log.description}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} logs
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(pagination.page - 1)}
                  disabled={pagination.page <= 1 || isPending}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <span className="text-sm">
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchLogs(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || isPending}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
