'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  CalendarOff,
  Plus,
  Check,
  X,
  RefreshCw,
  Send,
  Ban,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { StatCard, type StatColor } from '@/components/ui/stat-card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatDate } from '@/lib/utils';
import {
  requestLeave,
  getLeaveRequests,
  approveLeave,
  cancelLeaveRequest,
  getLeaveBalances,
} from '@/actions/hr.actions';
import { getLeaveTypes } from '@/actions/hr-config.actions';
import type { SessionUser } from '@/types';

const leaveStatusVariant: Record<string, 'success' | 'error' | 'warning' | 'secondary' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'secondary',
};

/**
 * Leave types carry a free-form `colorHex` in the database, which cannot drive
 * the token-based card. The standard codes get a deliberate palette colour and
 * anything custom falls back to violet.
 */
function leaveTypeColor(code: string): StatColor {
  switch (code) {
    case 'ANNUAL':
      return 'sky';
    case 'SICK':
      return 'rose';
    case 'CASUAL':
      return 'amber';
    case 'MATERNITY':
      return 'pink';
    case 'PATERNITY':
      return 'indigo';
    case 'COMPASSIONATE':
      return 'slate';
    case 'STUDY':
      return 'teal';
    case 'UNPAID':
      return 'slate';
    default:
      return 'violet';
  }
}

interface LeaveClientProps {
  user: SessionUser;
}

export function LeaveClient({ user }: LeaveClientProps) {
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<any[]>([]);
  const [newLeaveOpen, setNewLeaveOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<any>(null);
  const [rejectComment, setRejectComment] = useState('');
  const [isPending, startTransition] = useTransition();

  const isManager = user.permissions.includes('HR:STAFF_UPDATE') || user.permissions.includes('HR:LEAVE_MANAGE');

  const fetchMyLeaves = () => {
    startTransition(async () => {
      try {
        const [leaves, bal] = await Promise.all([getLeaveRequests({}), getLeaveBalances()]);
        setMyLeaves(leaves);
        setBalances(bal);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load leave requests');
      }
    });
  };

  const fetchPendingLeaves = () => {
    if (!isManager) return;
    startTransition(async () => {
      try {
        const result = await getLeaveRequests({ staffId: 'all', status: 'PENDING' });
        setPendingLeaves(result);
      } catch (error: any) {
        console.error('Failed to load pending leaves:', error.message);
      }
    });
  };

  useEffect(() => {
    fetchMyLeaves();
    if (isManager) fetchPendingLeaves();
    getLeaveTypes()
      .then(setLeaveTypes)
      .catch(() => setLeaveTypes([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = (leaveId: string) => {
    startTransition(async () => {
      const result = await approveLeave(leaveId, 'APPROVED');
      if (result.success) {
        toast.success(result.message);
        fetchPendingLeaves();
      } else {
        toast.error(result.error || 'Failed to approve');
      }
    });
  };

  const handleReject = () => {
    if (!rejectTarget) return;
    if (!rejectComment.trim()) {
      toast.error('A comment is required when rejecting a request');
      return;
    }
    startTransition(async () => {
      const result = await approveLeave(rejectTarget.id, 'REJECTED', rejectComment.trim());
      if (result.success) {
        toast.success(result.message);
        setRejectTarget(null);
        setRejectComment('');
        fetchPendingLeaves();
      } else {
        toast.error(result.error || 'Failed to reject');
      }
    });
  };

  const handleCancel = (leaveId: string) => {
    startTransition(async () => {
      const result = await cancelLeaveRequest(leaveId);
      if (result.success) {
        toast.success(result.message);
        fetchMyLeaves();
      } else {
        toast.error(result.error || 'Failed to cancel');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
          <p className="text-muted-foreground">Request leave and track your entitlement</p>
        </div>
        <Dialog open={newLeaveOpen} onOpenChange={setNewLeaveOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Request Leave
            </Button>
          </DialogTrigger>
          <LeaveRequestDialog
            leaveTypes={leaveTypes}
            balances={balances}
            onSuccess={() => {
              setNewLeaveOpen(false);
              fetchMyLeaves();
            }}
          />
        </Dialog>
      </div>

      {/* Entitlement balances */}
      {balances.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {balances.map((balance) => {
            const total = balance.entitledDays + balance.carriedForwardDays;
            const consumed = balance.usedDays + balance.pendingDays;
            const percent = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;

            return (
              <StatCard
                key={balance.leaveTypeId}
                title={balance.leaveTypeName}
                color={leaveTypeColor(balance.leaveTypeCode)}
                value={balance.availableDays}
                secondaryValue={total}
                icon={CalendarOff}
                // The ring reads as the share of the entitlement already spent.
                progress={percent}
                description={
                  balance.pendingDays > 0
                    ? `${balance.usedDays} used · ${balance.pendingDays} pending · of ${total} days`
                    : `${balance.usedDays} used · of ${total} days`
                }
              />
            );
          })}
        </div>
      )}

      {/* My leave requests */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <CalendarOff className="h-5 w-5" />
            My Leave Requests
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchMyLeaves} disabled={isPending}>
            <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>End Date</TableHead>
                <TableHead>Days</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {myLeaves.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                    {isPending ? 'Loading…' : 'No leave requests found'}
                  </TableCell>
                </TableRow>
              )}
              {myLeaves.map((leave) => (
                <TableRow key={leave.id}>
                  <TableCell className="font-medium">
                    {leave.leaveTypeRef?.name ?? leave.leaveType}
                  </TableCell>
                  <TableCell>{formatDate(leave.startDate)}</TableCell>
                  <TableCell>{formatDate(leave.endDate)}</TableCell>
                  <TableCell className="tabular-nums">{leave.days}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{leave.reason}</TableCell>
                  <TableCell>
                    <Badge variant={leaveStatusVariant[leave.status] || 'default'}>
                      {leave.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {leave.approver
                      ? `${leave.approver.firstName} ${leave.approver.lastName}`
                      : '—'}
                  </TableCell>
                  <TableCell>
                    {(leave.status === 'PENDING' || leave.status === 'APPROVED') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCancel(leave.id)}
                        disabled={isPending}
                      >
                        <Ban className="mr-1 h-3 w-3" />
                        Cancel
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending approval queue (managers only) */}
      {isManager && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Pending Approvals
              {pendingLeaves.length > 0 && (
                <Badge variant="warning">{pendingLeaves.length}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchPendingLeaves} disabled={isPending}>
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingLeaves.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      {isPending ? 'Loading…' : 'No pending leave requests'}
                    </TableCell>
                  </TableRow>
                )}
                {pendingLeaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell>
                      <div className="font-medium">
                        {leave.staff.firstName} {leave.staff.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">{leave.staff.employeeId}</div>
                    </TableCell>
                    <TableCell>{leave.leaveTypeRef?.name ?? leave.leaveType}</TableCell>
                    <TableCell>{formatDate(leave.startDate)}</TableCell>
                    <TableCell>{formatDate(leave.endDate)}</TableCell>
                    <TableCell className="tabular-nums">{leave.days}</TableCell>
                    <TableCell className="max-w-[180px] truncate">{leave.reason}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleApprove(leave.id)}
                          disabled={isPending}
                        >
                          <Check className="mr-1 h-3 w-3" />
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => setRejectTarget(leave)}
                          disabled={isPending}
                        >
                          <X className="mr-1 h-3 w-3" />
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Rejection reason */}
      <Dialog open={Boolean(rejectTarget)} onOpenChange={(open) => !open && setRejectTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Leave Request</DialogTitle>
            <DialogDescription>
              {rejectTarget &&
                `${rejectTarget.staff.firstName} ${rejectTarget.staff.lastName} — ${rejectTarget.days} day(s)`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-comment">Reason for rejection</Label>
            <textarea
              id="reject-comment"
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              placeholder="Explain why this request is being declined…"
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={isPending}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function LeaveRequestDialog({
  leaveTypes,
  balances,
  onSuccess,
}: {
  leaveTypes: any[];
  balances: any[];
  onSuccess: () => void;
}) {
  const [leaveTypeId, setLeaveTypeId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [handoverToId, setHandoverToId] = useState('');
  const [contactDuringLeave, setContactDuringLeave] = useState('');
  const [attachmentUrl, setAttachmentUrl] = useState('');
  const [isPending, startTransition] = useTransition();

  const selectedType = leaveTypes.find((t) => t.id === leaveTypeId);
  const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!leaveTypeId) {
      toast.error('Select a leave type');
      return;
    }
    if (!startDate || !endDate) {
      toast.error('Select start and end dates');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast.error('The end date must be on or after the start date');
      return;
    }
    if (!reason.trim()) {
      toast.error('Provide a reason');
      return;
    }

    startTransition(async () => {
      const result = await requestLeave({
        leaveTypeId,
        startDate,
        endDate,
        reason: reason.trim(),
        handoverToId: handoverToId || undefined,
        contactDuringLeave: contactDuringLeave.trim() || undefined,
        attachmentUrl: attachmentUrl.trim() || undefined,
      });

      if (result.success) {
        toast.success(result.message);
        onSuccess();
      } else {
        toast.error(result.error || 'Failed to submit leave request');
      }
    });
  };

  return (
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Request Leave</DialogTitle>
        <DialogDescription>Submit a new leave request for approval.</DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="leave-type">Leave Type</Label>
          <Select value={leaveTypeId} onValueChange={setLeaveTypeId}>
            <SelectTrigger id="leave-type">
              <SelectValue placeholder="Select a leave type" />
            </SelectTrigger>
            <SelectContent>
              {leaveTypes.length === 0 && (
                <SelectItem value="__none" disabled>
                  No leave types configured
                </SelectItem>
              )}
              {leaveTypes.map((type) => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                  {!type.isPaid && ' (unpaid)'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedBalance && (
            <p className="text-xs text-muted-foreground">
              {selectedBalance.availableDays} day(s) available
              {selectedBalance.pendingDays > 0 && ` · ${selectedBalance.pendingDays} pending`}
            </p>
          )}
          {selectedType?.requiresDocument && (
            <p className="text-xs text-amber-600 dark:text-amber-500">
              This leave type requires a supporting document.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="leave-start">Start Date</Label>
            <Input
              id="leave-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="leave-end">End Date</Label>
            <Input
              id="leave-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="leave-reason">Reason</Label>
          <textarea
            id="leave-reason"
            className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="Provide a reason for your leave request…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="leave-contact">Contact While Away (optional)</Label>
          <Input
            id="leave-contact"
            value={contactDuringLeave}
            onChange={(e) => setContactDuringLeave(e.target.value)}
            placeholder="Phone number or email"
          />
        </div>

        {selectedType?.requiresDocument && (
          <div className="space-y-2">
            <Label htmlFor="leave-attachment">Supporting Document URL</Label>
            <Input
              id="leave-attachment"
              value={attachmentUrl}
              onChange={(e) => setAttachmentUrl(e.target.value)}
              placeholder="Link to the uploaded document"
            />
          </div>
        )}

        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            <Send className="mr-2 h-4 w-4" />
            {isPending ? 'Submitting…' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
