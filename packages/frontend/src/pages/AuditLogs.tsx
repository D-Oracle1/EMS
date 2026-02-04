import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ShieldCheckIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ArrowPathIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const actionColors: Record<string, string> = {
  CREATE: 'bg-green-100 text-green-800',
  UPDATE: 'bg-blue-100 text-blue-800',
  DELETE: 'bg-red-100 text-red-800',
  LOGIN: 'bg-purple-100 text-purple-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
  APPROVE: 'bg-green-100 text-green-800',
  REJECT: 'bg-red-100 text-red-800',
  VIEW: 'bg-gray-100 text-gray-600',
  EXPORT: 'bg-yellow-100 text-yellow-800',
};

export default function AuditLogs() {
  const { hasPermission } = useAuth();
  const [filters, setFilters] = useState({
    entityType: '',
    action: '',
    userId: '',
    startDate: '',
    endDate: '',
    search: '',
  });
  const [page, setPage] = useState(1);
  const [selectedLog, setSelectedLog] = useState<any>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', filters, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append('page', page.toString());
      params.append('limit', '50');
      if (filters.entityType) params.append('entityType', filters.entityType);
      if (filters.action) params.append('action', filters.action);
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      if (filters.search) params.append('search', filters.search);
      const response = await api.get('/accounting/audit-logs?' + params.toString());
      return response.data;
    },
    enabled: hasPermission('AUDIT:VIEW'),
  });

  if (!hasPermission('AUDIT:VIEW')) {
    return (
      <div className="text-center py-12">
        <ShieldCheckIcon className="h-12 w-12 text-gray-400 mx-auto" />
        <p className="mt-4 text-gray-500">You don't have permission to view audit logs.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-gray-500">Complete audit trail of all system activities</p>
        </div>
        <button onClick={() => refetch()} className="btn-outline">
          <ArrowPathIcon className="h-5 w-5 mr-2" />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex items-center gap-2 mb-4">
          <FunnelIcon className="h-5 w-5 text-gray-400" />
          <span className="font-medium">Filters</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="relative">
            <MagnifyingGlassIcon className="h-5 w-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by description..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="input pl-10 w-full"
            />
          </div>
          <select
            value={filters.entityType}
            onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
            className="input"
          >
            <option value="">All Entity Types</option>
            <option value="CUSTOMER">Customer</option>
            <option value="LOAN">Loan</option>
            <option value="SAVINGS_ACCOUNT">Savings Account</option>
            <option value="FIXED_DEPOSIT">Fixed Deposit</option>
            <option value="JOURNAL_ENTRY">Journal Entry</option>
            <option value="STAFF">Staff</option>
            <option value="USER_SESSION">User Session</option>
          </select>
          <select
            value={filters.action}
            onChange={(e) => setFilters({ ...filters, action: e.target.value })}
            className="input"
          >
            <option value="">All Actions</option>
            <option value="CREATE">Create</option>
            <option value="UPDATE">Update</option>
            <option value="DELETE">Delete</option>
            <option value="LOGIN">Login</option>
            <option value="LOGOUT">Logout</option>
            <option value="APPROVE">Approve</option>
            <option value="REJECT">Reject</option>
            <option value="VIEW">View</option>
            <option value="EXPORT">Export</option>
          </select>
          <div className="flex gap-2">
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
              className="input flex-1"
              placeholder="From"
            />
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
              className="input flex-1"
              placeholder="To"
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <button
            onClick={() => setFilters({
              entityType: '',
              action: '',
              userId: '',
              startDate: '',
              endDate: '',
              search: '',
            })}
            className="text-sm text-primary-600 hover:text-primary-700"
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* Audit Log Table */}
      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="card">
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>User</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Description</th>
                  <th>IP Address</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data?.data?.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap text-sm">
                      <div>{new Date(log.createdAt).toLocaleDateString()}</div>
                      <div className="text-gray-500">{new Date(log.createdAt).toLocaleTimeString()}</div>
                    </td>
                    <td>
                      <div className="text-sm font-medium">
                        {log.user?.firstName} {log.user?.lastName}
                      </div>
                      <div className="text-xs text-gray-500">{log.user?.email}</div>
                    </td>
                    <td>
                      <span className={clsx('badge', actionColors[log.action] || 'bg-gray-100 text-gray-800')}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <div className="text-sm">{log.entityType}</div>
                      <div className="text-xs text-gray-500 font-mono">{log.entityId}</div>
                    </td>
                    <td className="max-w-xs truncate text-sm" title={log.description}>
                      {log.description}
                    </td>
                    <td className="text-sm font-mono text-gray-500">{log.ipAddress}</td>
                    <td>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-primary-600 hover:text-primary-700"
                      >
                        <EyeIcon className="h-5 w-5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data?.pagination && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <div className="text-sm text-gray-500">
                Showing {((page - 1) * 50) + 1} to {Math.min(page * 50, data.pagination.total)} of {data.pagination.total} entries
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(page - 1)}
                  disabled={page === 1}
                  className="btn-outline py-1 px-3 text-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setPage(page + 1)}
                  disabled={page >= data.pagination.totalPages}
                  className="btn-outline py-1 px-3 text-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full p-6 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-medium mb-4">Audit Log Details</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-500">Timestamp</p>
                  <p className="font-medium">{new Date(selectedLog.createdAt).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">IP Address</p>
                  <p className="font-medium font-mono">{selectedLog.ipAddress || 'N/A'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">User</p>
                  <p className="font-medium">
                    {selectedLog.user?.firstName} {selectedLog.user?.lastName}
                  </p>
                  <p className="text-xs text-gray-500">{selectedLog.user?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Action</p>
                  <span className={clsx('badge', actionColors[selectedLog.action])}>
                    {selectedLog.action}
                  </span>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Entity Type</p>
                  <p className="font-medium">{selectedLog.entityType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Entity ID</p>
                  <p className="font-medium font-mono">{selectedLog.entityId}</p>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500">Description</p>
                <p className="bg-gray-50 p-3 rounded mt-1">{selectedLog.description}</p>
              </div>
              {selectedLog.oldValues && (
                <div>
                  <p className="text-sm text-gray-500">Previous Values</p>
                  <pre className="bg-red-50 p-3 rounded mt-1 text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.newValues && (
                <div>
                  <p className="text-sm text-gray-500">New Values</p>
                  <pre className="bg-green-50 p-3 rounded mt-1 text-xs overflow-x-auto">
                    {JSON.stringify(selectedLog.newValues, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.userAgent && (
                <div>
                  <p className="text-sm text-gray-500">User Agent</p>
                  <p className="text-xs text-gray-600 bg-gray-50 p-2 rounded mt-1 break-all">
                    {selectedLog.userAgent}
                  </p>
                </div>
              )}
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setSelectedLog(null)} className="btn-outline">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
