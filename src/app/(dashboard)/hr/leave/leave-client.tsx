'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  CalendarOff,
  Plus,
  Check,
  X,
  RefreshCw,
  Send,
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
} from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

const leaveStatusVariant: Record<string, 'success' | 'error' | 'warning' | 'secondary' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'secondary',
};

interface LeaveClientProps {
  user: SessionUser;
}

export function LeaveClient({ user }: LeaveClientProps) {
  const [myLeaves, setMyLeaves] = useState<any[]>([]);
  const [pendingLeaves, setPendingLeaves] = useState<any[]>([]);
  const [newLeaveOpen, setNewLeaveOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const isManager = user.permissions.includes('HR:STAFF_UPDATE');

  const fetchMyLeaves = () => {
    startTransition(async () => {
      try {
        const result = await getLeaveRequests({});
        setMyLeaves(result);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load leave requests');
      }
    });
  };

  const fetchPendingLeaves = () => {
    if (!isManager) return;
    startTransition(async () => {
      try {
        // Get all pending leaves (not just for current user)
        const result = await getLeaveRequests({ staffId: 'all', status: 'PENDING' });
        setPendingLeaves(result);
      } catch (error: any) {
        // If "all" is not supported, the server action might return empty
        // This is a graceful fallback
        console.error('Failed to load pending leaves:', error.message);
      }
    });
  };

  useEffect(() => {
    fetchMyLeaves();
    if (isManager) fetchPendingLeaves();
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

  const handleReject = (leaveId: string) => {
    startTransition(async () => {
      const result = await approveLeave(leaveId, 'REJECTED');
      if (result.success) {
        toast.success(result.message);
        fetchPendingLeaves();
      } else {
        toast.error(result.error || 'Failed to reject');
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Leave Management</h1>
          <p className="text-muted-foreground">
            Request and manage leave
          </p>
        </div>
        <Dialog open={newLeaveOpen} onOpenChange={setNewLeaveOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Request Leave
            </Button>
          </DialogTrigger>
          <LeaveRequestDialog
            onSuccess={() => {
              setNewLeaveOpen(false);
              fetchMyLeaves();
            }}
          />
        </Dialog>
      </div>

      {/* My Leave Requests */}
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
        <CardContent>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {myLeaves.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {isPending ? 'Loading...' : 'No leave requests found'}
                  </TableCell>
                </TableRow>
              )}
              {myLeaves.map((leave) => (
                <TableRow key={leave.id}>
                  <TableCell className="font-medium">{leave.leaveType}</TableCell>
                  <TableCell>{formatDate(leave.startDate)}</TableCell>
                  <TableCell>{formatDate(leave.endDate)}</TableCell>
                  <TableCell>{leave.days}</TableCell>
                  <TableCell className="max-w-[200px] truncate">{leave.reason}</TableCell>
                  <TableCell>
                    <Badge variant={leaveStatusVariant[leave.status] || 'default'}>
                      {leave.status}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {leave.approver
                      ? `${leave.approver.firstName} ${leave.approver.lastName}`
                      : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pending Approval Queue (Managers Only) */}
      {isManager && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarOff className="h-5 w-5" />
              Pending Approvals
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={fetchPendingLeaves} disabled={isPending}>
              <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
            </Button>
          </CardHeader>
          <CardContent>
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
                      {isPending ? 'Loading...' : 'No pending leave requests'}
                    </TableCell>
                  </TableRow>
                )}
                {pendingLeaves.map((leave) => (
                  <TableRow key={leave.id}>
                    <TableCell>
                      <div className="font-medium">
                        {leave.staff.firstName} {leave.staff.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {leave.staff.employeeId}
                      </div>
                    </TableCell>
                    <TableCell>{leave.leaveType}</TableCell>
                    <TableCell>{formatDate(leave.startDate)}</TableCell>
                    <TableCell>{formatDate(leave.endDate)}</TableCell>
                    <TableCell>{leave.days}</TableCell>
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
                          onClick={() => handleReject(leave.id)}
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
    </div>
  );
}

function LeaveRequestDialog({ onSuccess }: { onSuccess: () => void }) {
  const [leaveType, setLeaveType] = useState('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!startDate || !endDate) {
      toast.error('Please select start and end dates');
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast.error('End date must be after start date');
      return;
    }
    if (!reason.trim()) {
      toast.error('Please provide a reason');
      return;
    }

    startTransition(async () => {
      const result = await requestLeave({
        leaveType,
        startDate,
        endDate,
        reason: reason.trim(),
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
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Request Leave</DialogTitle>
        <DialogDescription>
          Submit a new leave request for approval.
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="leave-type">Leave Type</Label>
          <Select value={leaveType} onValueChange={setLeaveType}>
            <SelectTrigger id="leave-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ANNUAL">Annual Leave</SelectItem>
              <SelectItem value="SICK">Sick Leave</SelectItem>
              <SelectItem value="CASUAL">Casual Leave</SelectItem>
              <SelectItem value="MATERNITY">Maternity Leave</SelectItem>
              <SelectItem value="PATERNITY">Paternity Leave</SelectItem>
              <SelectItem value="COMPASSIONATE">Compassionate Leave</SelectItem>
              <SelectItem value="STUDY">Study Leave</SelectItem>
              <SelectItem value="UNPAID">Unpaid Leave</SelectItem>
            </SelectContent>
          </Select>
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
            placeholder="Provide a reason for your leave request..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
        </div>
        <DialogFooter>
          <Button type="submit" disabled={isPending}>
            <Send className="mr-2 h-4 w-4" />
            {isPending ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
