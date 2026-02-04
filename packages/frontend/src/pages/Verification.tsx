import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPinIcon,
  CameraIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  UserIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const statusColors: Record<string, string> = {
  ASSIGNED: 'bg-yellow-100 text-yellow-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-green-100 text-green-800',
  CANCELLED: 'bg-gray-100 text-gray-800',
};

const priorityColors: Record<string, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  NORMAL: 'bg-blue-100 text-blue-600',
  HIGH: 'bg-orange-100 text-orange-600',
  URGENT: 'bg-red-100 text-red-600',
};

export default function Verification() {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [filters, setFilters] = useState({ status: '', taskType: '' });

  const { data: tasks, isLoading } = useQuery({
    queryKey: ['verification-tasks', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.taskType) params.append('taskType', filters.taskType);
      const response = await api.get('/verification/tasks/my?' + params.toString());
      return response.data;
    },
    enabled: hasPermission('VERIFICATION:VIEW'),
  });

  const { data: stats } = useQuery({
    queryKey: ['verification-stats'],
    queryFn: async () => {
      const response = await api.get('/verification/stats/my');
      return response.data.data;
    },
    enabled: hasPermission('VERIFICATION:VIEW'),
  });

  const startTask = useMutation({
    mutationFn: (taskId: string) => api.post('/verification/tasks/' + taskId + '/start'),
    onSuccess: () => {
      toast.success('Verification started');
      queryClient.invalidateQueries({ queryKey: ['verification-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['verification-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to start verification');
    },
  });

  const submitVerification = useMutation({
    mutationFn: (data: { taskId: string; findings: string; recommendation: string; gpsCoordinates?: string }) =>
      api.post('/verification/tasks/' + data.taskId + '/submit', data),
    onSuccess: () => {
      toast.success('Verification submitted successfully');
      setShowSubmitModal(false);
      setSelectedTask(null);
      queryClient.invalidateQueries({ queryKey: ['verification-tasks'] });
      queryClient.invalidateQueries({ queryKey: ['verification-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit');
    },
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    submitVerification.mutate({
      taskId: selectedTask.id,
      findings: formData.get('findings') as string,
      recommendation: formData.get('recommendation') as string,
      gpsCoordinates: formData.get('gpsCoordinates') as string,
    });
  };

  if (!hasPermission('VERIFICATION:VIEW')) {
    return (
      <div className="text-center py-12">
        <ExclamationTriangleIcon className="h-12 w-12 text-yellow-500 mx-auto" />
        <p className="mt-4 text-gray-500">You don't have permission to view verification tasks.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Verification Queue</h1>
        <p className="text-gray-500">Manage and complete field verification tasks</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4">
            <p className="text-sm text-gray-500">Pending</p>
            <p className="text-2xl font-bold text-yellow-600">{stats.pendingTasks}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">In Progress</p>
            <p className="text-2xl font-bold text-blue-600">{stats.inProgressTasks}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Completed Today</p>
            <p className="text-2xl font-bold text-green-600">{stats.completedToday}</p>
          </div>
          <div className="card p-4">
            <p className="text-sm text-gray-500">Avg. Time (hrs)</p>
            <p className="text-2xl font-bold text-gray-600">{stats.averageCompletionTime}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-4">
          <select
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            className="input w-40"
          >
            <option value="">All Status</option>
            <option value="ASSIGNED">Assigned</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="COMPLETED">Completed</option>
          </select>
          <select
            value={filters.taskType}
            onChange={(e) => setFilters({ ...filters, taskType: e.target.value })}
            className="input w-48"
          >
            <option value="">All Types</option>
            <option value="ADDRESS_VERIFICATION">Address Verification</option>
            <option value="EMPLOYMENT_VERIFICATION">Employment Verification</option>
            <option value="BUSINESS_VERIFICATION">Business Verification</option>
            <option value="COLLATERAL_INSPECTION">Collateral Inspection</option>
          </select>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-4">
        {tasks?.data?.map((task: any) => (
          <div key={task.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={clsx('badge', priorityColors[task.priority])}>
                    {task.priority}
                  </span>
                  <span className={clsx('badge', statusColors[task.status])}>
                    {task.status.replace(/_/g, ' ')}
                  </span>
                  <span className="text-sm text-gray-500">
                    {task.taskType.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-2">
                  <p className="font-medium">{task.referenceType}: {task.referenceId}</p>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <MapPinIcon className="h-4 w-4" />
                    <span>{task.address}</span>
                    {task.city && <span>• {task.city}</span>}
                  </div>
                  {task.dueDate && (
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                      <ClockIcon className="h-4 w-4" />
                      <span>Due: {new Date(task.dueDate).toLocaleDateString()}</span>
                    </div>
                  )}
                  {task.instructions && (
                    <p className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                      {task.instructions}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                {task.status === 'ASSIGNED' && hasPermission('VERIFICATION:CONDUCT') && (
                  <button
                    onClick={() => startTask.mutate(task.id)}
                    disabled={startTask.isPending}
                    className="btn-primary text-sm"
                  >
                    Start
                  </button>
                )}
                {task.status === 'IN_PROGRESS' && hasPermission('VERIFICATION:CONDUCT') && (
                  <button
                    onClick={() => {
                      setSelectedTask(task);
                      setShowSubmitModal(true);
                    }}
                    className="btn-success text-sm"
                  >
                    <CheckCircleIcon className="h-4 w-4 mr-1" />
                    Complete
                  </button>
                )}
                {task.status === 'COMPLETED' && task.findings && (
                  <button
                    onClick={() => setSelectedTask(task)}
                    className="btn-outline text-sm"
                  >
                    View Report
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {(!tasks?.data || tasks.data.length === 0) && (
          <div className="card p-12 text-center">
            <CheckCircleIcon className="h-12 w-12 text-gray-400 mx-auto" />
            <p className="mt-4 text-gray-500">No verification tasks found.</p>
          </div>
        )}
      </div>

      {/* Submit Verification Modal */}
      {showSubmitModal && selectedTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-medium mb-4">Submit Verification Report</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Task: {selectedTask.taskType.replace(/_/g, ' ')}
                </label>
                <p className="text-sm text-gray-500">{selectedTask.address}</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  GPS Coordinates
                </label>
                <input
                  type="text"
                  name="gpsCoordinates"
                  placeholder="e.g., 6.5244,3.3792"
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Findings *
                </label>
                <textarea
                  name="findings"
                  required
                  rows={4}
                  placeholder="Describe what you found during the verification..."
                  className="input w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recommendation *
                </label>
                <select name="recommendation" required className="input w-full">
                  <option value="">Select recommendation</option>
                  <option value="VERIFIED">Verified - All information confirmed</option>
                  <option value="PARTIALLY_VERIFIED">Partially Verified - Some discrepancies</option>
                  <option value="NOT_VERIFIED">Not Verified - Information does not match</option>
                  <option value="UNABLE_TO_VERIFY">Unable to Verify - Could not access location</option>
                </select>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowSubmitModal(false);
                    setSelectedTask(null);
                  }}
                  className="btn-outline"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitVerification.isPending}
                  className="btn-primary"
                >
                  {submitVerification.isPending ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Report Modal */}
      {selectedTask && !showSubmitModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-lg font-medium mb-4">Verification Report</h3>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-gray-500">Task Type</p>
                <p className="font-medium">{selectedTask.taskType.replace(/_/g, ' ')}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Address</p>
                <p className="font-medium">{selectedTask.address}</p>
              </div>
              {selectedTask.gpsCoordinates && (
                <div>
                  <p className="text-sm text-gray-500">GPS Coordinates</p>
                  <p className="font-medium font-mono">{selectedTask.gpsCoordinates}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-gray-500">Findings</p>
                <p className="bg-gray-50 p-3 rounded mt-1">{selectedTask.findings}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Recommendation</p>
                <span className={clsx(
                  'badge mt-1',
                  selectedTask.recommendation === 'VERIFIED' ? 'badge-success' :
                  selectedTask.recommendation === 'NOT_VERIFIED' ? 'badge-danger' : 'badge-warning'
                )}>
                  {selectedTask.recommendation}
                </span>
              </div>
              <div>
                <p className="text-sm text-gray-500">Completed At</p>
                <p className="font-medium">
                  {selectedTask.completedAt && new Date(selectedTask.completedAt).toLocaleString()}
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end">
              <button onClick={() => setSelectedTask(null)} className="btn-outline">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
