'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  User,
  Clock,
  CalendarOff,
  Star,
  RefreshCw,
  Building,
  Shield,
  MapPin,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getMyProfile } from '@/actions/hr.actions';
import type { SessionUser } from '@/types';

const attendanceStatusVariant: Record<string, 'success' | 'error' | 'warning' | 'info' | 'default'> = {
  PRESENT: 'success',
  LATE: 'warning',
  ABSENT: 'error',
  ON_LEAVE: 'info',
  HALF_DAY: 'warning',
};

const leaveStatusVariant: Record<string, 'success' | 'error' | 'warning' | 'secondary' | 'default'> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'error',
  CANCELLED: 'secondary',
};

interface MyProfileClientProps {
  user: SessionUser;
}

export function MyProfileClient({ user }: MyProfileClientProps) {
  const [profile, setProfile] = useState<any>(null);
  const [isPending, startTransition] = useTransition();

  const fetchProfile = () => {
    startTransition(async () => {
      try {
        const data = await getMyProfile();
        setProfile(data);
      } catch (error: any) {
        toast.error(error.message || 'Failed to load profile');
      }
    });
  };

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    return d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' });
  };

  const staff = profile?.staff;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <User className="h-6 w-6" />
            My Profile
          </h1>
          <p className="text-muted-foreground">
            View your personal information and records
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchProfile} disabled={isPending}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isPending ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {!profile && isPending && (
        <p className="text-center text-muted-foreground py-8">Loading...</p>
      )}

      {staff && (
        <>
          {/* Profile Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Personal Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Employee ID</p>
                  <p className="text-sm font-medium font-mono">{staff.employeeId}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Full Name</p>
                  <p className="text-sm font-medium">
                    {staff.firstName} {staff.middleName ? `${staff.middleName} ` : ''}{staff.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{staff.email}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{staff.phone || '-'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Department</p>
                    <p className="text-sm">{staff.department?.name || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Role</p>
                    <p className="text-sm">{staff.role?.name || '-'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Branch</p>
                    <p className="text-sm">{staff.branch?.name || '-'}</p>
                  </div>
                </div>
                {staff.supervisor && (
                  <div>
                    <p className="text-xs text-muted-foreground">Supervisor</p>
                    <p className="text-sm">
                      {staff.supervisor.firstName} {staff.supervisor.lastName} ({staff.supervisor.employeeId})
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground">Status</p>
                  <div className="mt-0.5">
                    <Badge variant={staff.status === 'ACTIVE' ? 'success' : 'secondary'}>
                      {staff.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Hire Date</p>
                  <p className="text-sm">{formatDate(staff.hireDate)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabs for Attendance, Leave, Performance */}
          <Tabs defaultValue="attendance">
            <TabsList>
              <TabsTrigger value="attendance" className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Attendance
              </TabsTrigger>
              <TabsTrigger value="leave" className="flex items-center gap-1">
                <CalendarOff className="h-4 w-4" />
                Leave
              </TabsTrigger>
              <TabsTrigger value="performance" className="flex items-center gap-1">
                <Star className="h-4 w-4" />
                Performance
              </TabsTrigger>
            </TabsList>

            {/* Attendance Tab */}
            <TabsContent value="attendance">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Recent Attendance (Last 30 Days)</CardTitle>
                </CardHeader>
                <CardContent>
                  {profile.recentAttendance.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm">No attendance records</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Clock In</TableHead>
                          <TableHead>Clock Out</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.recentAttendance.map((rec: any) => (
                          <TableRow key={rec.id}>
                            <TableCell>{formatDate(rec.date)}</TableCell>
                            <TableCell>{rec.clockIn ? formatTime(rec.clockIn) : '-'}</TableCell>
                            <TableCell>{rec.clockOut ? formatTime(rec.clockOut) : '-'}</TableCell>
                            <TableCell>
                              <Badge variant={attendanceStatusVariant[rec.status] || 'default'}>
                                {rec.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Leave Tab */}
            <TabsContent value="leave">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">My Leave Requests</CardTitle>
                </CardHeader>
                <CardContent>
                  {profile.leaveRequests.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm">No leave requests</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Start</TableHead>
                          <TableHead>End</TableHead>
                          <TableHead>Days</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Approver</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.leaveRequests.map((leave: any) => (
                          <TableRow key={leave.id}>
                            <TableCell className="font-medium">{leave.leaveType}</TableCell>
                            <TableCell>{formatDate(leave.startDate)}</TableCell>
                            <TableCell>{formatDate(leave.endDate)}</TableCell>
                            <TableCell>{leave.days}</TableCell>
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
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Performance Tab */}
            <TabsContent value="performance">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">My Performance Reviews</CardTitle>
                </CardHeader>
                <CardContent>
                  {profile.performanceReviews.length === 0 ? (
                    <p className="text-center text-muted-foreground py-6 text-sm">No performance reviews</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Period</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Rating</TableHead>
                          <TableHead>Reviewer</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {profile.performanceReviews.map((rev: any) => (
                          <TableRow key={rev.id}>
                            <TableCell className="font-medium">{rev.reviewPeriod}</TableCell>
                            <TableCell>{formatDate(rev.reviewDate)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                <span className="font-medium">{rev.overallRating.toFixed(1)}</span>
                                <span className="text-muted-foreground">/ 5.0</span>
                              </div>
                            </TableCell>
                            <TableCell>
                              {rev.reviewer
                                ? `${rev.reviewer.firstName} ${rev.reviewer.lastName}`
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  rev.status === 'ACKNOWLEDGED'
                                    ? 'success'
                                    : rev.status === 'SUBMITTED'
                                    ? 'warning'
                                    : 'secondary'
                                }
                              >
                                {rev.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
