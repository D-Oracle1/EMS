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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { getAuditLogs } from '@/actions/report.actions';

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

const formatTimestamp = (dateStr: string | Date): string => {
  const d = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
  return d.toLocaleDateString('en-NG', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  // Filter state
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [userId, setUserId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPending, startTransition] = useTransition();

  const fetchLogs = (page = 1) => {
    startTransition(async () => {
      try {
        const result = await getAuditLogs({
          module: module || undefined,
          action: action || undefined,
          userId: userId || undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
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

  const handleSearch = () => {
    fetchLogs(1);
  };

  const handleReset = () => {
    setModule('');
    setAction('');
    setUserId('');
    setStartDate('');
    setEndDate('');
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

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-muted-foreground">
          System-wide activity and change tracking
        </p>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Filters
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Module</Label>
              <Select value={module} onValueChange={(v) => setModule(v === 'ALL' ? '' : v)}>
                <SelectTrigger className="w-[160px]">
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
              <Label htmlFor="filter-action" className="text-xs">Action</Label>
              <Input
                id="filter-action"
                placeholder="e.g. CREATE"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-userId" className="text-xs">User ID</Label>
              <Input
                id="filter-userId"
                placeholder="User ID"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="w-[150px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-start" className="text-xs">Start Date</Label>
              <Input
                id="filter-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filter-end" className="text-xs">End Date</Label>
              <Input
                id="filter-end"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-[160px]"
              />
            </div>
            <Button onClick={handleSearch} disabled={isPending}>
              <Search className={`mr-2 h-4 w-4`} />
              Search
            </Button>
            <Button variant="ghost" onClick={handleReset} disabled={isPending}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Audit Logs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Activity Log
            {pagination.total > 0 && (
              <Badge variant="secondary" className="ml-2">
                {pagination.total} records
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isPending && (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
              <span className="text-muted-foreground">Loading...</span>
            </div>
          )}

          {!isPending && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date/Time</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Employee ID</TableHead>
                    <TableHead>Module</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity Type</TableHead>
                    <TableHead>Entity ID</TableHead>
                    <TableHead>Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        No audit logs found
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          {formatTimestamp(log.createdAt)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm font-medium">
                            {log.user
                              ? `${log.user.firstName} ${log.user.lastName}`
                              : 'System'}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm font-mono">
                          {log.user?.employeeId || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{log.module}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionVariant[log.action] || 'default'}>
                            {log.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{log.entityType || '-'}</TableCell>
                        <TableCell className="text-xs font-mono truncate max-w-[120px]">
                          {log.entityId || '-'}
                        </TableCell>
                        <TableCell className="max-w-[280px] truncate text-sm">
                          {log.description || '-'}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {pagination.totalPages > 1 && !isPending && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
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
                  <ChevronLeft className="h-4 w-4 mr-1" />
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
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
