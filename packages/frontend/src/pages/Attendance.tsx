import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClockIcon,
  ArrowRightOnRectangleIcon,
  ArrowLeftOnRectangleIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const statusColors: Record<string, string> = {
  PRESENT: 'bg-green-100 text-green-800',
  ABSENT: 'bg-red-100 text-red-800',
  LATE: 'bg-yellow-100 text-yellow-800',
  ON_LEAVE: 'bg-blue-100 text-blue-800',
  HALF_DAY: 'bg-orange-100 text-orange-800',
};

export default function Attendance() {
  const { user, hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setDate(new Date().getDate() - 7)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });

  // Get current attendance status
  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['attendance-status'],
    queryFn: async () => {
      const response = await api.get('/hr/attendance/status');
      return response.data.data;
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Get HR dashboard stats
  const { data: hrStats } = useQuery({
    queryKey: ['hr-dashboard'],
    queryFn: async () => {
      const response = await api.get('/hr/dashboard');
      return response.data.data;
    },
    enabled: hasPermission('STAFF:VIEW'),
  });

  // Get attendance records
  const { data: records, isLoading: recordsLoading } = useQuery({
    queryKey: ['attendance-records', dateRange],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('startDate', dateRange.startDate);
      params.append('endDate', dateRange.endDate);
      const response = await api.get('/hr/attendance?' + params.toString());
      return response.data.data;
    },
    enabled: hasPermission('STAFF:VIEW'),
  });

  const clockIn = useMutation({
    mutationFn: async () => {
      const location = await getCurrentLocation();
      const response = await api.post('/hr/attendance/clock-in', { location });
      return response.data;
    },
    onSuccess: () => {
      toast.success('Clocked in successfully');
      queryClient.invalidateQueries({ queryKey: ['attendance-status'] });
      queryClient.invalidateQueries({ queryKey: ['hr-dashboard'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to clock in');
    },
  });

  const clockOut = useMutation({
    mutationFn: () => api.post('/hr/attendance/clock-out'),
    onSuccess: (response) => {
      toast.success('Clocked out. Hours worked: ' + response.data.data.hoursWorked.toFixed(2));
      queryClient.invalidateQueries({ queryKey: ['attendance-status'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to clock out');
    },
  });

  const getCurrentLocation = (): Promise<string> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve('');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(position.coords.latitude + ',' + position.coords.longitude);
        },
        () => resolve(''),
        { timeout: 5000 }
      );
    });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Attendance</h1>
        <p className="text-gray-500">Track your attendance and view records</p>
      </div>

      {/* Clock In/Out Card */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-medium">Today's Status</h2>
            <p className="text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          {statusLoading ? (
            <LoadingSpinner size="sm" />
          ) : (
            <div className="flex items-center gap-4">
              {status?.clockInTime && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Clock In</p>
                  <p className="font-mono font-medium text-green-600">{formatTime(status.clockInTime)}</p>
                </div>
              )}
              {status?.clockOutTime && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Clock Out</p>
                  <p className="font-mono font-medium text-red-600">{formatTime(status.clockOutTime)}</p>
                </div>
              )}
              {!status?.isClockedIn && !status?.clockOutTime && (
                <button
                  onClick={() => clockIn.mutate()}
                  disabled={clockIn.isPending}
                  className="btn-primary px-6 py-3"
                >
                  <ArrowRightOnRectangleIcon className="h-5 w-5 mr-2" />
                  {clockIn.isPending ? 'Clocking In...' : 'Clock In'}
                </button>
              )}
              {status?.isClockedIn && (
                <button
                  onClick={() => clockOut.mutate()}
                  disabled={clockOut.isPending}
                  className="btn-danger px-6 py-3"
                >
                  <ArrowLeftOnRectangleIcon className="h-5 w-5 mr-2" />
                  {clockOut.isPending ? 'Clocking Out...' : 'Clock Out'}
                </button>
              )}
              {status?.status && (
                <span className={clsx('badge text-lg px-4 py-2', statusColors[status.status])}>
                  {status.status.replace(/_/g, ' ')}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {/* HR Dashboard Stats */}
      {hasPermission('STAFF:VIEW') && hrStats && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-gray-400" />
              <div>
                <p className="text-2xl font-bold">{hrStats.activeStaff}</p>
                <p className="text-sm text-gray-500">Active Staff</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <CheckCircleIcon className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold text-green-600">{hrStats.presentToday}</p>
                <p className="text-sm text-gray-500">Present Today</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <ExclamationCircleIcon className="h-8 w-8 text-red-500" />
              <div>
                <p className="text-2xl font-bold text-red-600">{hrStats.absentToday}</p>
                <p className="text-sm text-gray-500">Absent Today</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <ClockIcon className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold text-yellow-600">{hrStats.lateToday}</p>
                <p className="text-sm text-gray-500">Late Today</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <CalendarDaysIcon className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold text-blue-600">{hrStats.onLeave}</p>
                <p className="text-sm text-gray-500">On Leave</p>
              </div>
            </div>
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-3">
              <UserGroupIcon className="h-8 w-8 text-gray-400" />
              <div>
                <p className="text-2xl font-bold">{hrStats.totalStaff}</p>
                <p className="text-sm text-gray-500">Total Staff</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Department Breakdown */}
      {hasPermission('STAFF:VIEW') && hrStats?.byDepartment && (
        <div className="card">
          <div className="card-header">
            <h3 className="text-lg font-medium">Staff by Department</h3>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {hrStats.byDepartment.map((dept: any) => (
                <div key={dept.department} className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-lg font-bold">{dept.count}</p>
                  <p className="text-sm text-gray-500">{dept.department}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Attendance Records */}
      {hasPermission('STAFF:VIEW') && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-lg font-medium">Attendance Records</h3>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="input py-1"
              />
              <span className="text-gray-400">to</span>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="input py-1"
              />
            </div>
          </div>
          <div className="table-container">
            {recordsLoading ? (
              <div className="flex items-center justify-center h-32">
                <LoadingSpinner size="lg" />
              </div>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>Clock In</th>
                    <th>Clock Out</th>
                    <th>Status</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {records?.map((record: any) => (
                    <tr key={record.id}>
                      <td>{new Date(record.date).toLocaleDateString()}</td>
                      <td>
                        <div>
                          <p className="font-medium">{record.staff?.firstName} {record.staff?.lastName}</p>
                          <p className="text-xs text-gray-500">{record.staff?.employeeId}</p>
                        </div>
                      </td>
                      <td className="font-mono">
                        {record.clockIn ? formatTime(record.clockIn) : '-'}
                      </td>
                      <td className="font-mono">
                        {record.clockOut ? formatTime(record.clockOut) : '-'}
                      </td>
                      <td>
                        <span className={clsx('badge', statusColors[record.status])}>
                          {record.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="text-sm text-gray-500">
                        {record.location || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
