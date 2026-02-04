import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  BanknotesIcon,
  DocumentTextIcon,
  UserIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-800',
  PENDING_VERIFICATION: 'bg-yellow-100 text-yellow-800',
  VERIFIED: 'bg-blue-100 text-blue-800',
  PENDING_APPROVAL: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
  DISBURSED: 'bg-blue-100 text-blue-800',
  ACTIVE: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

export default function LoanDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasPermission, user } = useAuth();

  const { data: loan, isLoading } = useQuery({
    queryKey: ['loan', id],
    queryFn: async () => {
      const response = await api.get(`/loans/${id}`);
      return response.data.data;
    },
  });

  const submitForVerification = useMutation({
    mutationFn: () => api.post(`/loans/${id}/submit-verification`),
    onSuccess: () => {
      toast.success('Loan submitted for verification');
      queryClient.invalidateQueries({ queryKey: ['loan', id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit');
    },
  });

  const submitForApproval = useMutation({
    mutationFn: () => api.post(`/loans/${id}/submit-approval`),
    onSuccess: () => {
      toast.success('Loan submitted for approval');
      queryClient.invalidateQueries({ queryKey: ['loan', id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to submit');
    },
  });

  const approveLoan = useMutation({
    mutationFn: (data: { decision: string; comments?: string }) =>
      api.post(`/loans/${id}/approval`, data),
    onSuccess: () => {
      toast.success('Loan decision recorded');
      queryClient.invalidateQueries({ queryKey: ['loan', id] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Failed to process');
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!loan) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Loan not found</p>
      </div>
    );
  }

  const canSubmitForVerification =
    loan.status === 'DRAFT' &&
    hasPermission('LOANS:UPDATE') &&
    loan.createdById === user?.id;

  const canSubmitForApproval =
    loan.status === 'VERIFIED' && hasPermission('LOANS:UPDATE');

  const canApprove =
    loan.status === 'PENDING_APPROVAL' &&
    hasPermission('LOANS:APPROVE_L1') &&
    loan.createdById !== user?.id;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate('/loans')} className="btn-outline py-2">
          <ArrowLeftIcon className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{loan.loanNumber}</h1>
            <span
              className={clsx(
                'px-3 py-1 rounded-full text-sm font-medium',
                statusColors[loan.status]
              )}
            >
              {loan.status.replace(/_/g, ' ')}
            </span>
          </div>
          <p className="text-gray-500">
            {loan.customer.firstName} {loan.customer.lastName} ({loan.customer.customerNumber})
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {canSubmitForVerification && (
            <button
              onClick={() => submitForVerification.mutate()}
              disabled={submitForVerification.isPending}
              className="btn-primary"
            >
              Submit for Verification
            </button>
          )}
          {canSubmitForApproval && (
            <button
              onClick={() => submitForApproval.mutate()}
              disabled={submitForApproval.isPending}
              className="btn-primary"
            >
              Submit for Approval
            </button>
          )}
          {canApprove && (
            <>
              <button
                onClick={() =>
                  approveLoan.mutate({ decision: 'APPROVED', comments: 'Approved' })
                }
                disabled={approveLoan.isPending}
                className="btn-primary"
              >
                <CheckCircleIcon className="h-4 w-4 mr-1" />
                Approve
              </button>
              <button
                onClick={() =>
                  approveLoan.mutate({ decision: 'REJECTED', comments: 'Rejected' })
                }
                disabled={approveLoan.isPending}
                className="btn-danger"
              >
                <XCircleIcon className="h-4 w-4 mr-1" />
                Reject
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Loan Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium">Loan Details</h3>
            </div>
            <div className="card-body">
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-500">Product</dt>
                  <dd className="font-medium">{loan.product.name}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Principal Amount</dt>
                  <dd className="font-medium font-mono">
                    {formatCurrency(loan.principalAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Interest Rate</dt>
                  <dd className="font-medium">{loan.interestRate}% p.a.</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Tenure</dt>
                  <dd className="font-medium">{loan.tenure} months</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Total Interest</dt>
                  <dd className="font-medium font-mono">
                    {formatCurrency(loan.totalInterest)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Total Repayment</dt>
                  <dd className="font-medium font-mono">
                    {formatCurrency(loan.totalRepayment)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Monthly Instalment</dt>
                  <dd className="font-medium font-mono">
                    {formatCurrency(loan.monthlyInstalment)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Processing Fee</dt>
                  <dd className="font-medium font-mono">
                    {formatCurrency(loan.processingFee)}
                  </dd>
                </div>
              </dl>
              {loan.purpose && (
                <div className="mt-4 pt-4 border-t">
                  <dt className="text-sm text-gray-500">Purpose</dt>
                  <dd className="mt-1">{loan.purpose}</dd>
                </div>
              )}
            </div>
          </div>

          {/* Repayment Schedule */}
          {loan.schedule && loan.schedule.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-lg font-medium">Repayment Schedule</h3>
              </div>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Due Date</th>
                      <th>Principal</th>
                      <th>Interest</th>
                      <th>Total</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {loan.schedule.slice(0, 12).map((item: any) => (
                      <tr key={item.id}>
                        <td>{item.installmentNumber}</td>
                        <td>{new Date(item.dueDate).toLocaleDateString()}</td>
                        <td className="font-mono">{formatCurrency(item.principalDue)}</td>
                        <td className="font-mono">{formatCurrency(item.interestDue)}</td>
                        <td className="font-mono">{formatCurrency(item.totalDue)}</td>
                        <td>
                          <span
                            className={clsx(
                              'badge',
                              item.status === 'PAID'
                                ? 'badge-success'
                                : item.status === 'OVERDUE'
                                ? 'badge-danger'
                                : 'badge-gray'
                            )}
                          >
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Customer Info */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <UserIcon className="h-5 w-5" />
                Customer
              </h3>
            </div>
            <div className="card-body">
              <p className="font-medium">
                {loan.customer.firstName} {loan.customer.lastName}
              </p>
              <p className="text-sm text-gray-500">{loan.customer.customerNumber}</p>
              <p className="text-sm text-gray-500 mt-2">{loan.customer.phone}</p>
              {loan.customer.email && (
                <p className="text-sm text-gray-500">{loan.customer.email}</p>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <div className="card-header">
              <h3 className="text-lg font-medium flex items-center gap-2">
                <ClockIcon className="h-5 w-5" />
                Timeline
              </h3>
            </div>
            <div className="card-body">
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                  <div>
                    <p className="text-sm font-medium">Created</p>
                    <p className="text-xs text-gray-500">
                      {new Date(loan.applicationDate).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">
                      by {loan.createdBy.firstName} {loan.createdBy.lastName}
                    </p>
                  </div>
                </div>
                {loan.approvedAt && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                    <div>
                      <p className="text-sm font-medium">Approved</p>
                      <p className="text-xs text-gray-500">
                        {new Date(loan.approvedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
                {loan.disbursedAt && (
                  <div className="flex gap-3">
                    <div className="w-2 h-2 mt-2 rounded-full bg-green-500" />
                    <div>
                      <p className="text-sm font-medium">Disbursed</p>
                      <p className="text-xs text-gray-500">
                        {new Date(loan.disbursedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Approvals */}
          {loan.approvals && loan.approvals.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h3 className="text-lg font-medium">Approval History</h3>
              </div>
              <div className="card-body">
                <div className="space-y-3">
                  {loan.approvals.map((approval: any) => (
                    <div key={approval.id} className="p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span
                          className={clsx(
                            'badge',
                            approval.decision === 'APPROVED'
                              ? 'badge-success'
                              : 'badge-danger'
                          )}
                        >
                          {approval.decision}
                        </span>
                        <span className="text-xs text-gray-500">
                          Level {approval.level}
                        </span>
                      </div>
                      <p className="text-sm mt-2">
                        {approval.approver.firstName} {approval.approver.lastName}
                      </p>
                      {approval.comments && (
                        <p className="text-xs text-gray-500 mt-1">{approval.comments}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
  }).format(amount);
}
