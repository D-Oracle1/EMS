import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import clsx from 'clsx';
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
  ACTIVE: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  CLOSED: 'bg-gray-100 text-gray-800',
};

export default function Loans() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['loans', page, search],
    queryFn: async () => {
      const response = await api.get('/loans', { params: { page, limit: 20, search } });
      return response.data;
    },
  });

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Loans</h1>
        {hasPermission('LOANS:CREATE') && (
          <Link to="/loans/new" className="btn-primary">
            <PlusIcon className="h-4 w-4 mr-1" /> New Loan
          </Link>
        )}
      </div>

      <div className="card">
        <div className="card-header">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search loans..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-10 w-64"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Loan #</th>
                  <th>Customer</th>
                  <th>Product</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {data?.data?.map((loan: any) => (
                  <tr key={loan.id} className="hover:bg-gray-50">
                    <td>
                      <Link to={`/loans/${loan.id}`} className="text-primary-600 hover:underline font-medium">
                        {loan.loanNumber}
                      </Link>
                    </td>
                    <td>{loan.customer.firstName} {loan.customer.lastName}</td>
                    <td>{loan.product.name}</td>
                    <td className="font-mono">{formatCurrency(loan.principalAmount)}</td>
                    <td>
                      <span className={clsx('badge', statusColors[loan.status])}>
                        {loan.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td>{new Date(loan.applicationDate).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {data?.meta && (
          <div className="card-footer flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing {((page - 1) * 20) + 1} to {Math.min(page * 20, data.meta.total)} of {data.meta.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-outline py-1 px-3"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= data.meta.totalPages}
                className="btn-outline py-1 px-3"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
