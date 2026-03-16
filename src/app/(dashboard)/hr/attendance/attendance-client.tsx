'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  Clock,
  LogIn,
  LogOut,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Calendar,
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
import { formatDate, formatDateTime } from '@/lib/utils';
import {
  clockIn,
  clockOut,
  getAttendanceStatus,
  getAttendanceRecords,
} from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

const attendanceStatusVariant: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'error',
  ON_LEAVE: 'info',
  HALF_DAY: 'warning',
};

interface AttendanceClientProps {
  user: SessionUser;
}

export function AttendanceClient({ user }: AttendanceClientProps) {
  const [status, setStatus] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isPending, startTransition] = useTransition();

  const isManager = user.permissions.includes('HR:STAFF_READ');
  const isSystemAdmin = user.roleCode === 'SUPER_ADMIN';

  const fetchStatus = () => {
    startTransition(async () => {
      try {
        const result = await getAttendanceStatus();
        setStatus(result);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load attendance status');
      }
    });
  };

  const fetchRecords = () => {
    if (!isManager && !isSystemAdmin) return;
    startTransition(async () => {
      try {
        const result = await getAttendanceRecords({
          startDate: startDate || undefined,
          endDate: endDate || undefined,
        });
        setRecords(result);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load attendance records');
      }
    });
  };

  useEffect(() => {
    if (!isSystemAdmin) fetchStatus();
    if (isManager || isSystemAdmin) fetchRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleClockIn = () => {
    startTransition(async () => {
      const result = await clockIn();
      if (result.success) {
        toast.success(result.message);
        fetchStatus();
      } else {
        toast.error(result.error || 'Clock in failed');
      }
    });
  };

  const handleClockOut = () => {
    startTransition(async () => {
      const result = await clockOut();
      if (result.success) {
        toast.success(result.message);
        fetchStatus();
      } else {
        toast.error(result.error || 'Clock out failed');
      }
    });
  };

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Attendance</h1>
        <p className="text-muted-foreground">
          {isSystemAdmin ? 'View all staff attendance records' : 'Track your daily attendance'}
        </p>
      </div>

      {/* Clock In/Out Card - Hidden for System Admin */}
      {!isSystemAdmin && <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Today&apos;s Attendance
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Status:</span>
                {status?.status ? (
                  <Badge variant={attendanceStatusVariant[status.status] || 'default'}>
                    {status.status}
                  </Badge>
                ) : (
                  <Badge variant="secondary">NOT CLOCKED IN</Badge>
                )}
              </div>
              {status?.clockIn && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Clock In:</span>
                  <span className="text-sm font-medium">{formatTime(status.clockIn)}</span>
                </div>
              )}
              {status?.clockOut && (
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Clock Out:</span>
                  <span className="text-sm font-medium">{formatTime(status.clockOut)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              {!status?.isClockedIn && !status?.clockOut && (
                <Button onClick={handleClockIn} disabled={isPending}>
                  <LogIn className="mr-2 h-4 w-4" />
                  {isPending ? 'Processing...' : 'Clock In'}
                </Button>
              )}
              {status?.isClockedIn && (
                <Button onClick={handleClockOut} variant="outline" disabled={isPending}>
                  <LogOut className="mr-2 h-4 w-4" />
                  {isPending ? 'Processing...' : 'Clock Out'}
                </Button>
              )}
              {status?.clockOut && (
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle className="h-5 w-5" />
                  <span className="text-sm font-medium">Day Complete</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>}

      {/* Attendance Records (Managers & System Admin) */}
      {(isManager || isSystemAdmin) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Attendance Records
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3 mb-4">
              <div className="space-y-1">
                <Label htmlFor="att-start" className="text-xs">Start Date</Label>
                <Input
                  id="att-start"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="att-end" className="text-xs">End Date</Label>
                <Input
                  id="att-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[160px]"
                />
              </div>
              <Button variant="outline" onClick={fetchRecords} disabled={isPending}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
                Filter
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      {isPending ? 'Loading...' : 'No attendance records found'}
                    </TableCell>
                  </TableRow>
                )}
                {records.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div className="font-medium">
                        {record.staff.firstName} {record.staff.lastName}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {record.staff.employeeId}
                      </div>
                    </TableCell>
                    <TableCell>{formatDate(record.date)}</TableCell>
                    <TableCell>{record.clockIn ? formatTime(record.clockIn) : '-'}</TableCell>
                    <TableCell>{record.clockOut ? formatTime(record.clockOut) : '-'}</TableCell>
                    <TableCell>
                      <Badge variant={attendanceStatusVariant[record.status] || 'default'}>
                        {record.status}
                      </Badge>
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
