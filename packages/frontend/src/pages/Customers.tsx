import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PlusIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import api from '../lib/api';
import { useAuth } from '../contexts/AuthContext';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Customers() {
  const { hasPermission } = useAuth();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['customers', search],
    queryFn: async () => {
      const response = await api.get('/customers', { params: { search, limit: 50 } });
      return response.data;
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        {hasPermission('CUSTOMERS:CREATE') && (
          <button className="btn-primary"><PlusIcon className="h-4 w-4 mr-1" /> New Customer</button>
        )}
      </div>
      <div className="card">
        <div className="card-header">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input type="text" placeholder="Search customers..." value={search} onChange={(e) => setSearch(e.target.value)} className="input pl-10 w-64" />
          </div>
        </div>
        {isLoading ? (
          <div className="p-8 flex justify-center"><LoadingSpinner /></div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead><tr><th>Customer #</th><th>Name</th><th>Phone</th><th>Type</th><th>Status</th></tr></thead>
              <tbody className="divide-y divide-gray-200">
                {data?.data?.map((c: any) => (
                  <tr key={c.id}><td>{c.customerNumber}</td><td>{c.firstName} {c.lastName}</td><td>{c.phone}</td><td>{c.customerType}</td><td><span className="badge badge-success">{c.status}</span></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
