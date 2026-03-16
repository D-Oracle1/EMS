'use client';

import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { getPendingWithdrawals, processWithdrawalRequest } from '@/actions/savings.actions';
import type { SessionUser } from '@/types';

const statusVariant: Record<string, 'warning' | 'success' | 'error' | 'secondary' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  PROCESSED: 'secondary',
  CANCELLED: 'secondary',
};

interface WithdrawalQueueClientProps {
  user: SessionUser;
}

export function WithdrawalQueueClient({ user }: WithdrawalQueueClientProps) {
  const [requests, setRequests] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [isPending, startTransition] = useTransition();
  const [actionRequest, setActionRequest] = useState<any>(null);
  const [actionType, setActionType] = useState<'APPROVE' | 'REJECT' | null>(null);

  const canApprove = user.permissions.includes('SAVINGS:APPROVE');

  const fetchRequests = (page = 1) => {
    startTransition(async () => {
      try {
        const result = await getPendingWithdrawals({
          status: statusFilter || undefined,
          page,
          limit: 20,
        });
        setRequests(result.data);
        setPagination(result.pagination);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load withdrawal requests');
      }
    });
  };

  useEffect(() => {
    fetchRequests(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/savings">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Withdrawal Approval Queue</h1>
            <p className="text-muted-foreground">
              Review and process withdrawal requests
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={() => fetchRequests(pagination.page)} disabled={isPending}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Withdrawal Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v === 'ALL' ? '' : v)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PENDING">Pending</SelectItem>
                <SelectItem value="APPROVED">Approved</SelectItem>
                <SelectItem value="REJECTED">Rejected</SelectItem>
                <SelectItem value="PROCESSED">Processed</SelectItem>
                <SelectItem value="ALL">All</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {pagination.total} request{pagination.total !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {requests.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                {isPending ? 'Loading...' : 'No withdrawal requests found'}
              </p>
            )}
            {requests.map((req) => (
              <Card key={req.id} className="border">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-mono text-sm font-medium">{req.requestNumber}</p>
                      <p className="text-sm">
                        {req.account.customer.firstName} {req.account.customer.lastName}
                      </p>
                      <p className="text-xs text-muted-foreground">{req.account.accountNumber}</p>
                    </div>
                    <Badge variant={statusVariant[req.status] || 'default'}>
                      {req.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      By {req.requestedBy.firstName} {req.requestedBy.lastName}
                    </span>
                    <span className="text-lg font-bold">{formatCurrency(req.amount)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDateTime(req.requestedAt)}
                  </p>
                  {req.status === 'PENDING' && canApprove && req.requestedById !== user.id && (
                    <>
                      <Separator />
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => { setActionRequest(req); setActionType('APPROVE'); }}
                        >
                          <CheckCircle className="mr-1 h-4 w-4" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => { setActionRequest(req); setActionType('REJECT'); }}
                        >
                          <XCircle className="mr-1 h-4 w-4" />
                          Reject
                        </Button>
                      </div>
                    </>
                  )}
                  {req.status === 'PENDING' && req.requestedById === user.id && (
                    <p className="text-xs text-amber-600 italic">Your own request</p>
                  )}
                  {req.status === 'REJECTED' && req.rejectionReason && (
                    <p className="text-xs text-red-600">Reason: {req.rejectionReason}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Request #</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  {canApprove && <TableHead>Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {requests.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canApprove ? 8 : 7} className="text-center text-muted-foreground py-8">
                      {isPending ? 'Loading...' : 'No withdrawal requests found'}
                    </TableCell>
                  </TableRow>
                )}
                {requests.map((req) => (
                  <TableRow key={req.id}>
                    <TableCell className="font-mono text-sm">{req.requestNumber}</TableCell>
                    <TableCell>
                      <Link href={`/savings/${req.accountId}`} className="text-primary hover:underline">
                        {req.account.accountNumber}
                      </Link>
                    </TableCell>
                    <TableCell>
                      {req.account.customer.firstName} {req.account.customer.lastName}
                      <div className="text-xs text-muted-foreground">{req.account.customer.customerNumber}</div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(req.amount)}</TableCell>
                    <TableCell>
                      {req.requestedBy.firstName} {req.requestedBy.lastName}
                      <div className="text-xs text-muted-foreground">{req.requestedBy.employeeId}</div>
                    </TableCell>
                    <TableCell className="text-sm">{formatDateTime(req.requestedAt)}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant[req.status] || 'default'}>
                        {req.status}
                      </Badge>
                      {req.status === 'REJECTED' && req.rejectionReason && (
                        <p className="text-xs text-red-600 mt-1 max-w-[150px] truncate" title={req.rejectionReason}>
                          {req.rejectionReason}
                        </p>
                      )}
                    </TableCell>
                    {canApprove && (
                      <TableCell>
                        {req.status === 'PENDING' && req.requestedById !== user.id ? (
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setActionRequest(req); setActionType('APPROVE'); }}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => { setActionRequest(req); setActionType('REJECT'); }}
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : req.status === 'PENDING' && req.requestedById === user.id ? (
                          <span className="text-xs text-amber-600">Own request</span>
                        ) : null}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchRequests(pagination.page - 1)}
                  disabled={pagination.page <= 1 || isPending}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchRequests(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages || isPending}
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      {actionRequest && actionType && (
        <ActionDialog
          request={actionRequest}
          type={actionType}
          onClose={() => { setActionRequest(null); setActionType(null); }}
          onSuccess={() => {
            setActionRequest(null);
            setActionType(null);
            fetchRequests(pagination.page);
          }}
        />
      )}
    </div>
  );
}

function ActionDialog({
  request,
  type,
  onClose,
  onSuccess,
}: {
  request: any;
  type: 'APPROVE' | 'REJECT';
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (type === 'REJECT' && !rejectionReason.trim()) {
      toast.error('Please provide a reason for rejection');
      return;
    }

    startTransition(async () => {
      const result = await processWithdrawalRequest({
        requestId: request.id,
        decision: type === 'APPROVE' ? 'APPROVED' : 'REJECTED',
        rejectionReason: type === 'REJECT' ? rejectionReason : undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onSuccess();
      } else {
        toast.error(result.error || `Failed to ${type.toLowerCase()} request`);
      }
    });
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {type === 'APPROVE' ? 'Approve Withdrawal' : 'Reject Withdrawal'}
          </DialogTitle>
          <DialogDescription>
            {request.requestNumber} — {formatCurrency(request.amount)} from {request.account.accountNumber}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Customer</span>
            <span>{request.account.customer.firstName} {request.account.customer.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Account Balance</span>
            <span>{formatCurrency(request.account.currentBalance)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Requested By</span>
            <span>{request.requestedBy.firstName} {request.requestedBy.lastName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Payment Mode</span>
            <span>{request.paymentMode}</span>
          </div>
          {request.reason && (
            <div>
              <span className="text-muted-foreground">Reason:</span>
              <p className="mt-1">{request.reason}</p>
            </div>
          )}
        </div>

        {type === 'REJECT' && (
          <div className="space-y-2">
            <Label>Rejection Reason</Label>
            <Textarea
              placeholder="Explain why this withdrawal is being rejected..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
            />
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isPending}>
            Cancel
          </Button>
          <Button
            variant={type === 'APPROVE' ? 'default' : 'destructive'}
            onClick={handleSubmit}
            disabled={isPending || (type === 'REJECT' && !rejectionReason.trim())}
          >
            {isPending
              ? 'Processing...'
              : type === 'APPROVE'
                ? 'Approve & Process'
                : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
