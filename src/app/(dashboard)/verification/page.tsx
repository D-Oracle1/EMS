'use client';

import { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ClipboardCheck,
  Eye,
  ChevronLeft,
  ChevronRight,
  Search,
  BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
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
import { formatDate } from '@/lib/utils';
import {
  getVerificationTasks,
  startVerificationTask,
} from '@/actions/verification.actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface VerificationTask {
  id: string;
  status: string;
  priority: string;
  taskType: string;
  createdAt: Date | string;
  customer: { customerNumber: string; firstName: string; lastName: string } | null;
  loan: { loanNumber: string } | null;
  assignedTo: { firstName: string; lastName: string; employeeId: string } | null;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// ---------------------------------------------------------------------------
// Priority badge helpers
// ---------------------------------------------------------------------------

const PRIORITY_VARIANT: Record<string, string> = {
  URGENT: 'bg-red-200 text-red-900 border-red-300',
  HIGH: 'bg-red-100 text-red-800 border-red-200',
  NORMAL: 'bg-blue-100 text-blue-800 border-blue-200',
  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  LOW: 'bg-green-100 text-green-800 border-green-200',
};

const STATUS_VARIANT: Record<
  string,
  'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'
> = {
  ASSIGNED: 'warning',
  PENDING: 'warning',
  IN_PROGRESS: 'info',
  COMPLETED: 'success',
};

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

const STATUS_OPTIONS = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'In Progress', value: 'IN_PROGRESS' },
  { label: 'Completed', value: 'COMPLETED' },
];

const PRIORITY_OPTIONS = [
  { label: 'All Priorities', value: 'ALL' },
  { label: 'Urgent', value: 'URGENT' },
  { label: 'High', value: 'HIGH' },
  { label: 'Normal', value: 'NORMAL' },
  { label: 'Low', value: 'LOW' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function VerificationTasksPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tasks, setTasks] = useState<VerificationTask[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async (page: number, status: string, priority: string, search: string) => {
    setLoading(true);
    try {
      const filters: Record<string, unknown> = { page, limit: 20 };
      if (status !== 'ALL') filters.status = status;
      if (priority !== 'ALL') filters.priority = priority;
      if (search.trim()) filters.search = search.trim();

      const result = await getVerificationTasks(filters as any);
      setTasks(result.data as unknown as VerificationTask[]);
      setPagination(result.pagination);
    } catch (err: any) {
      toast.error(err.message || 'Failed to load verification tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on filter changes
  useEffect(() => {
    fetchTasks(1, statusFilter, priorityFilter, searchTerm);
  }, [statusFilter, priorityFilter, fetchTasks]); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchTasks(1, statusFilter, priorityFilter, searchTerm);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchTerm]); // eslint-disable-line react-hooks/exhaustive-deps

  function handlePageChange(page: number) {
    fetchTasks(page, statusFilter, priorityFilter, searchTerm);
  }

  async function handleStartTask(taskId: string) {
    startTransition(async () => {
      const result = await startVerificationTask(taskId);
      if (result.success) {
        toast.success(result.message || 'Verification started');
        fetchTasks(pagination.page, statusFilter, priorityFilter, searchTerm);
      } else {
        toast.error(result.error || 'Failed to start verification');
      }
    });
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-indigo-50 flex items-center justify-center">
            <ClipboardCheck className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Verification Tasks</h1>
            <p className="text-sm text-muted-foreground">
              {pagination.total} total task{pagination.total !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <Link href="/verification/reports">
          <Button variant="outline" size="sm">
            <BarChart3 className="h-4 w-4 mr-1" />
            Reports
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customer or loan..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={priorityFilter} onValueChange={setPriorityFilter}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Task Queue</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="font-medium">Loading tasks...</p>
            </div>
          ) : tasks.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ClipboardCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No verification tasks found</p>
              <p className="text-sm mt-1">
                {statusFilter !== 'ALL' || priorityFilter !== 'ALL' || searchTerm
                  ? 'Try adjusting your filters'
                  : 'No tasks are available at this time'}
              </p>
            </div>
          ) : (
            <>
              {/* Mobile Card View */}
              <div className="space-y-3 md:hidden">
                {tasks.map((task) => (
                  <div key={task.id} className="border rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        {task.customer ? (
                          <>
                            <p className="font-medium">
                              {task.customer.firstName} {task.customer.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {task.customer.customerNumber}
                            </p>
                          </>
                        ) : (
                          <p className="text-muted-foreground">Unknown Customer</p>
                        )}
                      </div>
                      <Badge variant={STATUS_VARIANT[task.status] || 'secondary'}>
                        {task.status.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-sm">
                      {task.loan?.loanNumber && (
                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                          {task.loan.loanNumber}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {(task.taskType || '').replace(/_/g, ' ')}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                          PRIORITY_VARIANT[task.priority] || 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {task.priority}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(task.createdAt)}
                      </span>
                      <div className="flex gap-2">
                        {task.status === 'ASSIGNED' && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => handleStartTask(task.id)}
                            disabled={isPending}
                          >
                            Start
                          </Button>
                        )}
                        <Link href={`/verification/${task.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Loan Number</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell>
                          {task.customer ? (
                            <div>
                              <p className="font-medium">
                                {task.customer.firstName} {task.customer.lastName}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {task.customer.customerNumber}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {task.loan?.loanNumber || '-'}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {(task.taskType || '').replace(/_/g, ' ')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${
                              PRIORITY_VARIANT[task.priority] || 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {task.priority}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={STATUS_VARIANT[task.status] || 'secondary'}>
                            {task.status.replace(/_/g, ' ')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {formatDate(task.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            {task.status === 'ASSIGNED' && (
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => handleStartTask(task.id)}
                                disabled={isPending}
                              >
                                <ClipboardCheck className="h-4 w-4 mr-1" />
                                Start
                              </Button>
                            )}
                            <Link href={`/verification/${task.id}`}>
                              <Button variant="ghost" size="sm">
                                <Eye className="h-4 w-4 mr-1" />
                                View
                              </Button>
                            </Link>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Pagination */}
              {pagination.totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between mt-4 pt-4 border-t gap-3">
                  <p className="text-sm text-muted-foreground">
                    Page {pagination.page} of {pagination.totalPages} ({pagination.total} results)
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page <= 1 || isPending || loading}
                      onClick={() => handlePageChange(pagination.page - 1)}
                    >
                      <ChevronLeft className="h-4 w-4 mr-1" />
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pagination.page >= pagination.totalPages || isPending || loading}
                      onClick={() => handlePageChange(pagination.page + 1)}
                    >
                      Next
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
