import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import LoadingSpinner from '../components/LoadingSpinner';

export default function Savings() {
  const { data, isLoading } = useQuery({
    queryKey: ['savings-summary'],
    queryFn: async () => { const r = await api.get('/savings/summary'); return r.data.data; },
  });
  if (isLoading) return <div className="flex justify-center p-8"><LoadingSpinner /></div>;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Savings Accounts</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6"><p className="stat-value">{data?.activeAccounts || 0}</p><p className="stat-label">Active Accounts</p></div>
        <div className="card p-6"><p className="stat-value">{(data?.totalBalance || 0).toLocaleString()}</p><p className="stat-label">Total Balance (NGN)</p></div>
        <div className="card p-6"><p className="stat-value">{(data?.totalDeposits || 0).toLocaleString()}</p><p className="stat-label">Total Deposits (NGN)</p></div>
      </div>
    </div>
  );
}
